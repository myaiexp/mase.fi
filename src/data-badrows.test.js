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

  it('does not warn when every row is well-formed', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    stubFetch({ projects: [{ name: 'Helm', channel: 'helm' }], entries: [good] });
    await fetchData();
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
