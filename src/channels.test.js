// @vitest-environment jsdom
// Unit tests for the routing layer: registry build, navigate orchestration, and
// the chHeat/chAccent channel-temperature helpers. applyInitialChannel (the
// hash → initial channel fallback chain) lives in channels-hash.test.js.
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

// channels.js pulls in DOM-heavy renderers + a sibling data adapter. Stub them so
// these tests exercise the routing/registry logic channels.js OWNS, not its deps.
vi.mock('./data.js', () => ({ entriesFor: vi.fn(() => []) }));
vi.mock('./pinned.js', () => ({ renderPinned: vi.fn(), renderHeroLine: vi.fn() }));
vi.mock('./feed.js', () => ({ renderFeed: vi.fn() }));
// Run the transition callback synchronously so the render branch is observable.
vi.mock('./transition.js', () => ({ playSwitchTransition: vi.fn((cb) => cb && cb()) }));
vi.mock('./sidebar.js', () => ({ setActiveChannel: vi.fn() }));

// Re-imported fresh per test (see beforeEach) so module state — currentId plus
// the private channel registry — starts clean and the mocked deps resolve to the
// same fresh instances channels.js sees.
let channels, sidebar, pinned, feed, transition;

// navigate() writes directly to these DOM nodes; recreate them each test.
function setupDom() {
  document.body.replaceChildren();
  for (const id of ['pane', 'topic-hash', 'topic-text', 'topic-meta']) {
    const el = document.createElement('span');
    el.id = id;
    document.body.appendChild(el);
  }
}

// Seed the registry the way production does — through initChannels — but capture
// the hashchange listener so it doesn't leak across tests. initChannels always
// frames the list as [home, ...projects, activity], so one project yields the
// home/explorer/activity trio these navigate-direct tests rely on.
function seed() {
  initCapturing({
    projects: [{ channel: 'explorer', description: 'explorer topic', heat: 0.7 }],
    entries: [],
  });
}

// Call initChannels but capture (and discard) the hashchange handler instead of
// registering it, so no real listener leaks across tests. Returns the handler.
function initCapturing(data) {
  let handler;
  const spy = vi.spyOn(window, 'addEventListener').mockImplementation((type, fn) => {
    if (type === 'hashchange') handler = fn;
  });
  channels.initChannels(data);
  spy.mockRestore();
  return handler;
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks(); // mock instances persist across resetModules — reset call history
  setupDom();
  window.history.replaceState(null, '', '/'); // clear any hash from a prior test (no event)
  channels = await import('./channels.js');
  sidebar = await import('./sidebar.js');
  pinned = await import('./pinned.js');
  feed = await import('./feed.js');
  transition = await import('./transition.js');
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
    initCapturing({ projects: [{ channel: 'explorer', heat: 0.73 }], entries: [] });
    expect(channels.chHeat('explorer')).toBe(0.73);
  });

  it('home (no registry entry) → 1.0', () => {
    expect(channels.chHeat('home')).toBe(1.0);
  });

  it('home present in registry but without a project → still 1.0', () => {
    initCapturing({ projects: [], entries: [] }); // home added as a project-less system channel
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
    initCapturing({ projects: [{ channel: 'home', heat: 0.2 }], entries: [] });
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
    initCapturing({ projects: [{ channel: 'hot', heat: 1 }, { channel: 'cold', heat: 0 }], entries: [] });
    const lightness = (s) => parseFloat(s.match(/oklch\(([\d.]+)/)[1]);
    expect(lightness(channels.chAccent('hot'))).toBeGreaterThan(lightness(channels.chAccent('cold')));
  });
});

// ---- navigate ------------------------------------------------------------

