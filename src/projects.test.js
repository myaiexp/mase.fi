import { describe, it, expect } from 'vitest';
import { getProjectEntries, sortProjects } from './projects.js';

const entries = [
  { project: 'Alpha', category: 'feature', date: '2026-03-10', text: 'A1' },
  { project: 'Alpha', category: 'log', date: '2026-03-11', text: 'commit' },
  { project: 'Beta', category: 'project', date: '2026-03-15', text: 'B1' },
  { project: 'Beta', category: 'feature', date: '2026-03-12', text: 'B2' },
  { project: 'Gamma', category: 'log', date: '2026-03-16', text: 'G commit' },
];

describe('getProjectEntries', () => {
  it('returns entries matching project name (case-insensitive)', () => {
    const result = getProjectEntries(entries, 'alpha');
    expect(result).toHaveLength(2);
    expect(result.every(e => e.project === 'Alpha')).toBe(true);
  });

  it('returns empty array for unknown project', () => {
    expect(getProjectEntries(entries, 'Unknown')).toHaveLength(0);
  });

  it('handles entries with no project field', () => {
    const withMissing = [...entries, { category: 'daily', date: '2026-03-01' }];
    expect(getProjectEntries(withMissing, 'Alpha')).toHaveLength(2);
  });
});

describe('sortProjects', () => {
  const projects = [
    { name: 'Alpha' },
    { name: 'Beta' },
    { name: 'Gamma' },
  ];

  it('sorts by most recent feature/project entry date (descending)', () => {
    const sorted = sortProjects(projects, entries);
    expect(sorted[0].name).toBe('Beta');  // 2026-03-15 (project entry)
    expect(sorted[1].name).toBe('Alpha'); // 2026-03-10 (feature entry)
  });

  it('projects with only log entries sort to bottom', () => {
    const sorted = sortProjects(projects, entries);
    expect(sorted[2].name).toBe('Gamma'); // only log entries
  });

  it('handles empty entries array', () => {
    const sorted = sortProjects(projects, []);
    expect(sorted).toHaveLength(3);
  });

  it('handles empty projects array', () => {
    expect(sortProjects([], entries)).toHaveLength(0);
  });
});
