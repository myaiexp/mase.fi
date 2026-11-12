// @vitest-environment jsdom
// navigate(): hash writing, unknown-id coercion, topic chrome, and the first-vs-switch render paths.
// Registry, chHeat/chAccent and initChannels tests live in channels.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appData, proj, seedData, setupDom, byId, initCapturing } from './channels-test-helpers.js';
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
/** @type {typeof import('./sidebar.js')} */
let sidebar;
/** @type {typeof import('./pinned.js')} */
let pinned;
/** @type {typeof import('./feed.js')} */
let feed;
/** @type {typeof import('./transition.js')} */
let transition;

const capture = (/** @type {AppData} */ data) => initCapturing(channels, data);
const seed = () => capture(seedData());

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
      expect(byId('topic-hash').textContent).toBe('#home');
      expect(sidebar.setActiveChannel).toHaveBeenCalledWith('home');
    },
  );

  it('a project really named "constructor" is still reachable', () => {
    capture(appData([proj({ channel: 'constructor', description: 'c topic', heat: 0.5 })]));
    channels.navigate('constructor');
    expect(channels.getCurrentChannelId()).toBe('constructor');
    expect(byId('topic-hash').textContent).toBe('#constructor');
  });

  it('navigating to the already-current channel is a no-op', () => {
    seed();
    channels.navigate('explorer');
    const renders = vi.mocked(pinned.renderHeroLine).mock.calls.length;
    channels.navigate('explorer'); // same id → early return, no re-render
    expect(vi.mocked(pinned.renderHeroLine).mock.calls.length).toBe(renders);
  });

  it('updates topic chrome, active channel, and pane accent', () => {
    seed();
    channels.navigate('explorer');
    expect(sidebar.setActiveChannel).toHaveBeenCalledWith('explorer');
    expect(byId('topic-hash').textContent).toBe('#explorer');
    expect(byId('topic-text').textContent).toBe('explorer topic');
    expect(byId('pane').style.getPropertyValue('--ch-accent')).toMatch(/^oklch\(/);
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

