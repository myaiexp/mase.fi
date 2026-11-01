// @vitest-environment jsdom
// Unit tests for initTickers's wiring: the synchronous first tick, the 1.2s
// interval, and what each tick writes into #uptime and #ping. The formatter's
// own cases are in uptime.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { initTickers } from './tickers.js';

const NOW = new Date('2026-06-13T12:00:00Z').getTime();
const TICK_MS = 1200;

const text = (id) => document.getElementById(id).textContent;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  document.body.replaceChildren();
  for (const id of ['uptime', 'ping']) {
    const el = document.createElement('span');
    el.id = id;
    document.body.appendChild(el);
  }
});

afterEach(() => {
  vi.clearAllTimers(); // drop the 1.2s interval initTickers registers
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('initTickers', () => {
  it('writes both readouts on the synchronous first tick', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    initTickers(NOW - 18_420_000); // 5h 7m

    expect(text('uptime')).toBe('0d 05h 07m');
    expect(text('ping')).toBe('11ms');
  });

  it('re-renders both readouts every 1.2s, and not between ticks', () => {
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    // Start two ticks short of a minute, so only the second tick rolls #uptime over.
    initTickers(NOW - (60_000 - 2 * TICK_MS));
    expect(text('uptime')).toBe('0d 00h 00m');
    expect(text('ping')).toBe('11ms');

    random.mockReturnValue(0.99);
    vi.advanceTimersByTime(TICK_MS - 1);
    expect(text('ping')).toBe('11ms');
    vi.advanceTimersByTime(1);
    expect(text('ping')).toBe('17ms');
    expect(text('uptime')).toBe('0d 00h 00m');

    random.mockReturnValue(0);
    vi.advanceTimersByTime(TICK_MS - 1);
    expect(text('ping')).toBe('17ms');
    vi.advanceTimersByTime(1);
    expect(text('ping')).toBe('11ms');
    expect(text('uptime')).toBe('0d 00h 01m');
  });
});
