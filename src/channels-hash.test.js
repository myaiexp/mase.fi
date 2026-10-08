// @vitest-environment jsdom
// applyInitialChannel: the hash → initial-channel fallback chain (location.hash
// present/absent/bare/unknown/inherited-Object-key → home), plus the repair of
// an unknown hash and a late demos list. Routing/registry, navigate,
// chHeat/chAccent, and initChannels tests live in channels.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./data.js', () => ({ entriesFor: vi.fn(() => []) }));
vi.mock('./pinned.js', () => ({ renderPinned: vi.fn(), renderHeroLine: vi.fn() }));
vi.mock('./feed.js', () => ({ renderFeed: vi.fn() }));
vi.mock('./transition.js', () => ({ playSwitchTransition: vi.fn((cb) => cb && cb()) }));
vi.mock('./sidebar.js', () => ({ setActiveChannel: vi.fn() }));

let channels, pinned;

function setupDom() {
  document.body.replaceChildren();
  for (const id of ['pane', 'topic-hash', 'topic-text', 'topic-meta']) {
    const el = document.createElement('span');
    el.id = id;
    document.body.appendChild(el);
  }
}

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
  vi.clearAllMocks();
  setupDom();
  window.history.replaceState(null, '', '/'); // clear any hash from a prior test (no event)
  channels = await import('./channels.js');
  pinned = await import('./pinned.js');
});

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

  it('unknown hash id → falls back to home and replaces the hash', () => {
    seed();
    const replace = vi.spyOn(window.history, 'replaceState');
    let hashchanges = 0;
    const onHash = () => { hashchanges += 1; };
    window.addEventListener('hashchange', onHash);
    window.history.replaceState(null, '', '#/ghost');
    replace.mockClear();
    hashchanges = 0;
    channels.applyInitialChannel();
    window.removeEventListener('hashchange', onHash);
    expect(channels.getCurrentChannelId()).toBe('home');
    expect(location.hash).toBe('#/home');
    expect(replace).toHaveBeenCalledWith(null, '', '#/home');
    expect(hashchanges).toBe(0);
  });

  it('hash naming an inherited Object key → falls back to home and replaces the hash', () => {
    seed();
    window.history.replaceState(null, '', '#/__proto__');
    channels.applyInitialChannel();
    expect(channels.getCurrentChannelId()).toBe('home');
    expect(location.hash).toBe('#/home');
    expect(document.getElementById('topic-hash').textContent).toBe('#home');
  });

  it('repairs a bad hash when home is already current, without re-rendering', () => {
    seed();
    channels.navigate('home');
    window.history.replaceState(null, '', '#/ghost');
    pinned.renderHeroLine.mockClear();
    pinned.renderPinned.mockClear();
    channels.navigate('ghost', { fromHash: true });
    expect(location.hash).toBe('#/home');
    expect(channels.getCurrentChannelId()).toBe('home');
    expect(pinned.renderHeroLine).not.toHaveBeenCalled();
    expect(pinned.renderPinned).not.toHaveBeenCalled();
  });
});

describe('applyLateDemos', () => {
  it('re-renders the open channel when the late list includes it', () => {
    const data = {
      projects: [{ channel: 'explorer', description: 'explorer topic', heat: 0.7 }],
      entries: [],
      demos: [],
    };
    initCapturing(data);
    channels.navigate('explorer');
    pinned.renderHeroLine.mockClear();
    pinned.renderPinned.mockClear();
    channels.applyLateDemos(['explorer']);
    expect(data.demos).toEqual(['explorer']);
    expect(pinned.renderHeroLine).toHaveBeenCalledWith('explorer', data);
    expect(pinned.renderPinned).toHaveBeenCalledWith('explorer', data);
  });

  it('stores a late list that does not match the open channel without re-rendering', () => {
    const data = {
      projects: [{ channel: 'explorer', description: 'explorer topic', heat: 0.7 }],
      entries: [],
      demos: [],
    };
    initCapturing(data);
    channels.navigate('explorer');
    pinned.renderPinned.mockClear();
    channels.applyLateDemos(['other']);
    expect(data.demos).toEqual(['other']);
    expect(pinned.renderPinned).not.toHaveBeenCalled();
  });

  it('stores a late list before the first navigation without rendering', () => {
    const data = { projects: [], entries: [], demos: [] };
    initCapturing(data);
    channels.applyLateDemos(['explorer']);
    expect(data.demos).toEqual(['explorer']);
    expect(pinned.renderPinned).not.toHaveBeenCalled();
  });

  it('ignores a non-list and a call before init', () => {
    expect(() => channels.applyLateDemos(['explorer'])).not.toThrow();
    const data = { projects: [], entries: [], demos: [] };
    initCapturing(data);
    channels.applyLateDemos(null);
    expect(data.demos).toEqual([]);
  });
});
