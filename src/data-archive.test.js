// Unit tests for loadArchive: archive merge, failure degrade, shared normalization
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchData, entriesFor, logStats } from './data.js';
import { loadArchive } from './data-archive.js';
import { entry, stubFetch } from './data-test-helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// The hot file keeps recent logs; older ones live at /updates-archive.json
// and merge into data.entries when the activity sentinel exhausts.
describe('loadArchive', () => {
  it('is a no-op when hasArchive is false (does not fetch)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const data = { entries: [entry('log', 'activity')], projects: [], hasArchive: false, archiveLoaded: false };
    await loadArchive(data);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(data.archiveLoaded).toBe(false);
  });

  it('is a no-op when the archive was already merged', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const data = { entries: [], projects: [], hasArchive: true, archiveLoaded: true };
    await loadArchive(data);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('merges archived logs into data.entries, normalized and sorted, without duplicating', async () => {
    stubFetch({
      entries: [
        { category: 'log', project: 'helm', date: '2026-01-01T10:00', text: 'ancient' },
        { category: 'log', project: 'helm', date: '2026-08-20T10:00', text: 'already-hot' },
      ],
    });
    const data = {
      projects: [{ name: 'Helm', channel: 'helm', slug: 'helm' }],
      entries: [
        entry('log', 'activity', { date: '2026-08-20T10:00', text: 'already-hot', project: 'helm' }),
        entry('log', 'activity', { date: '2026-09-01T10:00', text: 'recent', project: 'helm' }),
      ],
      hasArchive: true,
      archiveLoaded: false,
    };
    await loadArchive(data);
    expect(data.archiveLoaded).toBe(true);
    expect(data.entries.map((e) => e.text)).toEqual(['ancient', 'already-hot', 'recent']);
    expect(data.entries[0]).toMatchObject({ cat: 'log', nick: 'git', project: 'helm' });
  });

  // A failed load must not set archiveLoaded: logStats and pinnedActivity read it
  // as "archive rows are in memory" and would drop stats.archivedLogs from the
  // all-history totals for the rest of the session (findings #9433, #9444).
  describe('failed load keeps archiveLoaded false and the totals intact', () => {
    const failures = {
      'a rejected fetch': () => vi.fn().mockRejectedValue(new Error('timeout')),
      'an HTTP 404': () => vi.fn().mockResolvedValue({ ok: false, status: 404, json: vi.fn() }),
      'a non-array entries payload': () => vi.fn().mockResolvedValue({ ok: true, json: async () => ({ entries: null }) }),
      'an unparseable body': () => vi.fn().mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('truncated'); } }),
    };
    for (const [label, makeFetch] of Object.entries(failures)) {
      it(`on ${label}`, async () => {
        const fetchMock = makeFetch();
        vi.stubGlobal('fetch', fetchMock);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const data = {
          entries: [entry('log', 'activity'), entry('daily', 'home')],
          projects: [],
          stats: { archivedLogs: 500 },
          hasArchive: true,
          archiveLoaded: false,
        };
        await expect(loadArchive(data)).resolves.toBe(data);
        expect(data.archiveLoaded).toBe(false);
        expect(data.entries).toHaveLength(2);
        expect(warn).toHaveBeenCalledOnce();
        expect(logStats(data).totalCommits).toBe(501);
        // A 404 must not parse the error body as archive rows.
        if (label === 'an HTTP 404') expect((await fetchMock.mock.results[0].value).json).not.toHaveBeenCalled();
        // The caller may try again: nothing latched the failure.
        await loadArchive(data);
        expect(fetchMock).toHaveBeenCalledTimes(2);
      });
    }
  });

  it('does not merge non-log archive rows (or null rows) into the feed', async () => {
    stubFetch({
      entries: [
        { category: 'log', project: 'helm', date: '2026-01-01T10:00', text: 'old-log' },
        { category: 'daily', project: 'helm', date: '2026-01-02T10:00', summary: 'stray-daily' },
        { category: 'feature', project: 'helm', date: '2026-01-03T10:00', text: 'stray-feature' },
        { cat: 'log', project: 'helm', date: '2026-01-04T10:00', text: 'cat-not-category' },
        null,
      ],
    });
    const data = { entries: [], projects: [{ channel: 'helm' }], hasArchive: true, archiveLoaded: false };
    await loadArchive(data);
    expect(data.archiveLoaded).toBe(true);
    // Archive rows are keyed on `category` like the hot path — `cat` is the
    // normalized field, never a raw one.
    expect(data.entries.map((e) => e.text)).toEqual(['old-log']);
    expect(entriesFor('home', data)).toEqual([]);
    expect(entriesFor('helm', data)).toEqual([]);
  });

  it('routes archived logs through the project slug → channel map, like the hot path', async () => {
    stubFetch({
      entries: [
        { category: 'log', project: 'Explorer', date: '2026-01-01T10:00', text: 'mapped' },
        { category: 'log', project: 'secret-tool', date: '2026-01-02T10:00', text: 'unmapped' },
        { category: 'log', date: '2026-01-03T10:00', summary: 'no-project' },
      ],
    });
    const data = {
      entries: [],
      projects: [{ name: 'Explorer', channel: 'exp', slug: 'explorer' }],
      hasArchive: true,
      archiveLoaded: false,
    };
    await loadArchive(data);
    const [mapped, unmapped, bare] = data.entries;
    expect(mapped).toMatchObject({ ch: 'exp', mappedChannel: 'exp', project: 'explorer', nick: 'git', cat: 'log' });
    expect(unmapped).toMatchObject({ ch: 'activity', project: 'secret-tool' });
    expect(unmapped.mappedChannel).toBeUndefined();
    expect(bare).toMatchObject({ ch: 'activity', project: undefined, text: 'no-project' });
    expect(entriesFor('activity', data)).toHaveLength(3);
  });

  it('builds the same entry shape as fetchData for the same raw row', async () => {
    const raw = { category: 'log', project: 'Helm', date: '2026-01-01T10:00', text: 'same', sticky: true };
    const projects = [{ name: 'Helm', channel: 'helm' }];
    stubFetch({ entries: [raw], projects });
    const hot = await fetchData();
    stubFetch({ entries: [raw] });
    const data = { entries: [], projects, hasArchive: true, archiveLoaded: false };
    await loadArchive(data);
    expect(data.entries[0]).toEqual(hot.entries[0]);
  });

  it('shares one fetch between concurrent calls on the same data', async () => {
    let release;
    const fetchMock = vi.fn(() => new Promise((resolve) => { release = resolve; }));
    vi.stubGlobal('fetch', fetchMock);
    const data = { entries: [], projects: [], hasArchive: true, archiveLoaded: false };
    const a = loadArchive(data);
    const b = loadArchive(data);
    release({ ok: true, json: async () => ({ entries: [{ category: 'log', date: '2026-01-01T10:00', text: 'x' }] }) });
    await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(data.entries).toHaveLength(1);
  });
});
