// @vitest-environment jsdom
// applyInitialChannel: the hash → initial-channel fallback chain (location.hash
// present/absent/bare/unknown/inherited-Object-key → home), plus the repair of
// an unknown hash and a late demos list. Routing/registry, navigate,
// chHeat/chAccent, and initChannels tests live in channels.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appData, seedData, setupDom, byId, initCapturing } from './channels-test-helpers.js';
/** @import { AppData } from './types.js' */

vi.mock('./data.js', () => ({ entriesFor: vi.fn(() => []) }));
vi.mock('./pinned.js', () => ({ renderPinned: vi.fn(), renderHeroLine: vi.fn() }));
vi.mock('./feed.js', () => ({ renderFeed: vi.fn() }));
vi.mock('./transition.js', () => ({ playSwitchTransition: vi.fn((/** @type {(() => void) | undefined} */ cb) => cb && cb()) }));
vi.mock('./sidebar.js', () => ({ setActiveChannel: vi.fn() }));

/** @type {typeof import('./channels.js')} */
let channels;
/** @type {typeof import('./pinned.js')} */
let pinned;

const capture = (/** @type {AppData} */ data) => initCapturing(channels, data);
const seed = () => capture(seedData());

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
    expect(byId('topic-hash').textContent).toBe('#home');
  });

  it('repairs a bad hash when home is already current, without re-rendering', () => {
    seed();
    channels.navigate('home');
    window.history.replaceState(null, '', '#/ghost');
    vi.mocked(pinned.renderHeroLine).mockClear();
    vi.mocked(pinned.renderPinned).mockClear();
    channels.navigate('ghost', { fromHash: true });
    expect(location.hash).toBe('#/home');
    expect(channels.getCurrentChannelId()).toBe('home');
    expect(pinned.renderHeroLine).not.toHaveBeenCalled();
    expect(pinned.renderPinned).not.toHaveBeenCalled();
  });
});

describe('applyLateDemos', () => {
  it('re-renders the open channel when the late list includes it', () => {
    const data = seedData();
    capture(data);
    channels.navigate('explorer');
    vi.mocked(pinned.renderHeroLine).mockClear();
    vi.mocked(pinned.renderPinned).mockClear();
    channels.applyLateDemos(['explorer']);
    expect(data.demos).toEqual(['explorer']);
    expect(pinned.renderHeroLine).toHaveBeenCalledWith('explorer', data);
    expect(pinned.renderPinned).toHaveBeenCalledWith('explorer', data);
  });

  it('stores a late list that does not match the open channel without re-rendering', () => {
    const data = seedData();
    capture(data);
    channels.navigate('explorer');
    vi.mocked(pinned.renderPinned).mockClear();
    channels.applyLateDemos(['other']);
    expect(data.demos).toEqual(['other']);
    expect(pinned.renderPinned).not.toHaveBeenCalled();
  });

  it('stores a late list before the first navigation without rendering', () => {
    const data = appData();
    capture(data);
    channels.applyLateDemos(['explorer']);
    expect(data.demos).toEqual(['explorer']);
    expect(pinned.renderPinned).not.toHaveBeenCalled();
  });

  it('ignores a non-list and a call before init', () => {
    expect(() => channels.applyLateDemos(['explorer'])).not.toThrow();
    const data = appData();
    capture(data);
    channels.applyLateDemos(/** @type {any} */ (null)); // a non-list on purpose
    expect(data.demos).toEqual([]);
  });
});
