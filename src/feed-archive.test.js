// @vitest-environment jsdom
// Archive lazy-load in the #activity feed: the sentinel survives while an archive
// remains, a merge prepends archived rows, and a failed load drops the sentinel
// instead of re-fetching on every intersection.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installFeedDom, removeFeedStubs, archiveData, lastIo, rows, sentinel, dayHeaders, distinctDays } from './feed-test-helpers.js';

/** @import { AppData, Entry } from './types.js' */

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
    lastIo().fire(); // 200 → 250, in-memory exhausted → archive fetch
    await vi.waitFor(() => {
      expect(rows().some((r) => r.dataset['raw'] === 'archived-old')).toBe(true);
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

    const meta = /** @type {HTMLElement} */ (document.getElementById('topic-meta'));
    expect(meta.firstChild?.textContent).toBe('250 msgs');
    expect(meta.lastChild?.textContent).toBe('read-only');

    lastIo().fire(); // 200 → 250, in-memory exhausted → archive fetch
    await vi.waitFor(() => {
      expect(rows().some((r) => r.dataset['raw'] === 'archived-old')).toBe(true);
    });
    expect(meta.firstChild?.textContent).toBe('251 msgs');
    expect(meta.lastChild?.textContent).toBe('read-only');
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
    lastIo().fire(); // nothing in memory → straight to the archive fetch
    await vi.waitFor(() => {
      expect(rows().map((r) => r.dataset['raw'])).toEqual(['archived-only']);
    });
    expect(sentinel()).toBeNull();
    expect(warn).not.toHaveBeenCalled();
  });

  it('shows archive rows in a render that began while another render was fetching', async () => {
    /** @type {((v: unknown) => void) | undefined} */
    let release;
    const fetchMock = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const data = archiveData(80);
    render(data);
    lastIo().fire(); // first render starts the fetch
    render(data); // re-render mid-flight
    lastIo().fire(); // joins the in-flight load
    release?.({
      ok: true,
      json: async () => ({ entries: [{ category: 'log', date: '2026-01-01T10:00', text: 'archived-old' }] }),
    });
    await vi.waitFor(() => {
      expect(rows().some((r) => r.dataset['raw'] === 'archived-old')).toBe(true);
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
  /** @param {string} date @param {string} text @returns {Entry} */
  const hotRow = (date, text) => ({ channel: 'activity', category: 'log', date, nick: 'git', text, projectSlug: undefined, projectChannel: undefined });
  /** @param {...[string, string]} rows */
  const stubArchive = (...rows) => vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ entries: rows.map(([date, text]) => ({ category: 'log', date, text })) }),
  }));
  // Reveal until the sentinel retires, so every row has had its chance to appear.
  const drain = async () => {
    await vi.waitFor(() => {
      if (sentinel()) lastIo().fire();
      expect(sentinel()).toBeNull();
    });
  };
  const raws = () => rows().map((r) => r.dataset['raw']);

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
    const feed = /** @type {HTMLElement} */ (document.getElementById('feed'));
    const notice = document.createElement('div');
    notice.className = 'sys-notice';
    feed.appendChild(notice);
    // jsdom has no layout: model a height that follows the row count.
    Object.defineProperty(feed, 'scrollHeight', { configurable: true, get: () => 1000 + 50 * rows().length });
    feed.scrollTop = 400;
    const fromBottom = feed.scrollHeight - feed.scrollTop;
    const relayouts = vi.fn();
    feed.addEventListener('feed:relayout', relayouts);
    lastIo().fire();
    await vi.waitFor(() => expect(raws()).toEqual(['commit 0', 'commit 1', 'archived-new']));
    expect(feed.lastElementChild).toBe(notice);
    expect(feed.scrollHeight - feed.scrollTop).toBe(fromBottom);
    expect(relayouts).toHaveBeenCalled();
  });
});
