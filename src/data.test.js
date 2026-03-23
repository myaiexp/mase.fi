// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildProjectMap, getChannels, getChannelEntries, getAboutStats } from './data.js';

const projects = [
  { name: 'Explorer', channel: 'explorer', url: 'https://mase.fi/explorer', desc: 'Route planning' },
  { name: 'Personal Tracker', channel: 'tracker', url: 'https://mase.fi/tracker', desc: 'Habit tracking' },
  { name: 'Yatzy', channel: 'yatzy', url: 'https://mase.fi/yatzy', desc: 'Finnish Yatzy' },
];

const entries = [
  { date: '2026-03-22', category: 'daily', project: 'explorer', summary: 'Added offline caching' },
  { date: '2026-03-21', category: 'daily', project: 'Personal Tracker', summary: 'Fixed streak logic' },
  { date: '2026-03-20', category: 'feature', project: 'Explorer', text: 'Offline route caching' },
  { date: '2026-03-18', category: 'feature', project: 'Explorer', text: 'Dark mode map tiles' },
  { date: '2026-03-15', category: 'project', project: 'Yatzy', text: 'Multiplayer Yatzy game' },
  { date: '2026-03-22', category: 'log', project: 'explorer', text: 'fix: offline cache cleanup' },
  { date: '2026-03-21', category: 'log', project: 'Personal Tracker', text: 'refactor: streak calculation' },
  { date: '2026-03-19', category: 'log', project: 'c-monitor', text: 'fix: runner resume' },
  { date: '2026-03-10', category: 'feature', project: 'Personal Tracker', text: 'Data export' },
];

describe('buildProjectMap', () => {
  it('maps lowercase project name to project object', () => {
    const map = buildProjectMap(projects);
    expect(map.get('explorer')).toBe(projects[0]);
    expect(map.get('personal tracker')).toBe(projects[1]);
    expect(map.get('yatzy')).toBe(projects[2]);
  });

  it('returns empty map for empty input', () => {
    const map = buildProjectMap([]);
    expect(map.size).toBe(0);
  });
});

describe('getChannels', () => {
  it('returns three groups: home, projects, meta', () => {
    const channels = getChannels(entries, projects);
    expect(channels.length).toBe(3);
    expect(channels[0].group).toBe('home');
    expect(channels[1].group).toBe('projects');
    expect(channels[2].group).toBe('meta');
  });

  it('includes all project channels', () => {
    const channels = getChannels(entries, projects);
    const projectGroup = channels.find((g) => g.group === 'projects');
    expect(projectGroup.channels.length).toBe(3);
  });

  it('sorts project channels by most recent activity', () => {
    const channels = getChannels(entries, projects);
    const projectGroup = channels.find((g) => g.group === 'projects');
    const ids = projectGroup.channels.map((c) => c.id);
    // explorer has activity on 2026-03-22 (most recent), tracker on 2026-03-21, yatzy on 2026-03-15
    expect(ids).toEqual(['explorer', 'tracker', 'yatzy']);
  });

  it('includes lastActivity date on project channels', () => {
    const channels = getChannels(entries, projects);
    const projectGroup = channels.find((g) => g.group === 'projects');
    const explorer = projectGroup.channels.find((c) => c.id === 'explorer');
    expect(explorer.lastActivity).toBe('2026-03-22');
  });

  it('meta group has activity and about channels', () => {
    const channels = getChannels(entries, projects);
    const meta = channels.find((g) => g.group === 'meta');
    const ids = meta.channels.map((c) => c.id);
    expect(ids).toEqual(['activity', 'about']);
  });

  it('marks new projects with isNew flag', () => {
    // Yatzy has a category=project entry on 2026-03-15
    // With fake time set to 2026-03-23, that's 8 days ago — within 14 days
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T12:00:00'));

    const channels = getChannels(entries, projects);
    const projectGroup = channels.find((g) => g.group === 'projects');
    const yatzy = projectGroup.channels.find((c) => c.id === 'yatzy');
    expect(yatzy.isNew).toBe(true);

    const explorer = projectGroup.channels.find((c) => c.id === 'explorer');
    expect(explorer.isNew).toBe(false);

    vi.useRealTimers();
  });
});

describe('getChannelEntries', () => {
  it('home: returns daily entries sorted ascending (oldest first)', () => {
    const result = getChannelEntries('home', entries, projects);
    expect(result.length).toBe(2);
    // Ascending order: 2026-03-21 before 2026-03-22
    expect(result[0].date).toBe('2026-03-21');
    expect(result[1].date).toBe('2026-03-22');
  });

  it('activity: returns log entries sorted ascending', () => {
    const result = getChannelEntries('activity', entries, projects);
    expect(result.length).toBe(3);
    expect(result[0].date).toBe('2026-03-19');
    expect(result[2].date).toBe('2026-03-22');
  });

  it('project channel: returns matching feature/project entries', () => {
    const result = getChannelEntries('explorer', entries, projects);
    expect(result.length).toBe(2);
    // Both are Explorer features, ascending
    expect(result[0].date).toBe('2026-03-18');
    expect(result[1].date).toBe('2026-03-20');
  });

  it('project channel matches case-insensitively', () => {
    const result = getChannelEntries('tracker', entries, projects);
    expect(result.length).toBe(1);
    expect(result[0].text).toBe('Data export');
  });

  it('about: returns empty array', () => {
    const result = getChannelEntries('about', entries, projects);
    expect(result).toEqual([]);
  });

  it('unknown channel: returns empty array', () => {
    const result = getChannelEntries('nonexistent', entries, projects);
    expect(result).toEqual([]);
  });
});

describe('getAboutStats', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts projects correctly', () => {
    const stats = getAboutStats(entries, projects);
    expect(stats.projectCount).toBe(3);
  });

  it('counts features in current month', () => {
    const stats = getAboutStats(entries, projects);
    // March 2026 features: 2026-03-20, 2026-03-18, 2026-03-15, 2026-03-10 = 4
    expect(stats.featuresThisMonth).toBe(4);
  });

  it('computes lastDeploy relative date', () => {
    const stats = getAboutStats(entries, projects);
    // Most recent entry is 2026-03-22, which is "yesterday" relative to 2026-03-23
    expect(stats.lastDeploy).toBe('yesterday');
  });
});
