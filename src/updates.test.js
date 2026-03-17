import { describe, it, expect } from 'vitest';
import { filterEntries } from './updates.js';

const entries = [
  { category: 'project', date: '2026-03-01', text: 'New project' },
  { category: 'feature', date: '2026-03-02', text: 'Feature A' },
  { category: 'feature', date: '2026-03-03', text: 'Feature B' },
  { category: 'daily', date: '2026-03-04', summary: 'Summary' },
  { category: 'log', date: '2026-03-05', text: 'commit abc' },
  { category: 'log', date: '2026-03-06', text: 'commit def' },
];

describe('filterEntries', () => {
  it('"all" returns everything except log entries', () => {
    const result = filterEntries(entries, 'all');
    expect(result).toHaveLength(4);
    expect(result.every(e => e.category !== 'log')).toBe(true);
  });

  it('"project" returns only project entries', () => {
    const result = filterEntries(entries, 'project');
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('project');
  });

  it('"feature" returns project + feature entries (cumulative)', () => {
    const result = filterEntries(entries, 'feature');
    expect(result).toHaveLength(3);
    expect(result.every(e => e.category === 'project' || e.category === 'feature')).toBe(true);
  });

  it('"daily" returns only daily entries', () => {
    const result = filterEntries(entries, 'daily');
    expect(result).toHaveLength(1);
    expect(result[0].category).toBe('daily');
  });

  it('"log" returns only log entries', () => {
    const result = filterEntries(entries, 'log');
    expect(result).toHaveLength(2);
    expect(result.every(e => e.category === 'log')).toBe(true);
  });

  it('returns empty array for empty input', () => {
    expect(filterEntries([], 'all')).toHaveLength(0);
    expect(filterEntries([], 'log')).toHaveLength(0);
  });
});
