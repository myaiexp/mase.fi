import { describe, it, expect } from 'vitest';
import { formatDate } from './utils.js';

describe('formatDate', () => {
  it('converts ISO date to Finnish format', () => {
    expect(formatDate('2026-03-17')).toBe('17.03.2026');
  });

  it('handles single-digit day/month', () => {
    expect(formatDate('2025-01-05')).toBe('05.01.2025');
  });

  it('returns empty string for null/undefined', () => {
    expect(formatDate(null)).toBe('');
    expect(formatDate(undefined)).toBe('');
    expect(formatDate('')).toBe('');
  });
});
