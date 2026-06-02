// @vitest-environment jsdom
// Unit tests for the routing layer: registry build, navigate orchestration,
// hash routing fallbacks, and the chHeat/chAccent channel-temperature helpers.
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

// Re-imported fresh per test (see beforeEach) so module state — currentId,
// CHANNELS, byId — starts clean and the mocked deps resolve to the same fresh
// instances channels.js sees.
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

// Populate byId in place (the same path initChannels uses) WITHOUT wiring a
// hashchange listener — keeps navigate-direct tests free of global side effects.
function seed() {
  Object.assign(channels.byId, {
    home: { id: 'home', group: 'system', label: 'home', topic: 'daily logbook' },
    explorer: { id: 'explorer', group: 'projects', label: 'explorer', topic: 'explorer topic', project: { heat: 0.7 } },
    activity: { id: 'activity', group: 'system', label: 'activity', topic: 'commit stream' },
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
    channels.byId.explorer = { id: 'explorer', project: { heat: 0.73 } };
    expect(channels.chHeat('explorer')).toBe(0.73);
  });

  it('home (no registry entry) → 1.0', () => {
    expect(channels.chHeat('home')).toBe(1.0);
  });

  it('home present in registry but without a project → still 1.0', () => {
    channels.byId.home = { id: 'home', label: 'home' };
    expect(channels.chHeat('home')).toBe(1.0);
  });

  it('activity → 0.85', () => {
    expect(channels.chHeat('activity')).toBe(0.85);
  });

  it('unknown id → 0.5 fallback', () => {
    expect(channels.chHeat('whatever')).toBe(0.5);
  });

  it('project.heat wins over the id-based branches (precedence)', () => {
    // An id literally named "home" but carrying a project must use project.heat,
    // proving the project check runs before the id === 'home' branch.
    channels.byId.home = { id: 'home', project: { heat: 0.2 } };
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
    channels.byId.hot = { id: 'hot', project: { heat: 1 } };
    channels.byId.cold = { id: 'cold', project: { heat: 0 } };
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
  it('builds CHANNELS as [home, ...projects, activity]', () => {
    initCapturing({
      projects: [
        { channel: 'a', description: 'da' },
        { channel: 'b', description: 'db' },
      ],
      entries: [],
    });
    expect(channels.CHANNELS.map((c) => c.id)).toEqual(['home', 'a', 'b', 'activity']);
    expect(channels.CHANNELS[0].group).toBe('system');
    expect(channels.CHANNELS[1].group).toBe('projects');
    expect(channels.byId.a.topic).toBe('da');
    expect(channels.byId.a.project).toBeTruthy();
  });

  it('rebuilds byId IN PLACE, preserving the exported object identity', () => {
    const ref = channels.byId;
    initCapturing({ projects: [{ channel: 'a', description: 'da' }], entries: [] });
    expect(channels.byId).toBe(ref); // same object → live consumers keep working
    initCapturing({ projects: [{ channel: 'b', description: 'db' }], entries: [] });
    expect(channels.byId).toBe(ref);
    expect(channels.byId.a).toBeUndefined(); // stale keys cleared on re-init
    expect(channels.byId.b).toBeTruthy();
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

// ---- applyInitialChannel -------------------------------------------------

describe('applyInitialChannel', () => {
  it('hash present → navigates to that channel', () => {
    seed();
    window.history.replaceState(null, '', '#/explorer');
    channels.applyInitialChannel();
    expect(channels.getCurrentChannelId()).toBe('explorer');
    expect(location.hash).toBe('#/explorer'); // fromHash → hash left as-is
  });

  it('hash absent → defaults to home', () => {
    seed();
    window.history.replaceState(null, '', '/');
    channels.applyInitialChannel();
    expect(channels.getCurrentChannelId()).toBe('home');
  });

  it('bare "#" hash → defaults to home', () => {
    seed();
    window.history.replaceState(null, '', '#');
    channels.applyInitialChannel();
    expect(channels.getCurrentChannelId()).toBe('home');
  });

  it('unknown hash id → falls back to home', () => {
    seed();
    window.history.replaceState(null, '', '#/ghost');
    channels.applyInitialChannel();
    expect(channels.getCurrentChannelId()).toBe('home');
  });
});
