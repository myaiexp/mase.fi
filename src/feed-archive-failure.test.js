// @vitest-environment jsdom
// Archive lazy-load failure paths in the #activity feed: a failed fetch retires
// the sentinel, and a throw while revealing archived rows warns once.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installFeedDom, removeFeedStubs, archiveData, later, lastIo, rows, sentinel } from './feed-test-helpers.js';

/** @import { AppData } from './types.js' */

/** @type {typeof import('./feed.js').renderFeed} */
let renderFeed;

beforeEach(async () => {
  vi.resetModules();
  installFeedDom();
  ({ renderFeed } = await import('./feed.js'));
});

afterEach(removeFeedStubs);

/** @param {AppData} data */
const render = (data) => renderFeed('activity', data, { immediate: true, navigate: () => {} });

// The failure path: loadArchive resolves with archiveLoaded still false. The
// render must drop the sentinel rather than re-fetch on every intersection.
describe('renderFeed when the archive fetch fails', () => {
  const failures = {
    'a rejected fetch': () => later((_, reject) => reject(new Error('timeout'))),
    'an HTTP 503': () => later((resolve) => resolve({ ok: false, status: 503, json: async () => ({}) })),
  };
  for (const [label, makeFetch] of Object.entries(failures)) {
    it(`removes the sentinel and stops asking on ${label}`, async () => {
      const fetchMock = makeFetch();
      vi.stubGlobal('fetch', fetchMock);
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      const data = archiveData(250);
      render(data);
      const io = lastIo();
      io.fire(); // 200 → 250, in-memory exhausted → archive fetch
      await vi.waitFor(() => expect(sentinel()).toBeNull());
      expect(io.disconnected).toBe(true);
      expect(fetchMock).toHaveBeenCalledOnce();
      expect(rows().length).toBe(250);
      expect(data.archiveLoaded).toBe(false);

      io.fire(); // a late intersection must not fetch again
      await new Promise((r) => setTimeout(r, 0));
      expect(fetchMock).toHaveBeenCalledOnce();
    });
  }

  it('lets a later render of #activity try once more', async () => {
    const fetchMock = later((_, reject) => reject(new Error('timeout')));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = archiveData(80);
    render(data);
    lastIo().fire();
    await vi.waitFor(() => expect(sentinel()).toBeNull());
    render(data);
    expect(sentinel()).toBeTruthy();
    lastIo().fire();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});

// A throw past the merge (here entriesFor) lands in the reveal's .catch: the
// sentinel retires so later intersections don't rethrow, and a warn is left.
describe('renderFeed when revealing archived rows throws', () => {
  /** @type {import('vitest').Mock<typeof import('./data.js').entriesFor>} */
  let entriesFor;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('./data.js', async (importOriginal) => {
      const real = /** @type {typeof import('./data.js')} */ (await importOriginal());
      entriesFor = vi.fn(real.entriesFor);
      return { ...real, entriesFor, loadArchive: vi.fn(async () => {}) };
    });
    ({ renderFeed } = await import('./feed.js'));
  });

  afterEach(() => vi.doUnmock('./data.js'));

  it('drops the sentinel and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(archiveData(80));
    const io = lastIo();
    entriesFor.mockImplementation(() => { throw new Error('render bug'); });
    io.fire();
    await vi.waitFor(() => expect(sentinel()).toBeNull());
    expect(io.disconnected).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]?.[0]).toBe('renderFeed: failed to reveal archived rows');
    expect(rows().length).toBe(80);
  });
});
