// @vitest-environment jsdom
// Unit tests for the routing layer: registry build and the chHeat/chAccent
// channel-temperature helpers. navigate lives in channels-navigate.test.js and
// applyInitialChannel (hash → initial channel fallback chain) in channels-hash.test.js.
//
// DIVERGENCE FROM AUDIT #1442: the finding states getCurrentChannelId() "reads
// location.hash with a fallback to localStorage" and that navigate() "updates
// localStorage". Neither is true of the current code. getCurrentChannelId()
// returns a module-private `currentId` cursor that navigate() sets; there is NO
// localStorage anywhere in channels.js (only boot.js touches localStorage). The
// real fallback chain lives in parseHash(): location.hash → 'home' default, with
// navigate() coercing unknown ids to 'home'. These tests cover the routing
// fallbacks that actually exist.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appData, proj, seedData, setupDom, initCapturing } from './channels-test-helpers.js';
/** @import { AppData } from './types.js' */

// channels.js pulls in DOM-heavy renderers + a sibling data adapter. Stub them so
// these tests exercise the routing/registry logic channels.js OWNS, not its deps.
vi.mock('./data.js', () => ({ entriesFor: vi.fn(() => []) }));
vi.mock('./pinned.js', () => ({ renderPinned: vi.fn(), renderHeroLine: vi.fn() }));
vi.mock('./feed.js', () => ({ renderFeed: vi.fn() }));
// Run the transition callback synchronously so the render branch is observable.
vi.mock('./transition.js', () => ({ playSwitchTransition: vi.fn((/** @type {(() => void) | undefined} */ cb) => cb && cb()) }));
vi.mock('./sidebar.js', () => ({ setActiveChannel: vi.fn() }));

/** @type {typeof import('./channels.js')} */
let channels;

const capture = (/** @type {AppData} */ data) => initCapturing(channels, data);
const seed = () => capture(seedData());
/** A channel the test expects to exist. */
const ch = (/** @type {string} */ id) => {
  const c = channels.channelById(id);
  if (!c) throw new Error(`no channel ${id}`);
  return c;
};

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks(); // mock instances persist across resetModules — reset call history
  setupDom();
  window.history.replaceState(null, '', '/'); // clear any hash from a prior test (no event)
  channels = await import('./channels.js');
});

// ---- getCurrentChannelId -------------------------------------------------

describe('getCurrentChannelId', () => {
  it('returns null before any navigation', () => {
    expect(channels.getCurrentChannelId()).toBeNull();
  });

  it('reflects the most recently navigated channel', () => {
    seed();
    channels.navigate('explorer');
    expect(channels.getCurrentChannelId()).toBe('explorer');
  });
});

// ---- chHeat --------------------------------------------------------------

describe('chHeat', () => {
  it('project channel returns its project.heat', () => {
    capture(appData([proj({ channel: 'explorer', heat: 0.73 })]));
    expect(channels.chHeat('explorer')).toBe(0.73);
  });

  it('home (no registry entry) → 1.0', () => {
    expect(channels.chHeat('home')).toBe(1.0);
  });

  it('home present in registry but without a project → still 1.0', () => {
    capture(appData([])); // home added as a project-less system channel
    expect(channels.chHeat('home')).toBe(1.0);
  });

  it('activity → 0.85', () => {
    expect(channels.chHeat('activity')).toBe(0.85);
  });

  it('unknown id → 0.5 fallback', () => {
    expect(channels.chHeat('whatever')).toBe(0.5);
  });

  it('project.heat wins over the id-based branches (precedence)', () => {
    // A project literally named "home" overwrites the system-home entry, so the
    // registry's home entry carries a project — chHeat must use project.heat,
    // proving the project check runs before the id === 'home' branch.
    capture(appData([proj({ channel: 'home', heat: 0.2 })]));
    expect(channels.chHeat('home')).toBe(0.2);
  });
});

// ---- chAccent ------------------------------------------------------------
// Exact strings verified against the live formula; see the math in channels.js.

describe('chAccent', () => {
  it('maps the 0.5 baseline (unknown id) to the base accent', () => {
    expect(channels.chAccent('unknown')).toBe('oklch(0.620 0.140 78.0)');
  });

  it('maps home (heat 1.0) to the hot end', () => {
    expect(channels.chAccent('home')).toBe('oklch(0.700 0.165 71.0)');
  });

  it('maps activity (heat 0.85) per the L/C/H formula', () => {
    expect(channels.chAccent('activity')).toBe('oklch(0.676 0.158 73.1)');
  });

  it('hotter channel yields higher lightness than a colder one', () => {
    capture(appData([proj({ channel: 'hot', heat: 1 }), proj({ channel: 'cold', heat: 0 })]));
    const lightness = (/** @type {string} */ s) => parseFloat(/** @type {RegExpMatchArray} */ (s.match(/oklch\(([\d.]+)/))[1]);
    expect(lightness(channels.chAccent('hot'))).toBeGreaterThan(lightness(channels.chAccent('cold')));
  });
});

// ---- initChannels --------------------------------------------------------

describe('initChannels', () => {
  it('builds the channel registry as [home, ...projects, activity]', () => {
    capture(appData([
      proj({ channel: 'a', description: 'da' }),
      proj({ channel: 'b', description: 'db' }),
    ]));
    expect(channels.getChannels().map((c) => c.id)).toEqual(['home', 'a', 'b', 'activity']);
    expect(channels.getChannels()[0]?.group).toBe('system');
    expect(channels.getChannels()[1]?.group).toBe('projects');
    expect(ch('a').topic).toBe('da');
    expect(ch('a').project).toBeTruthy();
  });

  it('fills a blank topic from the name, then the channel', () => {
    capture(appData([
      proj({ channel: 'helm', description: '', name: 'Helm' }),
      proj({ channel: 'bare', description: '' }),
    ]));
    expect(ch('helm').topic).toBe('Helm');
    expect(ch('bare').topic).toBe('bare');
  });

  it('re-init replaces the registry, dropping stale channels', () => {
    capture(appData([proj({ channel: 'a', description: 'da' })]));
    expect(channels.channelById('a')).toBeTruthy();
    capture(appData([proj({ channel: 'b', description: 'db' })]));
    expect(channels.channelById('a')).toBeUndefined(); // stale channel gone after rebuild
    expect(channels.channelById('b')).toBeTruthy();
  });

  it('wires hashchange so a hash change drives navigate(parseHash, fromHash)', () => {
    const handler = capture(appData([proj({ channel: 'explorer', description: 'explorer topic' })]));
    expect(typeof handler).toBe('function');
    window.history.replaceState(null, '', '#/explorer'); // browser would do this, then fire
    /** @type {() => void} */ (handler)();
    expect(channels.getCurrentChannelId()).toBe('explorer');
    expect(location.hash).toBe('#/explorer'); // fromHash path leaves the hash untouched
  });
});

