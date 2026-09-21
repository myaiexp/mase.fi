// Unit tests for fetchData's project heat + recency (aggregateActivity +
// normalizeProjects are module-private; the public surface is fetchData()).
// Pin Date.now so the 30-day cutoff is a known instant.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchData } from './data.js';
import { stubFetch } from './data-test-helpers.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fetchData project heat + recency', () => {
  // Monday 15 Jun 2026 12:00 UTC. cutoff = this instant minus 30*86400000 =
  // 16 May 2026 12:00 UTC. Entries on/after that instant count toward heat;
  // older ones still set lastActivity (and therefore sort).
  const NOW = new Date('2026-06-15T12:00:00.000Z');
  const IN = '2026-06-10T12:00';       // 5d before NOW — inside the window
  const OUT = '2026-05-01T12:00';      // 45d before NOW — outside
  const NEWER = '2026-06-14T12:00';
  const OLDER = '2026-01-01T12:00';

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  });

  async function load(projects, entries) {
    stubFetch({ projects, entries });
    return fetchData();
  }

  function byChannel(projects) {
    return Object.fromEntries(projects.map((p) => [p.channel, p]));
  }

  it('counts an in-window entry toward heat and ignores one outside the 30-day cutoff', async () => {
    const data = await load(
      [
        { name: 'Hot', channel: 'hot' },
        { name: 'Cold', channel: 'cold' },
      ],
      [
        { category: 'log', project: 'hot', date: IN, text: 'in' },
        { category: 'log', project: 'cold', date: OUT, text: 'out' },
      ],
    );
    const { hot, cold } = byChannel(data.projects);
    expect(hot.heat).toBe(1);
    expect(cold.heat).toBe(0);
    // Recency still records the out-of-window entry — heat and sort are separate.
    expect(cold.lastActivity).toBeGreaterThan(0);
  });

  it('normalizes the busiest project to heat 1.0 and a half-as-busy one to 0.5', async () => {
    const data = await load(
      [
        { name: 'Busy', channel: 'busy' },
        { name: 'Half', channel: 'half' },
      ],
      [
        { category: 'log', project: 'busy', date: IN, text: 'a' },
        { category: 'log', project: 'busy', date: IN, text: 'b' },
        { category: 'feature', project: 'busy', date: IN, text: 'c' },
        { category: 'feature', project: 'busy', date: IN, text: 'd' },
        { category: 'log', project: 'half', date: IN, text: 'e' },
        { category: 'feature', project: 'half', date: IN, text: 'f' },
      ],
    );
    const { busy, half } = byChannel(data.projects);
    expect(busy.heat).toBe(1);
    expect(half.heat).toBe(0.5);
  });

  it('gives heat 0 (not NaN) when there are no log/feature entries (maxCount floor)', async () => {
    const data = await load(
      [{ name: 'Idle', channel: 'idle' }],
      [{ category: 'daily', date: IN, text: 'standup' }],
    );
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].heat).toBe(0);
    expect(Number.isFinite(data.projects[0].heat)).toBe(true);
    expect(data.projects[0].lastActivity).toBe(0);
  });

  it('counts only log and feature toward heat — daily and project categories do not', async () => {
    const data = await load(
      [
        { name: 'DailyHeavy', channel: 'dailyheavy' },
        { name: 'Featured', channel: 'featured' },
      ],
      [
        { category: 'daily', project: 'dailyheavy', date: IN, text: 'd1' },
        { category: 'daily', project: 'dailyheavy', date: IN, text: 'd2' },
        { category: 'daily', project: 'dailyheavy', date: IN, text: 'd3' },
        { category: 'project', project: 'dailyheavy', date: IN, text: 'p1' },
        { category: 'feature', project: 'featured', date: IN, text: 'f1' },
      ],
    );
    const { dailyheavy, featured } = byChannel(data.projects);
    // If daily/project counted, dailyheavy would be 1.0 and featured 0.25.
    expect(featured.heat).toBe(1);
    expect(dailyheavy.heat).toBe(0);
  });

  it('returns projects sorted by newest activity, not input order', async () => {
    const data = await load(
      [
        { name: 'Idle', channel: 'idle' },
        { name: 'Old', channel: 'old' },
        { name: 'New', channel: 'new' },
      ],
      [
        { category: 'log', project: 'old', date: OLDER, text: 'old' },
        { category: 'feature', project: 'new', date: NEWER, text: 'new' },
      ],
    );
    expect(data.projects.map((p) => p.channel)).toEqual(['new', 'old', 'idle']);
    expect(data.projects[0].lastActivity).toBeGreaterThan(data.projects[1].lastActivity);
    expect(data.projects[2].lastActivity).toBe(0);
  });

  it('matches activity to projects case-insensitively on slug (counts map, not just routing)', async () => {
    const data = await load(
      [{ name: 'Explorer', channel: 'exp', slug: 'Explorer' }],
      [
        { category: 'log', project: 'EXPLORER', date: IN, text: 'c1' },
        { category: 'feature', project: 'explorer', date: IN, text: 'c2' },
      ],
    );
    expect(data.projects).toHaveLength(1);
    expect(data.projects[0].heat).toBe(1);
    expect(data.projects[0].lastActivity).toBeGreaterThan(0);
    // Two mixed-case hits against one project — if either side skipped toLowerCase
    // the counts lookup would miss and heat would stay 0.
  });
});
