// Unit tests for the data adapter (fetch + normalize + channel routing/bucketing).
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fetchData,
  entriesFor,
  totalLogCount,
  dailyLogBuckets,
  lastLog,
} from './data.js';

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

// Local-time date string "YYYY-MM-DDTHH:MM" for `offsetDays` from today's local
// midnight, defaulting to noon so DST drift (~1h) can never push it across a day
// boundary in dailyLogBuckets' floor() math.
function dayStr(offsetDays, hour = 12) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + offsetDays);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(hour)}:00`;
}

function stubFetch(payload) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ json: async () => payload }));
}

afterEach(() => {
  vi.unstubAllGlobals();
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
    expect(data.entries.map((e) => e.nick)).toEqual(['mase', 'git']);
  });

  it('returns empty entries/projects when fetch rejects', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const data = await fetchData();
    expect(data.entries).toEqual([]);
    expect(data.projects).toEqual([]);
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

  it('returns an unrecognized date format unchanged', async () => {
    expect(await dateOf('01/02/2026')).toBe('01/02/2026');
  });
});

// ---- totalLogCount -------------------------------------------------------

describe('totalLogCount', () => {
  it('returns 0 for empty entries', () => {
    expect(totalLogCount(dataWith([]))).toBe(0);
  });

  it('counts only log entries in a mixed dataset', () => {
    const data = dataWith([
      entry('log', 'activity'),
      entry('log', 'explorer'),
      entry('daily', 'home'),
      entry('feature', 'explorer'),
      entry('project', 'explorer'),
    ]);
    expect(totalLogCount(data)).toBe(2);
  });

  it('returns 0 when there are no log entries', () => {
    const data = dataWith([entry('daily', 'home'), entry('feature', 'explorer')]);
    expect(totalLogCount(data)).toBe(0);
  });
});

// ---- dailyLogBuckets -----------------------------------------------------

describe('dailyLogBuckets', () => {
  it('returns an all-zero array of the requested length for empty input', () => {
    expect(dailyLogBuckets(dataWith([]), 3)).toEqual([0, 0, 0]);
  });

  it('defaults to a 28-element window', () => {
    expect(dailyLogBuckets(dataWith([]))).toHaveLength(28);
  });

  it('places a single log entry today in the last bucket', () => {
    const data = dataWith([entry('log', 'activity', { date: dayStr(0) })]);
    expect(dailyLogBuckets(data, 3)).toEqual([0, 0, 1]);
  });

  it('sums multiple entries falling on the same day', () => {
    const data = dataWith([
      entry('log', 'activity', { date: dayStr(0, 9) }),
      entry('log', 'activity', { date: dayStr(0, 14) }),
      entry('log', 'activity', { date: dayStr(0, 20) }),
    ]);
    expect(dailyLogBuckets(data, 3)).toEqual([0, 0, 3]);
  });

  it('distributes entries spanning days into the correct buckets', () => {
    const data = dataWith([
      entry('log', 'activity', { date: dayStr(-2) }), // oldest → index 0
      entry('log', 'activity', { date: dayStr(-1) }), // index 1
      entry('log', 'activity', { date: dayStr(0) }), //  today → index 2
    ]);
    expect(dailyLogBuckets(data, 3)).toEqual([1, 1, 1]);
  });

  it('ignores entries outside the window (older than start, in the future)', () => {
    const data = dataWith([
      entry('log', 'activity', { date: dayStr(-3) }), // just before window start
      entry('log', 'activity', { date: dayStr(1) }), //  tomorrow, after window end
      entry('log', 'activity', { date: dayStr(-2) }), // index 0 — the only one counted
    ]);
    expect(dailyLogBuckets(data, 3)).toEqual([1, 0, 0]);
  });

  it('ignores non-log entries and unparseable dates', () => {
    const data = dataWith([
      entry('feature', 'explorer', { date: dayStr(0) }), // not a log
      entry('log', 'activity', { date: 'not-a-date' }), //  unparseable
      entry('log', 'activity', { date: dayStr(0) }), //     the only counted entry
    ]);
    expect(dailyLogBuckets(data, 3)).toEqual([0, 0, 1]);
  });
});

// ---- lastLog -------------------------------------------------------------

describe('lastLog', () => {
  it('returns null for empty entries', () => {
    expect(lastLog(dataWith([]))).toBeNull();
  });

  it('returns null when there are no log entries', () => {
    const data = dataWith([entry('daily', 'home'), entry('feature', 'explorer')]);
    expect(lastLog(data)).toBeNull();
  });

  it('returns the newest log entry regardless of input order', () => {
    const data = dataWith([
      entry('log', 'activity', { date: '2026-01-10T08:00', project: 'a' }),
      entry('log', 'activity', { date: '2026-03-20T08:00', project: 'newest' }),
      entry('log', 'activity', { date: '2026-02-01T08:00', project: 'b' }),
      entry('daily', 'home', { date: '2026-12-31T08:00', project: 'ignored' }), // non-log, ignored
    ]);
    const got = lastLog(data);
    expect(got.date).toBe('2026-03-20T08:00');
    expect(got.project).toBe('newest');
  });
});
