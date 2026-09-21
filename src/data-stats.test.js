// Unit tests for the all-history stat rules: logStats totals + commitsForProject.
import { describe, it, expect } from 'vitest';
import { logStats, commitsForProject } from './data.js';
import { entry } from './data-test-helpers.js';

function dataWith(entries) {
  return { entries };
}

// ---- logStats.totalCommits -----------------------------------------------

describe('logStats totalCommits', () => {
  it('returns 0 for empty entries', () => {
    expect(logStats(dataWith([])).totalCommits).toBe(0);
  });

  it('counts only log entries in a mixed dataset', () => {
    const data = dataWith([
      entry('log', 'activity'),
      entry('log', 'explorer'),
      entry('daily', 'home'),
      entry('feature', 'explorer'),
      entry('project', 'explorer'),
    ]);
    expect(logStats(data).totalCommits).toBe(2);
  });

  it('returns 0 when there are no log entries', () => {
    const data = dataWith([entry('daily', 'home'), entry('feature', 'explorer')]);
    expect(logStats(data).totalCommits).toBe(0);
  });

  it('counts a log entry whose date is unparseable', () => {
    const data = dataWith([
      entry('log', 'activity', { date: 'not-a-date' }),
      entry('log', 'activity'),
    ]);
    expect(logStats(data).totalCommits).toBe(2);
  });

  it('adds stats.archivedLogs to the in-memory log count for the all-history total', () => {
    // After a retention cut the hot file holds only recent logs; the pinned
    // "N in feed" figure must keep the all-history total (finding #8804),
    // including logs prepended since the last compact.
    const data = {
      entries: [entry('log', 'activity'), entry('log', 'activity')],
      stats: { archivedLogs: 9666 },
      archiveLoaded: false,
    };
    expect(logStats(data).totalCommits).toBe(9668);
    expect(logStats(data).buckets.length).toBe(28); // buckets still from in-memory
  });

  it('does not add archivedLogs after the archive has been merged into memory', () => {
    const data = {
      entries: [entry('log', 'activity'), entry('log', 'activity')],
      stats: { archivedLogs: 100 },
      archiveLoaded: true,
    };
    expect(logStats(data).totalCommits).toBe(2);
  });

  it('falls back to a snapshot totalCommits when archivedLogs is absent', () => {
    const data = {
      entries: [entry('log', 'activity'), entry('log', 'activity')],
      stats: { totalCommits: 9668 },
    };
    expect(logStats(data).totalCommits).toBe(9668);
  });

  it('prefers the merged rows over a snapshot totalCommits once the archive is in memory', () => {
    // A compact from before archivedLogs existed carries only the snapshot. After
    // a merge every log row is in memory, so the in-memory count is the total.
    const data = {
      entries: [entry('log', 'activity'), entry('log', 'activity'), entry('log', 'activity')],
      stats: { totalCommits: 9000 },
      archiveLoaded: true,
    };
    expect(logStats(data).totalCommits).toBe(3);
  });

  it('ignores a non-numeric stats.totalCommits and falls back to counting', () => {
    const data = {
      entries: [entry('log', 'activity')],
      stats: { totalCommits: 'nope' },
    };
    expect(logStats(data).totalCommits).toBe(1);
  });
});

// ---- logStats.totalEntries -----------------------------------------------

describe('logStats totalEntries', () => {
  const rows = () => [
    entry('log', 'activity'),
    entry('log', 'activity'),
    entry('daily', 'home'),
    entry('feature', 'explorer'),
  ];

  it('is the row count for an uncompacted file', () => {
    expect(logStats(dataWith(rows())).totalEntries).toBe(4);
  });

  it('is the non-log rows plus the all-history log total after a retention cut', () => {
    // 2 non-log rows + (100 archived + 2 hot logs); same figure the #home card
    // shows as its commit total, so the two cards cannot disagree.
    const data = { entries: rows(), stats: { archivedLogs: 100 }, archiveLoaded: false };
    const { totalEntries, totalCommits } = logStats(data);
    expect(totalCommits).toBe(102);
    expect(totalEntries).toBe(104);
  });

  it('is the in-memory row count once the archive is merged', () => {
    const data = { entries: rows(), stats: { archivedLogs: 100 }, archiveLoaded: true };
    expect(logStats(data).totalEntries).toBe(4);
  });

  it('adds the non-log rows to a snapshot totalCommits', () => {
    const data = { entries: rows(), stats: { totalCommits: 50 } };
    expect(logStats(data).totalEntries).toBe(52);
  });
});

