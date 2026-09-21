// Unit tests for compact_updates_json, the pure strip-commits + archive-logs
// transform in updates-compact.sh (no lock, no install).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir, cleanup, SCRIPTS_DIR } from './test-helpers.js';

let dir, hotSrc, archSrc, hotDst, archDst;

beforeEach(() => {
  dir = makeTempDir();
  hotSrc = join(dir, 'in.json');
  archSrc = join(dir, 'arch-in.json');
  hotDst = join(dir, 'hot-out.json');
  archDst = join(dir, 'arch-out.json');
});
afterEach(() => cleanup(dir));

// source updates-compact.sh and call compact_updates_json
function compactViaShell(hot, arch, hotOut, archOut, cutoff) {
  const script = `
    set -e
    source "${join(SCRIPTS_DIR, 'updates-compact.sh')}"
    compact_updates_json "$1" "$2" "$3" "$4" "$5"
  `;
  return spawnSync('bash', ['-c', script, '--', hot, arch, hotOut, archOut, cutoff], {
    encoding: 'utf8',
  });
}

const readOut = (file) => JSON.parse(readFileSync(file, 'utf8'));

describe('compact_updates_json — strip commits + archive old logs (finding #8804)', () => {
  it('strips commits from daily entries and keeps recent logs in the hot file', () => {
    writeFileSync(hotSrc, JSON.stringify({
      projects: [{ channel: 'beta' }],
      entries: [
        { date: '2026-08-01', category: 'daily', project: 'beta', summary: 'shipped', commits: ['c1', 'c2'] },
        { date: '2026-08-20', category: 'log', project: 'beta', text: 'recent' },
        { date: '2026-01-01', category: 'log', project: 'beta', text: 'ancient' },
        { date: '2026-08-15', category: 'feature', project: 'beta', text: 'feat' },
      ],
    }));
    writeFileSync(archSrc, JSON.stringify({ entries: [] }));
    const r = compactViaShell(hotSrc, archSrc, hotDst, archDst, '2026-06-01');
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
    const hot = readOut(hotDst);
    const arch = readOut(archDst);
    expect(hot.entries.every((e) => !('commits' in e))).toBe(true);
    expect(hot.entries.map((e) => e.text || e.summary).sort()).toEqual(['feat', 'recent', 'shipped']);
    expect(arch.entries).toEqual([
      { date: '2026-01-01', category: 'log', project: 'beta', text: 'ancient' },
    ]);
    expect(hot.stats).toMatchObject({
      totalCommits: 2,
      archivedLogs: 1,
      archive: true,
      logFirst: '2026-01-01',
      logLast: '2026-08-20',
      commitsByProject: { beta: 2 },
      archivedByProject: { beta: 1 },
    });
    expect(hot.stats.totalEntries).toBe(4); // 2 non-logs in hot + 2 logs overall
  });

  it('is idempotent — a second compact does not duplicate archived logs', () => {
    writeFileSync(hotSrc, JSON.stringify({
      projects: [],
      entries: [
        { date: '2026-08-20', category: 'log', project: 'beta', text: 'recent' },
        { date: '2026-01-01', category: 'log', project: 'beta', text: 'ancient' },
      ],
    }));
    writeFileSync(archSrc, JSON.stringify({ entries: [] }));
    expect(compactViaShell(hotSrc, archSrc, hotDst, archDst, '2026-06-01').status).toBe(0);
    // Feed the first output back in as the next input.
    const r = compactViaShell(hotDst, archDst, hotSrc, archSrc, '2026-06-01');
    expect(r.status).toBe(0);
    const arch = readOut(archSrc);
    expect(arch.entries).toHaveLength(1);
    expect(arch.entries[0].text).toBe('ancient');
    const hot = readOut(hotSrc);
    expect(hot.entries.filter((e) => e.category === 'log')).toHaveLength(1);
    expect(hot.stats.totalCommits).toBe(2);
  });

  it('keeps every log in the hot file when none are older than the cutoff', () => {
    writeFileSync(hotSrc, JSON.stringify({
      projects: [],
      entries: [{ date: '2026-08-20', category: 'log', project: 'beta', text: 'recent' }],
    }));
    writeFileSync(archSrc, JSON.stringify({ entries: [] }));
    expect(compactViaShell(hotSrc, archSrc, hotDst, archDst, '2026-06-01').status).toBe(0);
    const hot = readOut(hotDst);
    const arch = readOut(archDst);
    expect(hot.entries).toHaveLength(1);
    expect(arch.entries).toHaveLength(0);
    expect(hot.stats.archive).toBe(false);
    expect(hot.stats.totalCommits).toBe(1);
  });

  it('treats a missing archive source as empty rather than failing', () => {
    writeFileSync(hotSrc, JSON.stringify({
      projects: [],
      entries: [{ date: '2026-01-01', category: 'log', project: 'beta', text: 'ancient' }],
    }));
    const r = compactViaShell(hotSrc, join(dir, 'no-such-archive.json'), hotDst, archDst, '2026-06-01');
    expect(r.status).toBe(0);
    expect(readOut(archDst).entries).toHaveLength(1);
  });

  it('keeps every log, undated ones included, when the cutoff is empty', () => {
    writeFileSync(hotSrc, JSON.stringify({
      projects: [],
      entries: [
        { date: '2026-01-01', category: 'log', project: 'beta', text: 'ancient' },
        { category: 'log', project: 'beta', text: 'undated' },
      ],
    }));
    const r = compactViaShell(hotSrc, '', hotDst, archDst, '');
    expect(r.status).toBe(0);
    expect(readOut(hotDst).entries.map((e) => e.text).sort()).toEqual(['ancient', 'undated']);
    expect(readOut(archDst).entries).toEqual([]);
    expect(readOut(hotDst).stats).toMatchObject({ archive: false, archivedLogs: 0, totalCommits: 2 });
  });
});

describe('compact_updates_json — refuses an archive it cannot parse (finding #9434)', () => {
  const seedHot = () => writeFileSync(hotSrc, JSON.stringify({
    projects: [],
    entries: [{ date: '2026-01-01', category: 'log', project: 'beta', text: 'ancient' }],
  }));

  // A torn in-place cp, an interrupted truncate, or a hand edit. Each would
  // otherwise be read as {entries:[]} and overwritten with only the new rows.
  for (const [label, content] of [
    ['torn JSON', '{"entries":[{"date":"2025-01-01","category":"log","te'],
    ['a 0-byte file', ''],
    ['an object with no entries array', '{"rows":[]}'],
    ['a bare array', '[]'],
  ]) {
    it(`fails on ${label} and writes no output`, () => {
      seedHot();
      writeFileSync(archSrc, content);
      const r = compactViaShell(hotSrc, archSrc, hotDst, archDst, '2026-06-01');
      expect(r.status).not.toBe(0);
      expect(r.stderr).toMatch(/not a valid .*archive/);
      expect(existsSync(hotDst)).toBe(false);
      expect(existsSync(archDst)).toBe(false);
      expect(readFileSync(archSrc, 'utf8')).toBe(content);
    });
  }
});
