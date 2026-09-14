// @vitest-environment jsdom
// Archive lazy-load in the #activity feed: the sentinel survives while an archive
// remains, a merge prepends archived rows, and a failed load drops the sentinel
// instead of re-fetching on every intersection.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ioInstances, installFeedDom, removeFeedStubs, makeData, rows, sentinel } from './feed-test-helpers.js';

let renderFeed;

beforeEach(async () => {
  vi.resetModules();
  installFeedDom();
  ({ renderFeed } = await import('./feed.js'));
});

afterEach(removeFeedStubs);

// makeData rows plus the archive flags renderFeed and loadArchive read.
function archiveData(n) {
  const data = makeData(n);
  data.hasArchive = true;
  data.archiveLoaded = false;
  data.projects = [{ name: 'Helm', channel: 'helm', slug: 'helm' }];
  return data;
}

// Settle on a macrotask, as a real fetch does. An immediately-settled mock
// would turn a regressed re-fetch loop into a microtask spin that hangs the
// runner instead of failing these tests.
const later = (settle) => vi.fn(() => new Promise((resolve, reject) => {
  setTimeout(() => settle(resolve, reject), 0);
}));

const render = (data) => renderFeed('activity', data, { immediate: true, navigate: () => {} });

describe('renderFeed archive lazy-load', () => {
  it('keeps the sentinel when in-memory logs fit but an archive remains', () => {
    render(archiveData(80));
    expect(rows().length).toBe(80);
    expect(sentinel()).toBeTruthy();
  });

  it('fetches the archive when the sentinel exhausts in-memory logs and prepends them', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [
          { category: 'log', project: 'helm', date: '2026-01-01T10:00', text: 'archived-old' },
        ],
      }),
    }));
    const data = archiveData(250);
    render(data);
    expect(rows().length).toBe(200);
    ioInstances.at(-1).fire(); // 200 → 250, in-memory exhausted → archive fetch
    await vi.waitFor(() => {
      expect(rows().some((r) => r.dataset.raw === 'archived-old')).toBe(true);
    });
    expect(data.archiveLoaded).toBe(true);
  });

  it('shows archive rows in a render that began while another render was fetching', async () => {
    let release;
    const fetchMock = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const data = archiveData(80);
    render(data);
    ioInstances.at(-1).fire(); // first render starts the fetch
    render(data); // re-render mid-flight
    ioInstances.at(-1).fire(); // joins the in-flight load
    release({
      ok: true,
      json: async () => ({ entries: [{ category: 'log', date: '2026-01-01T10:00', text: 'archived-old' }] }),
    });
    await vi.waitFor(() => {
      expect(rows().some((r) => r.dataset.raw === 'archived-old')).toBe(true);
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(sentinel()).toBeNull();
  });
});

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
      const io = ioInstances.at(-1);
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
    ioInstances.at(-1).fire();
    await vi.waitFor(() => expect(sentinel()).toBeNull());
    render(data);
    expect(sentinel()).toBeTruthy();
    ioInstances.at(-1).fire();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
