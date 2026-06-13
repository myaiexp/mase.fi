// @vitest-environment jsdom
// Unit tests for formatUptime(ms) — the pure 'Xd HHh MMm' formatter behind the
// sidebar uptime ticker. formatUptime is module-private, so (per the normalizeDate
// pattern) it is exercised through its only caller initChrome(): with Date.now()
// frozen, passing bootTime = NOW - ms makes the synchronous first tick write
// formatUptime(ms) into #uptime. Edge cases pinned: 0ms, sub-minute, exactly 1
// day, multi-day, padding, and very large values.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initChrome } from './chrome.js';

// Frozen wall clock so Date.now() - bootTime equals exactly the ms under test,
// independent of real time elapsed during the synchronous initChrome() call.
const NOW = new Date('2026-06-13T12:00:00Z').getTime();

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.clearAllTimers(); // drop the 1.2s interval initChrome registers
  vi.useRealTimers();
});

// Render the uptime string formatUptime(ms) produces, via initChrome's first tick.
function uptimeFor(ms) {
  document.body.replaceChildren();
  for (const id of ['uptime', 'ping']) {
    const el = document.createElement('span');
    el.id = id;
    document.body.appendChild(el);
  }
  initChrome(NOW - ms);
  return document.getElementById('uptime').textContent;
}

describe('formatUptime (via initChrome uptime ticker)', () => {
  it('formats exactly 0ms as all-zero with padded h/m', () => {
    expect(uptimeFor(0)).toBe('0d 00h 00m');
  });

  it('floors sub-second values to zero', () => {
    expect(uptimeFor(500)).toBe('0d 00h 00m');
  });

  it('shows 0 minutes for sub-minute durations (30s)', () => {
    expect(uptimeFor(30_000)).toBe('0d 00h 00m');
  });

  it('does not roll over to 1 minute just under 60s', () => {
    expect(uptimeFor(59_999)).toBe('0d 00h 00m');
  });

  it('counts exactly one minute at 60s', () => {
    expect(uptimeFor(60_000)).toBe('0d 00h 01m');
  });

  it('zero-pads single-digit hours and minutes (5h 7m)', () => {
    // 5*3600 + 7*60 = 18420 seconds
    expect(uptimeFor(18_420_000)).toBe('0d 05h 07m');
  });

  it('formats exactly 1 day as 1d 00h 00m', () => {
    expect(uptimeFor(86_400_000)).toBe('1d 00h 00m');
  });

  it('formats multi-day durations (2d 3h 4m)', () => {
    // 2*86400 + 3*3600 + 4*60 = 183840 seconds
    expect(uptimeFor(183_840_000)).toBe('2d 03h 04m');
  });

  it('handles very large 3-digit day counts (999d 23h 59m)', () => {
    // 999*86400 + 23*3600 + 59*60 = 86399940 seconds
    expect(uptimeFor(86_399_940_000)).toBe('999d 23h 59m');
  });

  it('handles very large day counts without padding the day field', () => {
    // 10000 days exactly
    expect(uptimeFor(864_000_000_000)).toBe('10000d 00h 00m');
  });
});
