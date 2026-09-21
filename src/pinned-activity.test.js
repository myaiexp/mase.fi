// @vitest-environment jsdom
// Unit tests for pinned.js's renderPinned — activity card: entry count, log date
// range, and the recent (last-28d) commit rate. See pinned.test.js for the
// shared cardHead/home coverage and jsdom harness note.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderPinned } from './pinned.js';

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
  for (const id of ['pinned', 'hero-line']) {
    const el = document.createElement('div');
    el.id = id;
    document.body.appendChild(el);
  }
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const pinnedEl = () => document.getElementById('pinned');

// A normalized entry matching data.js fetchData() output: { ch, cat, date, nick, text }.
function logEntry(extra = {}) {
  return { ch: 'activity', cat: 'log', date: '2026-01-01T08:00', nick: 'git', text: 't', ...extra };
}

describe('renderPinned — activity', () => {
  it('renders the activity card with the total entry count and a log date range', () => {
    const data = {
      projects: [],
      entries: [
        logEntry({ cat: 'log', date: '2026-01-01T08:00' }),
        logEntry({ cat: 'log', date: '2026-03-15T08:00' }),
        { ch: 'home', cat: 'daily', date: '2026-02-01T08:00', nick: 'mase', text: 'd' },
      ],
    };
    renderPinned('activity', data);
    const html = pinnedEl().innerHTML;
    expect(html).toContain('3 entries');               // data.entries.length (incl. daily)
    expect(html).toContain('2026-01-01 → 2026-03-15'); // first → last log entry
  });

  it('uses precomputed stats for total and range when the hot file is a window', () => {
    // After compact, data.entries is the recent slice; the card must still
    // show all-history figures from stats (finding #8804).
    const data = {
      projects: [],
      entries: [
        logEntry({ cat: 'log', date: '2026-08-01T08:00' }),
        { ch: 'home', cat: 'daily', date: '2026-08-01T08:00', nick: 'mase', text: 'd' },
      ],
      stats: { archivedLogs: 11735, logFirst: '2026-03-05', logLast: '2026-09-02' },
    };
    renderPinned('activity', data);
    const html = pinnedEl().innerHTML;
    // 1 non-log in memory + (11735 archived + 1 hot log) = 11737
    expect(html).toContain('11737 entries');
    expect(html).toContain('2026-03-05 → 2026-09-02');
    expect(html).not.toContain('2026-08-01 → 2026-08-01');
  });

  it('shows an em-dash range when there are no log entries', () => {
    renderPinned('activity', { projects: [], entries: [] });
    const html = pinnedEl().innerHTML;
    expect(html).toContain('0 entries');
    expect(html).toContain('<dt>range</dt><dd>—</dd>');
  });

  // A UTC-noon date string N days ago. logStats buckets by UTC calendar day, so
  // building the string in UTC terms keeps the bucket index deterministic in any
  // runner timezone (noon keeps it clear of the window's start/end edges).
  const utcNoonDaysAgo = (n) => {
    const d = new Date();
    d.setUTCHours(12, 0, 0, 0);
    d.setUTCDate(d.getUTCDate() - n);
    const p = (x) => String(x).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T12:00`;
  };

  it('shows a recent rate computed as average commits per active day (~N/day)', () => {
    const data = {
      projects: [],
      entries: [
        // 4 commits one recent day + 2 another recent day → 6 / 2 active days = ~3.
        logEntry({ cat: 'log', date: utcNoonDaysAgo(3) }),
        logEntry({ cat: 'log', date: utcNoonDaysAgo(3) }),
        logEntry({ cat: 'log', date: utcNoonDaysAgo(3) }),
        logEntry({ cat: 'log', date: utcNoonDaysAgo(3) }),
        logEntry({ cat: 'log', date: utcNoonDaysAgo(7) }),
        logEntry({ cat: 'log', date: utcNoonDaysAgo(7) }),
      ],
    };
    renderPinned('activity', data);
    expect(pinnedEl().innerHTML).toContain('~3/day');
  });

  it('shows an em-dash rate when there is no recent (last-28d) activity', () => {
    const data = {
      projects: [],
      // Older than the 28-day window → no active days → '—', never a stale number.
      entries: [logEntry({ cat: 'log', date: utcNoonDaysAgo(60) })],
    };
    renderPinned('activity', data);
    const html = pinnedEl().innerHTML;
    expect(html).toContain('<i>rate</i><b>—</b>');
  });
});
