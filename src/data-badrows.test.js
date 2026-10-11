// Malformed rows in updates.json / the archive are skipped one by one; they never
// empty the whole feed (finding #10679).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchData, entriesFor } from './data.js';
import { loadArchive } from './data-archive.js';
import { stubFetch } from './data-test-helpers.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const good = { category: 'feature', project: 'helm', date: '2026-01-02T10:00', text: 'kept' };

describe('fetchData with malformed rows', () => {
  it('skips a null entry and a non-string project, keeps the rest, and counts the drops', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch({
      projects: [{ name: 'Helm', channel: 'helm', slug: 'helm' }],
      entries: [
        null,
        { category: 'log', project: 42, date: '2026-01-01T10:00', text: 'numeric-project' },
        'not-an-object',
        good,
        { category: 'daily', date: '2026-01-03T10:00', summary: 'no-project' },
      ],
    });
    const data = await fetchData();
    expect(data.projects.map((p) => p.channel)).toEqual(['helm']);
    expect(data.entries.map((e) => e.text)).toEqual(['kept', 'no-project']);
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain('3');
  });

  it('skips a null project and one without a string channel', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch({
      projects: [null, { name: 'Bad', channel: 7 }, { name: 'Helm', channel: 'helm', slug: 'helm' }],
      entries: [good],
    });
    const data = await fetchData();
    expect(data.projects.map((p) => p.channel)).toEqual(['helm']);
    expect(entriesFor('helm', data).map((e) => e.text)).toEqual(['kept']);
  });

  // A truthy non-string slug is not a routing key; the string channel still is.
  it('routes via channel when slug is present but not a string', async () => {
    stubFetch({
      projects: [{ name: 'Helm', channel: 'helm', slug: 1 }],
      entries: [
        { category: 'feature', project: 'helm', date: '2026-01-01', text: 'shipped' },
        { category: 'daily', project: 'helm', date: '2026-01-02', summary: 'day' },
      ],
    });
    const data = await fetchData();
    expect(data.projects.map((p) => p.slug)).toEqual(['helm']);
    expect(data.entries.map((e) => [e.category, e.channel])).toEqual([
      ['feature', 'helm'],
      ['daily', 'helm'],
    ]);
    expect(entriesFor('helm', data).map((e) => e.text)).toEqual(['shipped', 'day']);
    expect(entriesFor('home', data).map((e) => e.text)).toEqual(['day']);
  });

  it('does not warn when every row is well-formed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch({ projects: [{ name: 'Helm', channel: 'helm' }], entries: [good] });
    await fetchData();
    expect(warn).not.toHaveBeenCalled();
  });
});

// A container that is not an array counts as empty; the other container still
// loads. Without the Array.isArray guards `.filter` throws and the outer catch
// returns emptyData, dropping the valid half too.
describe('fetchData with a non-array container', () => {
  const daily = { category: 'daily', date: '2026-01-03T10:00', summary: 'kept-daily' };
  const helm = { name: 'Helm', channel: 'helm', slug: 'helm' };

  it.each([[null], [{}], ['helm'], [7]])('keeps the entries when projects is %j', async (projects) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch({ projects, entries: [daily] });
    const data = await fetchData();
    expect(data.projects).toEqual([]);
    expect(data.entries.map((e) => e.text)).toEqual(['kept-daily']);
    expect(warn).not.toHaveBeenCalled(); // neither the bad-row count nor the degrade-to-empty path
  });

  it.each([[null], [{}], ['x'], [7]])('keeps the projects when entries is %j', async (entries) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch({ projects: [helm], entries });
    const data = await fetchData();
    expect(data.projects.map((p) => p.channel)).toEqual(['helm']);
    expect(data.entries).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('loadArchive with malformed rows', () => {
  it('skips a log row with a non-string project instead of failing the merge', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch({
      entries: [
        { category: 'log', project: 42, date: '2026-01-01T10:00', text: 'numeric-project' },
        { category: 'log', project: 'helm', date: '2026-01-02T10:00', text: 'old-log' },
      ],
    });
    const data = { entries: [], projects: [{ channel: 'helm' }], hasArchive: true, archiveLoaded: false };
    await loadArchive(data);
    expect(data.archiveLoaded).toBe(true);
    expect(data.entries.map((e) => e.text)).toEqual(['old-log']);
  });
});
