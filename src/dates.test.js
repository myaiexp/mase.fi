// Unit tests for dates.js: normalizeDate, day/time accessors, parseEntryDate.
import { describe, it, expect } from 'vitest';
import { normalizeDate, parseEntryDate, dayOf, timeOf, utcDayStart } from './dates.js';

const EPOCH = '1970-01-01T00:00';

describe('normalizeDate', () => {
  it('appends T00:00 to a bare YYYY-MM-DD date', () => {
    expect(normalizeDate('2026-01-01')).toBe('2026-01-01T00:00');
  });

  it('truncates a full ISO timestamp to minute precision', () => {
    expect(normalizeDate('2026-01-01T08:30:45.123Z')).toBe('2026-01-01T08:30');
  });

  it('leaves an already-minute-precision timestamp unchanged', () => {
    expect(normalizeDate('2026-01-01T08:30')).toBe('2026-01-01T08:30');
  });

  it('trims surrounding whitespace before matching', () => {
    expect(normalizeDate('  2026-01-01T08:30  ')).toBe('2026-01-01T08:30');
    expect(normalizeDate('  2026-01-01  ')).toBe('2026-01-01T00:00');
  });

  it('falls back to the epoch for empty, missing, or non-string input', () => {
    expect(normalizeDate('')).toBe(EPOCH);
    expect(normalizeDate('   ')).toBe(EPOCH);
    expect(normalizeDate(null)).toBe(EPOCH);
    expect(normalizeDate(undefined)).toBe(EPOCH);
    expect(normalizeDate(0)).toBe(EPOCH);
    expect(normalizeDate({})).toBe(EPOCH);
  });

  it('bounds an unrecognized date format to the epoch fallback', () => {
    expect(normalizeDate('01/02/2026')).toBe(EPOCH);
    expect(normalizeDate('2026-1-1')).toBe(EPOCH);
  });

  it('bounds an oversized/garbage date string to the epoch fallback', () => {
    expect(normalizeDate('"><script>alert(1)</script>'.repeat(20))).toBe(EPOCH);
  });

  // Timestamp-shaped garbage: contains Tdd:dd, so a loose "has a time
  // component" check would emit a string parseEntryDate turns into an
  // Invalid Date. These must still fall back — a well-formed-looking
  // timestamp that isn't a real UTC instant is garbage, not a date.
  it('falls back to epoch for a timestamp-shaped but invalid calendar', () => {
    expect(normalizeDate('2026-13-45T99:99')).toBe(EPOCH);
    expect(normalizeDate('2026-00-01T00:00')).toBe(EPOCH);
    expect(normalizeDate('2026-01-32T00:00')).toBe(EPOCH);
    expect(normalizeDate('2026-01-01T23:60')).toBe(EPOCH);
  });

  it('falls back to epoch for Tdd:dd embedded in non-date text', () => {
    expect(normalizeDate('junkT12:34here')).toBe(EPOCH);
    expect(normalizeDate('<img src=x>T12:34')).toBe(EPOCH);
  });

  it('rejects calendar overflow that JS would otherwise roll forward', () => {
    expect(normalizeDate('2026-02-31T00:00')).toBe(EPOCH);
    expect(normalizeDate('2026-02-30T12:00')).toBe(EPOCH);
    expect(normalizeDate('2026-01-01T24:00')).toBe(EPOCH);
    expect(normalizeDate('2025-02-29T00:00')).toBe(EPOCH);
    expect(normalizeDate('2026-02-30')).toBe(EPOCH);
    expect(normalizeDate('2026-13-01')).toBe(EPOCH);
  });

  it('accepts a real leap day', () => {
    expect(normalizeDate('2024-02-29T00:00')).toBe('2024-02-29T00:00');
    expect(normalizeDate('2024-02-29')).toBe('2024-02-29T00:00');
  });
});

describe('dayOf / timeOf', () => {
  it('splits a normalized stamp into the calendar day and wall-clock time', () => {
    expect(dayOf('2026-03-20T09:15')).toBe('2026-03-20');
    expect(timeOf('2026-03-20T09:15')).toBe('09:15');
  });

  it('reads the same offsets from a longer ISO string (toISOString shape)', () => {
    expect(dayOf('2026-06-27T10:00:00.000Z')).toBe('2026-06-27');
    expect(timeOf('2026-06-27T10:00:00.000Z')).toBe('10:00');
  });

  it('does not throw on missing or short input', () => {
    expect(dayOf('')).toBe('');
    expect(timeOf('')).toBe('');
    expect(dayOf(null)).toBe('');
    expect(timeOf(null)).toBe('');
  });
});

describe('parseEntryDate', () => {
  it('parses a normalized entry date as UTC, not viewer-local', () => {
    expect(parseEntryDate('2026-01-01T08:30').toISOString()).toBe('2026-01-01T08:30:00.000Z');
  });

  it('parses the epoch fallback to time zero', () => {
    expect(parseEntryDate(EPOCH).getTime()).toBe(0);
  });

  it('treats midnight as the same UTC day (no off-by-one day shift)', () => {
    expect(dayOf(parseEntryDate('2026-01-01T00:00').toISOString())).toBe('2026-01-01');
  });

  it('turns a non-ISO string into an Invalid Date (why normalizeDate must not emit one)', () => {
    expect(Number.isNaN(parseEntryDate('junkT12:34here').getTime())).toBe(true);
    expect(() => parseEntryDate('junkT12:34here').toISOString()).toThrow(RangeError);
  });
});

describe('normalizeDate → parseEntryDate coupling', () => {
  it('round-trips a well-formed date as UTC', () => {
    expect(parseEntryDate(normalizeDate('2026-01-01T08:30')).toISOString())
      .toBe('2026-01-01T08:30:00.000Z');
  });

  it('never throws toISOString for arbitrary input', () => {
    const hostile = [
      '',
      null,
      undefined,
      0,
      {},
      '01/02/2026',
      '2026-13-45T99:99',
      'junkT12:34here',
      '<img src=x>T12:34',
      '"><script>alert(1)</script>'.repeat(20),
      '2026-02-31T00:00',
      '2026-02-30T12:00',
      '2026-01-01T24:00',
      '2026-01-01 08:30',
      'T12:34',
      '2026-01-01T08:30:45.123Z',
      '  2026-01-01  ',
    ];
    for (const x of hostile) {
      expect(() => parseEntryDate(normalizeDate(x)).toISOString()).not.toThrow();
      expect(normalizeDate(x)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    }
  });
});

describe('utcDayStart', () => {
  it('returns UTC midnight of the date\'s UTC calendar day', () => {
    const d = new Date('2026-06-13T23:30:00Z');
    expect(utcDayStart(d)).toBe(Date.UTC(2026, 5, 13));
  });

  it('is the same instant for every time on that UTC day', () => {
    const a = utcDayStart(new Date('2026-06-13T00:00:00Z'));
    const b = utcDayStart(new Date('2026-06-13T12:00:00Z'));
    const c = utcDayStart(new Date('2026-06-13T23:59:59Z'));
    expect(a).toBe(b);
    expect(b).toBe(c);
  });

  it('differs by exactly 86400000 ms across consecutive UTC days (DST-immune)', () => {
    // Europe/Helsinki DST spring-forward is 2026-03-29; UTC days stay 86400000.
    const before = utcDayStart(new Date('2026-03-28T12:00:00Z'));
    const on = utcDayStart(new Date('2026-03-29T12:00:00Z'));
    const after = utcDayStart(new Date('2026-03-30T12:00:00Z'));
    expect(on - before).toBe(86400000);
    expect(after - on).toBe(86400000);
  });
});
