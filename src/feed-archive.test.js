// @vitest-environment jsdom
// Archive lazy-load in the #activity feed: the sentinel survives while an archive
// remains, a merge prepends archived rows, and a failed load drops the sentinel
// instead of re-fetching on every intersection.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ioInstances, installFeedDom, removeFeedStubs, makeData, rows, sentinel, dayHeaders, distinctDays } from './feed-test-helpers.js';

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

  // The topic line is written by navigate() from the hot window. Archive rows
  // land later, on the feed, which must not import the router — channels hears
  // feed:archive and recomputes the count. Finding #12603.
  it('updates the topic count when archived rows appear', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true, media: '' }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [
          { category: 'log', project: 'helm', date: '2026-01-01T10:00', text: 'archived-old' },
        ],
      }),
    }));
    for (const id of ['pane', 'topic-hash', 'topic-text', 'topic-meta', 'hero-line', 'pinned']) {
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    const data = archiveData(250);
    data.stats = {};
    const channels = await import('./channels.js');
    // Don't leave this module's hashchange handler on window after resetModules.
    const spy = vi.spyOn(window, 'addEventListener').mockImplementation(() => {});
    channels.initChannels(data);
    spy.mockRestore();
    channels.navigate('activity', { fromHash: true });

    const meta = document.getElementById('topic-meta');
    expect(meta.firstChild.textContent).toBe('250 msgs');
    expect(meta.lastChild.textContent).toBe('read-only');

    ioInstances.at(-1).fire(); // 200 → 250, in-memory exhausted → archive fetch
    await vi.waitFor(() => {
      expect(rows().some((r) => r.dataset.raw === 'archived-old')).toBe(true);
    });
    expect(meta.firstChild.textContent).toBe('251 msgs');
    expect(meta.lastChild.textContent).toBe('read-only');
  });

  it('shows archived rows when the hot window holds no logs at all', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ entries: [{ category: 'log', project: 'helm', date: '2026-01-01T10:00', text: 'archived-only' }] }),
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = archiveData(0);
    render(data);
    expect(rows().length).toBe(0);
    expect(sentinel()).toBeTruthy();
    ioInstances.at(-1).fire(); // nothing in memory → straight to the archive fetch
    await vi.waitFor(() => {
      expect(rows().map((r) => r.dataset.raw)).toEqual(['archived-only']);
    });
    expect(sentinel()).toBeNull();
    expect(warn).not.toHaveBeenCalled();
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

// The window is "the newest `shown` rows", which a merge only preserves when every
// archived row sorts before every materialized one. The pipeline cannot promise
// that: an unparseable hot date is stored as EPOCH, and an old-dated commit can
// land in the hot file. Finding #13254.
describe('renderFeed when archived rows sort among the materialized rows', () => {
  const hotRow = (date, text) => ({ channel: 'activity', category: 'log', date, nick: 'git', text });
  const stubArchive = (...rows) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ entries: rows.map(([date, text]) => ({ category: 'log', date, text })) }),
  }));
  // Reveal until the sentinel retires, so every row has had its chance to appear.
  const drain = async () => {
    await vi.waitFor(() => {
      if (sentinel()) ioInstances.at(-1).fire();
      expect(sentinel()).toBeNull();
    });
  };
  const raws = () => rows().map((r) => r.dataset.raw);

  it('shows every row once when an EPOCH hot row sorts before the archive', async () => {
    stubArchive(['2026-01-01T10:00', 'archived-1'], ['2026-01-02T10:00', 'archived-2'], ['2026-01-03T10:00', 'archived-3']);
    const data = archiveData(250);
    data.entries.unshift(hotRow('1970-01-01T00:00', 'epoch-row'));
    render(data);
    await drain();
    expect(raws().slice(0, 4)).toEqual(['epoch-row', 'archived-1', 'archived-2', 'archived-3']);
    expect(raws().length).toBe(254);
    expect(new Set(raws()).size).toBe(254);
    expect(dayHeaders().length).toBe(distinctDays(data.entries));
  });

  it('places an archived row dated between two materialized rows', async () => {
    stubArchive(['2026-06-01T10:01', 'archived-mid'], ['2026-01-01T10:00', 'archived-old']);
    const data = archiveData(3);
    render(data);
    await drain();
    expect(raws()).toEqual(['archived-old', 'commit 0', 'commit 1', 'archived-mid', 'commit 2']);
    expect(dayHeaders().length).toBe(distinctDays(data.entries));
  });

  it('places an archived row newer than every materialized row', async () => {
    stubArchive(['2026-07-01T10:00', 'archived-new']);
    const data = archiveData(2);
    render(data);
    await drain();
    expect(raws()).toEqual(['commit 0', 'commit 1', 'archived-new']);
  });

  it('keeps a server notice and the distance from the bottom across the rebuild', async () => {
    stubArchive(['2026-07-01T10:00', 'archived-new']);
    const data = archiveData(2);
    render(data);
    const feed = document.getElementById('feed');
    const notice = document.createElement('div');
    notice.className = 'sys-notice';
    feed.appendChild(notice);
    // jsdom has no layout: model a height that follows the row count.
    Object.defineProperty(feed, 'scrollHeight', { configurable: true, get: () => 1000 + 50 * rows().length });
    feed.scrollTop = 400;
    const fromBottom = feed.scrollHeight - feed.scrollTop;
    const relayouts = vi.fn();
    feed.addEventListener('feed:relayout', relayouts);
    ioInstances.at(-1).fire();
    await vi.waitFor(() => expect(raws()).toEqual(['commit 0', 'commit 1', 'archived-new']));
    expect(feed.lastElementChild).toBe(notice);
    expect(feed.scrollHeight - feed.scrollTop).toBe(fromBottom);
    expect(relayouts).toHaveBeenCalled();
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

// A throw past the merge (here entriesFor) lands in the reveal's .catch: the
// sentinel retires so later intersections don't rethrow, and a warn is left.
describe('renderFeed when revealing archived rows throws', () => {
  let entriesFor;

  beforeEach(async () => {
    vi.resetModules();
    vi.doMock('./data.js', async (importOriginal) => {
      const real = await importOriginal();
      entriesFor = vi.fn(real.entriesFor);
      return { ...real, entriesFor, loadArchive: vi.fn(async () => {}) };
    });
    ({ renderFeed } = await import('./feed.js'));
  });

  afterEach(() => vi.doUnmock('./data.js'));

  it('drops the sentinel and warns once', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(archiveData(80));
    const io = ioInstances.at(-1);
    entriesFor.mockImplementation(() => { throw new Error('render bug'); });
    io.fire();
    await vi.waitFor(() => expect(sentinel()).toBeNull());
    expect(io.disconnected).toBe(true);
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0][0]).toBe('renderFeed: failed to reveal archived rows');
    expect(rows().length).toBe(80);
  });
});
