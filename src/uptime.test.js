// Unit tests for the cosmetic readouts: the 'Xd HHh MMm' formatter and fakePing's range.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { fakePing, formatUptime } from './uptime.js';

afterEach(() => vi.restoreAllMocks());

describe('formatUptime', () => {
  it('formats exactly 0ms as all-zero with padded h/m', () => {
    expect(formatUptime(0)).toBe('0d 00h 00m');
  });

  it('floors sub-second values to zero', () => {
    expect(formatUptime(500)).toBe('0d 00h 00m');
  });

  it('shows 0 minutes for sub-minute durations (30s)', () => {
    expect(formatUptime(30_000)).toBe('0d 00h 00m');
  });

  it('does not roll over to 1 minute just under 60s', () => {
    expect(formatUptime(59_999)).toBe('0d 00h 00m');
  });

  it('counts exactly one minute at 60s', () => {
    expect(formatUptime(60_000)).toBe('0d 00h 01m');
  });

  it('zero-pads single-digit hours and minutes (5h 7m)', () => {
    // 5*3600 + 7*60 = 18420 seconds
    expect(formatUptime(18_420_000)).toBe('0d 05h 07m');
  });

  it('formats exactly 1 day as 1d 00h 00m', () => {
    expect(formatUptime(86_400_000)).toBe('1d 00h 00m');
  });

  it('formats multi-day durations (2d 3h 4m)', () => {
    // 2*86400 + 3*3600 + 4*60 = 183840 seconds
    expect(formatUptime(183_840_000)).toBe('2d 03h 04m');
  });

  it('handles very large 3-digit day counts (999d 23h 59m)', () => {
    // 999*86400 + 23*3600 + 59*60 = 86399940 seconds
    expect(formatUptime(86_399_940_000)).toBe('999d 23h 59m');
  });

  it('handles very large day counts without padding the day field', () => {
    // 10000 days exactly
    expect(formatUptime(864_000_000_000)).toBe('10000d 00h 00m');
  });
});

describe('fakePing', () => {
  it('stays within 11–17ms at both ends of Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValue(0);
    expect(fakePing()).toBe(11);
    random.mockReturnValue(0.999999);
    expect(fakePing()).toBe(17);
  });
});
