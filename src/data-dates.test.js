// fetchData runs each raw entry.date through the date normalizer
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchData } from './data.js';
import { stubFetch } from './data-test-helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ---- fetchData date routing ----------------------------------------------
// Contract tests for normalizeDate / parseEntryDate / utcDayStart live in
// dates.test.js. These only pin that fetchData runs each raw entry.date
// through the normalizer into the UI-shaped entry.

describe('fetchData date normalization', () => {
  /** @param {string} rawDate */
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
