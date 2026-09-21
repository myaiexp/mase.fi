// Unit tests for logStats.buckets and logStats.last (time-windowed rollups).
// Totals and commitsForProject live in data-stats.test.js.
import { describe, it, expect } from 'vitest';
import { logStats } from './data.js';
import { entry } from './data-test-helpers.js';

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

// ---- logStats.buckets ------------------------------------------------------

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

// ---- logStats.last ---------------------------------------------------------

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
