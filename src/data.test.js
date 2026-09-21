// Unit tests for the data adapter (fetch + normalize + channel routing/bucketing).
// fetchDemos lives in data-demos.test.js, project links in data-links.test.js,
// logStats buckets/last in data-logstats.test.js, and project heat/recency in
// data-heat.test.js. loadArchive tests live in data-archive.test.js.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchData, entriesFor } from './data.js';
import { entry, stubFetch } from './data-test-helpers.js';

// ---- helpers -------------------------------------------------------------

function dataWith(entries) {
  return { entries };
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---- entriesFor ----------------------------------------------------------

describe('entriesFor', () => {
  it('home returns only daily entries, across any channel', () => {
    const data = dataWith([
      entry('daily', 'home'),
      entry('daily', 'explorer'), // daily routed to a project channel still shows on home
      entry('log', 'activity'),
      entry('feature', 'explorer'),
    ]);
    const got = entriesFor('home', data);
    expect(got).toHaveLength(2);
    expect(got.every((e) => e.cat === 'daily')).toBe(true);
  });

  it('activity returns ALL log entries (cross-project firehose)', () => {
    const data = dataWith([
      entry('log', 'activity'),
      entry('log', 'explorer'), // log routed to a project channel is still in the firehose
      entry('daily', 'home'),
      entry('feature', 'explorer'),
    ]);
    const got = entriesFor('activity', data);
    expect(got).toHaveLength(2);
    expect(got.every((e) => e.cat === 'log')).toBe(true);
  });

  it('project channel returns matching non-log entries (feature/project/daily)', () => {
    const data = dataWith([
      entry('feature', 'explorer'),
      entry('project', 'explorer'),
      entry('daily', 'explorer'),
      entry('feature', 'porssi'), // different channel, excluded
    ]);
    const got = entriesFor('explorer', data);
    expect(got).toHaveLength(3);
    expect(got.every((e) => e.ch === 'explorer')).toBe(true);
  });

  it('project channel EXCLUDES log entries even when their ch matches', () => {
    const data = dataWith([
      entry('feature', 'explorer'),
      entry('log', 'explorer'), // log with matching ch must NOT appear in the project channel
    ]);
    const got = entriesFor('explorer', data);
    expect(got).toHaveLength(1);
    expect(got[0].cat).toBe('feature');
  });

  it('unknown channel id returns empty', () => {
    const data = dataWith([entry('feature', 'explorer'), entry('daily', 'home')]);
    expect(entriesFor('nope', data)).toEqual([]);
  });
});

// ---- fetchData: routing + normalization ----------------------------------
// The category→channel mapping, project-slug routing, and case-insensitive
// matching the finding attributes to entriesFor actually live here in fetchData.

describe('fetchData routing', () => {
  it('routes daily (no project) → home and log (no project) → activity', async () => {
    stubFetch({
      projects: [],
      entries: [
        { category: 'daily', date: '2026-01-01', text: 'summary' },
        { category: 'log', date: '2026-01-02', text: 'commit' },
      ],
    });
    const data = await fetchData();
    const byCat = Object.fromEntries(data.entries.map((e) => [e.cat, e.ch]));
    expect(byCat.daily).toBe('home');
    expect(byCat.log).toBe('activity');
  });

  it('routes feature/project entries to their matched project channel', async () => {
    stubFetch({
      projects: [{ name: 'Explorer', channel: 'explorer' }],
      entries: [
        { category: 'feature', project: 'explorer', date: '2026-01-01', text: 'f' },
        { category: 'project', project: 'explorer', date: '2026-01-02', text: 'p' },
      ],
    });
    const data = await fetchData();
    expect(data.entries.map((e) => e.ch)).toEqual(['explorer', 'explorer']);
  });

  it('matches project slug case-insensitively (entry.project EXPLORER → channel)', async () => {
    stubFetch({
      projects: [{ name: 'Explorer', channel: 'explorer' }],
      entries: [{ category: 'feature', project: 'EXPLORER', date: '2026-01-01', text: 'f' }],
    });
    const data = await fetchData();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].ch).toBe('explorer');
  });

  it('uses an explicit project.slug distinct from channel for matching', async () => {
    stubFetch({
      projects: [{ name: 'Explorer', channel: 'exp', slug: 'explorer' }],
      entries: [{ category: 'feature', project: 'explorer', date: '2026-01-01', text: 'f' }],
    });
    const data = await fetchData();
    expect(data.entries[0].ch).toBe('exp');
  });

  it('DROPS feature/project entries whose project matches nothing', async () => {
    stubFetch({
      projects: [{ name: 'Explorer', channel: 'explorer' }],
      entries: [
        { category: 'feature', project: 'ghost', date: '2026-01-01', text: 'f' },
        { category: 'project', date: '2026-01-02', text: 'p' }, // no project at all
      ],
    });
    const data = await fetchData();
    expect(data.entries).toEqual([]);
  });

  it('routes a matched-project entry to its channel even with an unknown category', async () => {
    stubFetch({
      projects: [{ name: 'Explorer', channel: 'explorer' }],
      entries: [
        { category: 'weird', project: 'explorer', date: '2026-01-01', text: 'w' }, // matched → channel
        { category: 'weird', date: '2026-01-02', text: 'w2' }, // unmatched + unknown cat → dropped
      ],
    });
    const data = await fetchData();
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0].ch).toBe('explorer');
    expect(data.entries[0].cat).toBe('weird');
  });

  it('falls back to text||summary and assigns nick by category, sorted by date asc', async () => {
    stubFetch({
      projects: [],
      entries: [
        { category: 'log', date: '2026-03-02', text: 'newer' },
        { category: 'daily', date: '2026-03-01', summary: 'older-summary' },
      ],
    });
    const data = await fetchData();
    expect(data.entries.map((e) => e.text)).toEqual(['older-summary', 'newer']);
    // Project-less daily falls back to 'mase'; log → 'git'.
    expect(data.entries.map((e) => e.nick)).toEqual(['mase', 'git']);
  });

  it('nicks a daily entry with its project (per-project standup), lowercased', async () => {
    stubFetch({
      projects: [{ name: 'Explorer', slug: 'explorer', channel: 'explorer' }],
      entries: [
        { category: 'daily', date: '2026-03-01', project: 'Explorer', summary: 'route fixes, dep bumps' },
      ],
    });
    const data = await fetchData();
    expect(data.entries[0].nick).toBe('explorer');
    expect(data.entries[0].ch).toBe('explorer');
  });

  it('returns empty entries/projects when fetch rejects', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const data = await fetchData();
    expect(data.entries).toEqual([]);
    expect(data.projects).toEqual([]);
  });

  it('passes an AbortSignal to updates.json and the demos manifest', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ projects: [], entries: [] }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await fetchData();
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    for (const [, init] of fetchMock.mock.calls) {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('does not stall on a hung demos manifest once updates.json is in', async () => {
    // fetchDemos is documented as never rejecting, so both the success and
    // catch paths used to await it unbounded — a hung /demos/manifest.json
    // blocked the whole app after updates.json had already loaded (finding #8124).
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn((url) => {
      if (String(url).includes('/demos/')) return new Promise(() => {});
      return Promise.resolve({ ok: true, json: async () => ({ projects: [], entries: [] }) });
    }));
    const p = fetchData();
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toMatchObject({ demos: [], entries: [], projects: [] });
  });

  it('degrades to empty data on a non-ok HTTP response (does not parse the error body)', async () => {
    // A 4xx/5xx with a JSON error body must not be parsed as data. The r.ok guard
    // throws, routing it to the same empty fallback as a network failure.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ entries: [{ category: 'daily', date: '2026-01-01', text: 'proxy error' }] }),
    }));
    const data = await fetchData();
    expect(data.entries).toEqual([]);
    expect(data.projects).toEqual([]);
    expect(data.meta.nick).toBe('mase');
  });

  it('folds raw.stats onto the returned data object (hasArchive from stats.archive)', async () => {
    stubFetch({
      projects: [],
      entries: [],
      stats: {
        totalCommits: 12,
        logFirst: '2026-03-05',
        logLast: '2026-09-02',
        archive: true,
        commitsByProject: { helm: 4 },
        archivedByProject: { helm: 3 },
      },
    });
    const data = await fetchData();
    expect(data.stats.totalCommits).toBe(12);
    expect(data.stats.logFirst).toBe('2026-03-05');
    expect(data.stats.logLast).toBe('2026-09-02');
    expect(data.stats.commitsByProject).toEqual({ helm: 4 });
    expect(data.stats.archivedByProject).toEqual({ helm: 3 });
    expect(data.hasArchive).toBe(true);
    expect(data.archiveLoaded).toBe(false);
  });

  it('defaults hasArchive to false when stats are absent', async () => {
    stubFetch({ projects: [], entries: [] });
    const data = await fetchData();
    expect(data.hasArchive).toBe(false);
    expect(data.stats.totalCommits).toBeUndefined();
  });

  it('degrades to empty data when normalization throws, and logs the error', async () => {
    // A null entry makes the heat-count loop's `e.project` access throw. The error
    // boundary keeps normalization inside it, so this degrades gracefully instead
    // of escaping as an unhandled rejection that stalls the app shell — and the
    // catch warns, so a real bug isn't silently swallowed as "no data".
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch({ projects: [], entries: [null] });
    const data = await fetchData();
    expect(data.entries).toEqual([]);
    expect(data.projects).toEqual([]);
    expect(data.meta.nick).toBe('mase');
    expect(warnSpy).toHaveBeenCalled();
  });
});

// ---- fetchData date routing ----------------------------------------------
// Contract tests for normalizeDate / parseEntryDate / utcDayStart live in
// dates.test.js. These only pin that fetchData runs each raw entry.date
// through the normalizer into the UI-shaped entry.

describe('fetchData date normalization', () => {
  async function dateOf(rawDate) {
    stubFetch({ projects: [], entries: [{ category: 'daily', date: rawDate, text: 't' }] });
    const data = await fetchData();
    return data.entries[0].date;
  }

  it('runs a bare YYYY-MM-DD through normalizeDate', async () => {
    expect(await dateOf('2026-01-01')).toBe('2026-01-01T00:00');
  });

  it('runs a full ISO timestamp through normalizeDate', async () => {
    expect(await dateOf('2026-01-01T08:30:45.123Z')).toBe('2026-01-01T08:30');
  });
});
