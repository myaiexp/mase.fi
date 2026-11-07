// @vitest-environment jsdom
// A failed /updates.json or /updates-archive.json load becomes one sentence in
// the pane, and the home card stops calling the log live — so a stranger can
// tell a failure from an empty day.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ioInstances, installFeedDom, removeFeedStubs, makeData, rows } from './feed-test-helpers.js';

let renderFeed, fetchData, loadArchive, renderPinned;

beforeEach(async () => {
  vi.resetModules();
  installFeedDom();
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  ({ renderFeed } = await import('./feed.js'));
  ({ fetchData, loadArchive } = await import('./data.js'));
  ({ renderPinned } = await import('./pinned.js'));
});

afterEach(removeFeedStubs);

const notices = () => [...document.querySelectorAll('#feed .load-notice')].map(el => el.textContent);
const render = (id, data) => renderFeed(id, data, { immediate: true, navigate: () => {} });
const later = (settle) => vi.fn(() => new Promise((resolve, reject) => setTimeout(() => settle(resolve, reject), 0)));

describe('hot file failure', () => {
  it('fetchData flags loadFailed on a failed fetch and not on success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    expect((await fetchData()).loadFailed).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entries: [], projects: [] }) }));
    expect((await fetchData()).loadFailed).toBe(false);
  });

  it.each(['home', 'activity', 'some-project'])('says so in the %s pane', (id) => {
    render(id, { entries: [], projects: [], loadFailed: true });
    expect(notices()).toHaveLength(1);
    expect(notices()[0]).toMatch(/couldn.t load the log/);
    expect(rows()).toHaveLength(0);
  });

  it('adds nothing when the load worked, even on an empty channel', () => {
    render('home', { entries: [], projects: [], loadFailed: false });
    expect(notices()).toEqual([]);
  });

  it('the home card stops saying live', () => {
    const pinned = document.createElement('div');
    pinned.id = 'pinned';
    document.body.appendChild(pinned);
    const right = () => pinned.querySelector('.card-head .right').textContent;
    renderPinned('home', { projects: [], entries: [], stats: {}, loadFailed: true });
    expect(right()).not.toMatch(/live/);
    renderPinned('home', { projects: [], entries: [], stats: {}, loadFailed: false });
    expect(right()).toMatch(/live/);
  });
});

describe('archive failure', () => {
  function archiveData(n) {
    const data = makeData(n);
    Object.assign(data, { hasArchive: true, archiveLoaded: false, projects: [] });
    return data;
  }

  it('loadArchive flags archiveFailed, and a later success clears it', async () => {
    const data = archiveData(1);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await loadArchive(data);
    expect(data.archiveFailed).toBe(true);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entries: [] }) }));
    await loadArchive(data);
    expect(data.archiveFailed).toBe(false);
  });

  it('puts one sentence at the top of #activity when the archive fetch fails', async () => {
    vi.stubGlobal('fetch', later((_, reject) => reject(new Error('timeout'))));
    render('activity', archiveData(50));
    ioInstances.at(-1).fire();
    await vi.waitFor(() => expect(notices()).toHaveLength(1));
    expect(notices()[0]).toMatch(/older history didn.t load/);
    // Above the oldest row: that is where the history stops.
    const feed = document.getElementById('feed');
    const kids = [...feed.children];
    expect(kids.indexOf(feed.querySelector('.load-notice'))).toBeLessThan(kids.indexOf(rows()[0]));
  });
});