// ---- commitsForProject ---------------------------------------------------

describe('commitsForProject', () => {
  const hot = () => [
    entry('log', 'helm'),
    entry('log', 'helm'),
    entry('feature', 'helm'), // not a commit
    entry('log', 'other'), // another channel
  ];
  const project = { slug: 'helm-app', channel: 'helm' };

  it('reads commitsByProject by slug first', () => {
    const data = { entries: hot(), stats: { commitsByProject: { 'helm-app': 42, helm: 7 } } };
    expect(commitsForProject(project, data)).toBe(42);
  });

  it('falls back to the channel key when the slug has no count', () => {
    const data = { entries: hot(), stats: { commitsByProject: { helm: 7 } } };
    expect(commitsForProject(project, data)).toBe(7);
    expect(commitsForProject({ channel: 'helm' }, data)).toBe(7);
  });

  it('counts the project channel log rows in memory without a stat', () => {
    expect(commitsForProject(project, dataWith(hot()))).toBe(2);
  });

  it('ignores non-numeric counts and inherited keys', () => {
    const data = { entries: hot(), stats: { commitsByProject: { 'helm-app': 'x', helm: null } } };
    expect(commitsForProject(project, data)).toBe(2);
    const inherited = { entries: hot(), stats: { commitsByProject: {} } };
    expect(commitsForProject({ slug: 'constructor', channel: 'toString' }, inherited)).toBe(0);
  });
});

// Deploys prepend logs to the hot file between nightly compacts, so a per-project
// count must be archived (compact-time) + in-memory (live), like logStats' total.
describe('commitsForProject — live between compacts (idea #4713)', () => {
  const hot = () => [
    entry('log', 'helm'),
    entry('log', 'helm'),
    entry('log', 'helm'), // prepended by a deploy after the last compact
    entry('log', 'other'),
  ];
  const project = { slug: 'helm', channel: 'helm' };

  it('adds the archived count to the project log rows in memory', () => {
    const data = { entries: hot(), stats: { archivedByProject: { helm: 40 }, commitsByProject: { helm: 42 } } };
    expect(commitsForProject(project, data)).toBe(43);
  });

  it('matches archive keys case-insensitively against the routing slug', () => {
    const data = { entries: hot(), stats: { archivedByProject: { Helm: 10, helm: 5, other: 9 } } };
    expect(commitsForProject(project, data)).toBe(18);
  });

  it('routes by slug, not channel, when the project has its own slug', () => {
    const data = { entries: hot(), stats: { archivedByProject: { 'helm-app': 10, helm: 99 } } };
    expect(commitsForProject({ slug: 'helm-app', channel: 'helm' }, data)).toBe(13);
  });

  it('counts only memory once the archive is merged', () => {
    const data = { entries: hot(), archiveLoaded: true, stats: { archivedByProject: { helm: 40 } } };
    expect(commitsForProject(project, data)).toBe(3);
  });

  it('treats a project absent from the archive as zero archived', () => {
    const data = { entries: hot(), stats: { archivedByProject: {} } };
    expect(commitsForProject(project, data)).toBe(3);
  });

  it('ignores non-numeric archived counts', () => {
    const data = { entries: hot(), stats: { archivedByProject: { helm: 'x', HELM: 2 } } };
    expect(commitsForProject(project, data)).toBe(5);
  });
});
