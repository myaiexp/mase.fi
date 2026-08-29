// Unit tests for the data adapter (fetch + normalize + channel routing/bucketing).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchData, fetchDemos, entriesFor, logStats, parseEntryDate } from './data.js';

// ---- helpers -------------------------------------------------------------

// A normalized entry as produced by fetchData(): { ch, cat, date, nick, text, project? }.
function entry(cat, ch, extra = {}) {
  return {
    ch,
    cat,
    date: '2026-01-01T00:00',
    nick: cat === 'log' ? 'git' : 'mase',
    text: 't',
    ...extra,
  };
}

function dataWith(entries) {
  return { entries };
}

// Normalized date string "YYYY-MM-DDTHH:MM" for `offsetDays` from today's UTC
// date, at the given UTC hour. logStats now buckets by UTC calendar day (the same
// day the feed's separators use), so tests build dates in UTC terms — the shared
// day definition — which makes the bucket index deterministic in any runner
// timezone AND lets tests hit the exact midnight boundary instead of dodging it.
function dayStr(offsetDays, hour = 12) {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(hour)}:00`;
}

function stubFetch(payload) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubDemosResponse(ok, body) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => body }));
}

// ---- fetchDemos ----------------------------------------------------------

describe('fetchDemos', () => {
  it('returns the channel-slug array on a successful manifest fetch', async () => {
    stubDemosResponse(true, ['helm', 'metsuri']);
    expect(await fetchDemos()).toEqual(['helm', 'metsuri']);
  });

  it('filters out non-string entries', async () => {
    stubDemosResponse(true, ['helm', 3, null, 'x']);
    expect(await fetchDemos()).toEqual(['helm', 'x']);
  });

  it('returns [] on a non-ok response (no demos dir yet)', async () => {
    stubDemosResponse(false, ['helm']);
    expect(await fetchDemos()).toEqual([]);
  });

  it('returns [] when the body is not an array', async () => {
    stubDemosResponse(true, { helm: true });
    expect(await fetchDemos()).toEqual([]);
  });

  it('returns [] on a network/parse failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await fetchDemos()).toEqual([]);
  });

  it('returns [] when the manifest fetch is aborted (timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
    ));
    expect(await fetchDemos()).toEqual([]);
  });

  it('passes an AbortSignal so a hung manifest can be cancelled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);
    await fetchDemos();
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
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

// ---- fetchData: project links builder ------------------------------------
// p.url → links[]. The builder must surface only http(s) links and drop
// protocol-based XSS vectors (javascript:/data:/vbscript:) that parse cleanly
// via new URL() but carry no usable host.

describe('fetchData project links', () => {
  async function linksFor(url) {
    stubFetch({ projects: [{ name: 'P', channel: 'p', url }], entries: [] });
    const data = await fetchData();
    return data.projects[0].links;
  }

  it('builds an http(s) link labelled by host, stripping a www. prefix', async () => {
    expect(await linksFor('https://www.example.com/path')).toEqual([
      { label: 'example.com', href: 'https://www.example.com/path' },
    ]);
  });

  it('keeps a bare https host as the label', async () => {
    expect(await linksFor('https://mase.fi/explorer')).toEqual([
      { label: 'mase.fi', href: 'https://mase.fi/explorer' },
    ]);
  });

  it('drops a javascript: URL (parses cleanly but is not http/https)', async () => {
    expect(await linksFor('javascript:alert(1)')).toEqual([]);
  });

  it('drops a data: URL', async () => {
    expect(await linksFor('data:text/html,<script>alert(1)</script>')).toEqual([]);
  });

  it('drops a vbscript: URL', async () => {
    expect(await linksFor('vbscript:msgbox(1)')).toEqual([]);
  });

  it('falls back to an "open" link for a schemeless/relative URL', async () => {
    expect(await linksFor('/explorer')).toEqual([{ label: 'open', href: '/explorer' }]);
  });

  it('produces no links when the project has no url', async () => {
    expect(await linksFor(undefined)).toEqual([]);
  });
});

// ---- normalizeDate (via fetchData) ---------------------------------------
// normalizeDate is module-private (not exported), so it's exercised through its
// only caller: fetchData maps each entry's raw date through it into entry.date.
// These pin every branch of the normalizer by asserting the resulting .date.

describe('fetchData date normalization (normalizeDate)', () => {
  // Push one daily entry (no project → routes to #home regardless of date) and
  // read back the normalized date fetchData produced.
  async function dateOf(rawDate) {
    stubFetch({ projects: [], entries: [{ category: 'daily', date: rawDate, text: 't' }] });
    const data = await fetchData();
    return data.entries[0].date;
  }

  it('appends T00:00 to a bare YYYY-MM-DD date', async () => {
    expect(await dateOf('2026-01-01')).toBe('2026-01-01T00:00');
  });

  it('truncates a full ISO timestamp to minute precision (YYYY-MM-DDTHH:MM)', async () => {
    expect(await dateOf('2026-01-01T08:30:45.123Z')).toBe('2026-01-01T08:30');
  });

  it('leaves an already-minute-precision timestamp unchanged', async () => {
    expect(await dateOf('2026-01-01T08:30')).toBe('2026-01-01T08:30');
  });

  it('falls back to the epoch for an empty/missing date', async () => {
    expect(await dateOf('')).toBe('1970-01-01T00:00');
  });

  it('bounds an unrecognized date format to the epoch fallback', async () => {
    expect(await dateOf('01/02/2026')).toBe('1970-01-01T00:00');
  });

  it('bounds an oversized/garbage date string to the epoch fallback', async () => {
    expect(await dateOf('"><script>alert(1)</script>'.repeat(20))).toBe('1970-01-01T00:00');
  });

  it('round-trips through parseEntryDate: normalized output parses as UTC', async () => {
    // The contract that couples the two helpers — normalizeDate's output shape is
    // exactly what parseEntryDate accepts. Change one and this test fails.
    expect(parseEntryDate(await dateOf('2026-01-01T08:30')).toISOString())
      .toBe('2026-01-01T08:30:00.000Z');
  });
});

// ---- parseEntryDate -------------------------------------------------------

describe('parseEntryDate', () => {
  it('parses a normalized entry date as UTC, not viewer-local', () => {
    expect(parseEntryDate('2026-01-01T08:30').toISOString()).toBe('2026-01-01T08:30:00.000Z');
  });

  it('parses the epoch fallback to time zero', () => {
    expect(parseEntryDate('1970-01-01T00:00').getTime()).toBe(0);
  });

  it('treats midnight as the same UTC day (no off-by-one day shift)', () => {
    expect(parseEntryDate('2026-01-01T00:00').toISOString().slice(0, 10)).toBe('2026-01-01');
  });
});

// ---- logStats.totalCommits -----------------------------------------------

describe('logStats totalCommits', () => {
  it('returns 0 for empty entries', () => {
    expect(logStats(dataWith([])).totalCommits).toBe(0);
  });

  it('counts only log entries in a mixed dataset', () => {
    const data = dataWith([
      entry('log', 'activity'),
      entry('log', 'explorer'),
      entry('daily', 'home'),
      entry('feature', 'explorer'),
      entry('project', 'explorer'),
    ]);
    expect(logStats(data).totalCommits).toBe(2);
  });

  it('returns 0 when there are no log entries', () => {
    const data = dataWith([entry('daily', 'home'), entry('feature', 'explorer')]);
    expect(logStats(data).totalCommits).toBe(0);
  });

  it('counts a log entry whose date is unparseable', () => {
    const data = dataWith([
      entry('log', 'activity', { date: 'not-a-date' }),
      entry('log', 'activity', { date: dayStr(0) }),
    ]);
    expect(logStats(data).totalCommits).toBe(2);
  });
});

// ---- logStats.buckets ----------------------------------------------------

describe('logStats buckets', () => {
  it('returns an all-zero array of the requested length for empty input', () => {
    expect(logStats(dataWith([]), 3).buckets).toEqual([0, 0, 0]);
  });

  it('defaults to a 28-element window', () => {
    expect(logStats(dataWith([])).buckets).toHaveLength(28);
  });

  it('places a single log entry today in the last bucket', () => {
    const data = dataWith([entry('log', 'activity', { date: dayStr(0) })]);
    expect(logStats(data, 3).buckets).toEqual([0, 0, 1]);
  });

  it('sums multiple entries falling on the same day', () => {
    const data = dataWith([
      entry('log', 'activity', { date: dayStr(0, 9) }),
      entry('log', 'activity', { date: dayStr(0, 14) }),
      entry('log', 'activity', { date: dayStr(0, 20) }),
    ]);
    expect(logStats(data, 3).buckets).toEqual([0, 0, 3]);
  });

  it('distributes entries spanning days into the correct buckets', () => {
    const data = dataWith([
      entry('log', 'activity', { date: dayStr(-2) }), // oldest → index 0
      entry('log', 'activity', { date: dayStr(-1) }), // index 1
      entry('log', 'activity', { date: dayStr(0) }), //  today → index 2
    ]);
    expect(logStats(data, 3).buckets).toEqual([1, 1, 1]);
  });

  it('ignores entries outside the window (older than start, in the future)', () => {
    const data = dataWith([
      entry('log', 'activity', { date: dayStr(-3) }), // just before window start
      entry('log', 'activity', { date: dayStr(1) }), //  tomorrow, after window end
      entry('log', 'activity', { date: dayStr(-2) }), // index 0 — the only one counted
    ]);
    expect(logStats(data, 3).buckets).toEqual([1, 0, 0]);
  });

  it('ignores non-log entries and unparseable dates', () => {
    const data = dataWith([
      entry('feature', 'explorer', { date: dayStr(0) }), // not a log
      entry('log', 'activity', { date: 'not-a-date' }), //  unparseable
      entry('log', 'activity', { date: dayStr(0) }), //     the only counted entry
    ]);
    expect(logStats(data, 3).buckets).toEqual([0, 0, 1]);
  });

  it('keeps a UTC-midnight entry on its own UTC day (no per-viewer boundary split)', () => {
    // The exact case the old local-time flooring shifted per viewer: 00:00 must
    // land on the SAME UTC day as noon, never spill into an adjacent bucket. Both
    // are today → the last bucket.
    const data = dataWith([
      entry('log', 'activity', { date: dayStr(0, 0) }), //  UTC midnight
      entry('log', 'activity', { date: dayStr(0, 12) }), // UTC noon, same day
      entry('log', 'activity', { date: dayStr(0, 23) }), // UTC 23:00, same day
    ]);
    expect(logStats(data, 3).buckets).toEqual([0, 0, 3]);
  });

  it('splits entries at the UTC day boundary, not a viewer-local one', () => {
    // 23:00 yesterday and 00:00 today straddle UTC midnight → adjacent buckets.
    // With days=2 the window is [yesterday, today]; both ends land exactly on the
    // boundary the old code dodged with noon-only timestamps.
    const data = dataWith([
      entry('log', 'activity', { date: dayStr(-1, 0) }), //  yesterday 00:00 → idx 0
      entry('log', 'activity', { date: dayStr(-1, 23) }), // yesterday 23:00 → idx 0
      entry('log', 'activity', { date: dayStr(0, 0) }), //   today 00:00 → idx 1
    ]);
    expect(logStats(data, 2).buckets).toEqual([2, 1]);
  });
});

// ---- logStats.last -------------------------------------------------------

describe('logStats last', () => {
  it('returns null for empty entries', () => {
    expect(logStats(dataWith([])).last).toBeNull();
  });

  it('returns null when there are no log entries', () => {
    const data = dataWith([entry('daily', 'home'), entry('feature', 'explorer')]);
    expect(logStats(data).last).toBeNull();
  });

  it('returns the newest log entry regardless of input order', () => {
    const data = dataWith([
      entry('log', 'activity', { date: '2026-01-10T08:00', project: 'a' }),
      entry('log', 'activity', { date: '2026-03-20T08:00', project: 'newest' }),
      entry('log', 'activity', { date: '2026-02-01T08:00', project: 'b' }),
      entry('daily', 'home', { date: '2026-12-31T08:00', project: 'ignored' }), // non-log, ignored
    ]);
    const got = logStats(data).last;
    expect(got.date).toBe('2026-03-20T08:00');
    expect(got.project).toBe('newest');
  });

  it('still considers a log entry whose date is unparseable', () => {
    const data = dataWith([entry('log', 'activity', { date: 'zzz-unparseable' })]);
    expect(logStats(data).last.date).toBe('zzz-unparseable');
  });
});
