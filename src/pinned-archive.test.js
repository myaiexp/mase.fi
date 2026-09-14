// @vitest-environment jsdom
// Activity card totals after loadArchive fails or succeeds (finding #9436)
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderPinned } from './pinned.js';
import { loadArchive } from './data-archive.js';

beforeEach(() => {
  const el = document.createElement('div');
  el.id = 'pinned';
  document.body.appendChild(el);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

// The hot window after a compact: one recent log + one daily in memory, the
// rest of the history counted by stats.archivedLogs.
function hotWindow(archivedLogs) {
  return {
    projects: [],
    entries: [
      { ch: 'activity', cat: 'log', date: '2026-08-01T08:00', nick: 'git', text: 'hot log' },
      { ch: 'home', cat: 'daily', date: '2026-08-01T08:00', nick: 'mase', text: 'd' },
    ],
    stats: { archivedLogs, logFirst: '2026-01-01', logLast: '2026-08-01' },
    hasArchive: true,
    archiveLoaded: false,
  };
}

const pinnedHtml = () => document.getElementById('pinned').innerHTML;

describe('renderPinned — activity after loadArchive', () => {
  it('keeps the all-history total when the archive fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const data = hotWindow(500);
    await loadArchive(data);
    renderPinned('activity', data);
    // 1 daily + (500 archived + 1 hot log), not the 2 rows in memory.
    expect(pinnedHtml()).toContain('502 entries');
  });

  it('counts the merged rows, not archivedLogs on top of them, once a load succeeds', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [{ category: 'log', project: 'helm', date: '2026-01-01T10:00', text: 'old log' }],
      }),
    }));
    const data = hotWindow(1);
    await loadArchive(data);
    renderPinned('activity', data);
    expect(pinnedHtml()).toContain('3 entries');
  });
});
