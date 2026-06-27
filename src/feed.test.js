// Unit tests for feed.js pure helpers: nickColor + dayLabel.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nickColor, dayLabel } from './feed.js';

describe('nickColor', () => {
  it('returns the special-cased color for git', () => {
    expect(nickColor('git')).toBe('#06b6d4');
  });

  it('returns the special-cased color for mase', () => {
    expect(nickColor('mase')).toBe('#e8a308');
  });

  it('returns a palette color for an unknown nick', () => {
    const palette = ['#e8a308', '#ffbe2a', '#f59e0b', '#eab308', '#a16207', '#fcd34d', '#fbbf24'];
    expect(palette).toContain(nickColor('stranger'));
  });

  it('is deterministic — same nick maps to the same color', () => {
    expect(nickColor('alice')).toBe(nickColor('alice'));
  });

  it('handles the empty nick without throwing', () => {
    // h stays 0, Math.abs(0) % len === 0 → first palette entry.
    expect(nickColor('')).toBe('#e8a308');
  });
});

describe('dayLabel', () => {
  // Pin the clock so the today/yesterday branches are deterministic and the
  // timezone-sensitive 'Z'-append (input parsed as UTC) is exercised, not luck.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-27T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("labels the current UTC day as 'today'", () => {
    expect(dayLabel('2026-06-27T12:00:00')).toBe('today \xb7 2026-06-27');
  });

  it("labels the prior UTC day as 'yesterday'", () => {
    expect(dayLabel('2026-06-26T23:00:00')).toBe('yesterday \xb7 2026-06-26');
  });

  it('returns the bare ISO date for older days', () => {
    expect(dayLabel('2020-01-15T08:30:00')).toBe('2020-01-15');
  });

  it('returns the bare ISO date for future days', () => {
    expect(dayLabel('2030-12-31T08:30:00')).toBe('2030-12-31');
  });

  it("treats the input as UTC: a late-UTC time on 'today' is still today", () => {
    // 23:59:59 + 'Z' stays on 2026-06-27 in UTC; without the 'Z' a negative
    // local offset could roll it forward and mislabel the separator.
    expect(dayLabel('2026-06-27T23:59:59')).toBe('today \xb7 2026-06-27');
  });
});