describe('navigate', () => {
  it('sets location.hash to #/<id> and advances currentId when not fromHash', () => {
    seed();
    channels.navigate('explorer');
    expect(location.hash).toBe('#/explorer');
    expect(channels.getCurrentChannelId()).toBe('explorer');
  });

  it('does NOT rewrite location.hash when fromHash:true', () => {
    seed();
    window.history.replaceState(null, '', '/'); // empty hash
    channels.navigate('explorer', { fromHash: true });
    expect(location.hash).toBe('');
    expect(channels.getCurrentChannelId()).toBe('explorer');
  });

  it('coerces an unknown id to home', () => {
    seed();
    channels.navigate('ghost');
    expect(channels.getCurrentChannelId()).toBe('home');
    expect(location.hash).toBe('#/home');
  });

  // Ids come from the URL hash; inherited Object keys must not pass as channels.
  it.each(['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'])(
    'coerces the inherited Object key %s to home',
    (id) => {
      seed();
      expect(channels.channelById(id)).toBeUndefined();
      channels.navigate(id);
      expect(channels.getCurrentChannelId()).toBe('home');
      expect(location.hash).toBe('#/home');
      expect(document.getElementById('topic-hash').textContent).toBe('#home');
      expect(sidebar.setActiveChannel).toHaveBeenCalledWith('home');
    },
  );

  it('a project really named "constructor" is still reachable', () => {
    initCapturing({ projects: [{ channel: 'constructor', description: 'c topic', heat: 0.5 }], entries: [] });
    channels.navigate('constructor');
    expect(channels.getCurrentChannelId()).toBe('constructor');
    expect(document.getElementById('topic-hash').textContent).toBe('#constructor');
  });

  it('navigating to the already-current channel is a no-op', () => {
    seed();
    channels.navigate('explorer');
    const renders = pinned.renderHeroLine.mock.calls.length;
    channels.navigate('explorer'); // same id → early return, no re-render
    expect(pinned.renderHeroLine.mock.calls.length).toBe(renders);
  });

  it('updates topic chrome, active channel, and pane accent', () => {
    seed();
    channels.navigate('explorer');
    expect(sidebar.setActiveChannel).toHaveBeenCalledWith('explorer');
    expect(document.getElementById('topic-hash').textContent).toBe('#explorer');
    expect(document.getElementById('topic-text').textContent).toBe('explorer topic');
    expect(document.getElementById('pane').style.getPropertyValue('--ch-accent')).toMatch(/^oklch\(/);
  });

  it('first navigation renders directly, not through the switch transition', () => {
    seed();
    channels.navigate('explorer'); // prevId === null → direct render branch
    expect(transition.playSwitchTransition).not.toHaveBeenCalled();
    expect(pinned.renderHeroLine).toHaveBeenCalledTimes(1);
    expect(feed.renderFeed).toHaveBeenCalledTimes(1);
  });

  it('a subsequent switch routes render through playSwitchTransition', () => {
    seed();
    channels.navigate('explorer'); // first → direct
    channels.navigate('home'); //     second → transition branch
    expect(transition.playSwitchTransition).toHaveBeenCalledTimes(1);
  });
});

// ---- initChannels --------------------------------------------------------

describe('initChannels', () => {
  it('builds the channel registry as [home, ...projects, activity]', () => {
    initCapturing({
      projects: [
        { channel: 'a', description: 'da' },
        { channel: 'b', description: 'db' },
      ],
      entries: [],
    });
    expect(channels.getChannels().map((c) => c.id)).toEqual(['home', 'a', 'b', 'activity']);
    expect(channels.getChannels()[0].group).toBe('system');
    expect(channels.getChannels()[1].group).toBe('projects');
    expect(channels.channelById('a').topic).toBe('da');
    expect(channels.channelById('a').project).toBeTruthy();
  });

  it('re-init replaces the registry, dropping stale channels', () => {
    initCapturing({ projects: [{ channel: 'a', description: 'da' }], entries: [] });
    expect(channels.channelById('a')).toBeTruthy();
    initCapturing({ projects: [{ channel: 'b', description: 'db' }], entries: [] });
    expect(channels.channelById('a')).toBeUndefined(); // stale channel gone after rebuild
    expect(channels.channelById('b')).toBeTruthy();
  });

  it('wires hashchange so a hash change drives navigate(parseHash, fromHash)', () => {
    const handler = initCapturing({
      projects: [{ channel: 'explorer', description: 'explorer topic' }],
      entries: [],
    });
    expect(typeof handler).toBe('function');
    window.history.replaceState(null, '', '#/explorer'); // browser would do this, then fire
    handler();
    expect(channels.getCurrentChannelId()).toBe('explorer');
    expect(location.hash).toBe('#/explorer'); // fromHash path leaves the hash untouched
  });
});

// applyInitialChannel tests (hash → initial channel fallback chain) moved to
// channels-hash.test.js.
