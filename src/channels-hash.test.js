// @vitest-environment jsdom
// applyInitialChannel: the hash → initial-channel fallback chain (location.hash
// present/absent/bare/unknown/inherited-Object-key → home). Routing/registry,
// navigate, chHeat/chAccent, and initChannels tests live in channels.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('./data.js', () => ({ entriesFor: vi.fn(() => []) }));
vi.mock('./pinned.js', () => ({ renderPinned: vi.fn(), renderHeroLine: vi.fn() }));
vi.mock('./feed.js', () => ({ renderFeed: vi.fn() }));
vi.mock('./transition.js', () => ({ playSwitchTransition: vi.fn((cb) => cb && cb()) }));
vi.mock('./sidebar.js', () => ({ setActiveChannel: vi.fn() }));

let channels;

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

  it('unknown hash id → falls back to home', () => {
    seed();
    window.history.replaceState(null, '', '#/ghost');
    channels.applyInitialChannel();
    expect(channels.getCurrentChannelId()).toBe('home');
  });

  it('hash naming an inherited Object key → falls back to home', () => {
    seed();
    window.history.replaceState(null, '', '#/__proto__');
    channels.applyInitialChannel();
    expect(channels.getCurrentChannelId()).toBe('home');
    expect(document.getElementById('topic-hash').textContent).toBe('#home');
  });
});
