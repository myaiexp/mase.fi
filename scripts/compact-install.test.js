// Tests for compact_and_install and mase-fi-compact-updates: install order,
// the degraded no-archive path, and failures that must never lose a log.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir, cleanup, writeJson, readJson, runScript, SCRIPTS_DIR } from './test-helpers.js';

let dir;
const lockedDirs = [];

beforeEach(() => {
  dir = makeTempDir();
});
afterEach(() => {
  // Re-open any dir a test made read-only so cleanup can remove it.
  for (const d of lockedDirs.splice(0)) {
    try { chmodSync(d, 0o755); } catch { /* gone */ }
  }
  cleanup(dir);
});

// A dir (and file in it) the test user cannot write: write_updates_json has no
// sibling rename there and its in-place cp fails, so the install is refused.
function readOnly(file) {
  chmodSync(file, 0o444);
  const parent = join(file, '..');
  chmodSync(parent, 0o555);
  lockedDirs.push(parent);
}

const CUTOFF = '2026-06-01';
const FIXTURE = {
  projects: [],
  entries: [
    { date: '2026-08-01', category: 'daily', project: 'beta', summary: 'shipped', commits: ['c1'] },
    { date: '2026-08-20', category: 'log', project: 'beta', text: 'recent' },
    { date: '2026-01-01', category: 'log', project: 'beta', text: 'ancient' },
    { category: 'log', project: 'beta', text: 'undated' },
  ],
};
const logTexts = (file) =>
  readJson(file).entries.filter((e) => e.category === 'log').map((e) => e.text).sort();

// source updates-write.sh and call compact_and_install with the caller's env
// contract; exits with its return code.
function compactInstall(hot, archive, cutoff = CUTOFF) {
  const script = `
    source "${join(SCRIPTS_DIR, 'updates-write.sh')}"
    UPDATES_FILE="$1" ARCHIVE_FILE="$2" CUTOFF="$3"
    rc=0
    compact_and_install || rc=$?
    exit "$rc"
  `;
  return spawnSync('bash', ['-c', script, '--', hot, archive, cutoff], { encoding: 'utf8' });
}

describe('compact_and_install — archive path', () => {
  it('moves aged logs into the archive and rewrites the hot file', () => {
    const hot = join(dir, 'updates.json');
    const arch = join(dir, 'updates-archive.json');
    writeJson(hot, FIXTURE);
    const r = compactInstall(hot, arch);
    expect(r.status).toBe(0);
    expect(logTexts(hot)).toEqual(['recent']);
    expect(logTexts(arch)).toEqual(['ancient', 'undated']);
    expect(readJson(hot).stats).toMatchObject({ archive: true, archivedLogs: 2, totalCommits: 3 });
    expect(readJson(hot).entries.some((e) => 'commits' in e)).toBe(false);
  });

  it('leaves the hot file untouched when the archive install fails (finding #9443)', () => {
    const hot = join(dir, 'updates.json');
    mkdirSync(join(dir, 'ro'));
    const arch = join(dir, 'ro', 'updates-archive.json');
    writeJson(hot, FIXTURE);
    writeJson(arch, { entries: [{ date: '2025-01-01', category: 'log', project: 'old', text: 'kept' }] });
    const hotBefore = readFileSync(hot, 'utf8');
    const archBefore = readFileSync(arch, 'utf8');
    readOnly(arch);

    const r = compactInstall(hot, arch);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/archive install failed/);
    // Every aged log is still where it was: nothing was stripped from the hot file.
    expect(readFileSync(hot, 'utf8')).toBe(hotBefore);
    expect(readFileSync(arch, 'utf8')).toBe(archBefore);
  });

  it('keeps aged logs in both files when the hot install fails, and the next run dedupes', () => {
    mkdirSync(join(dir, 'ro'));
    const hot = join(dir, 'ro', 'updates.json');
    const arch = join(dir, 'updates-archive.json');
    writeJson(hot, FIXTURE);
    const hotBefore = readFileSync(hot, 'utf8');
    readOnly(hot);

    const r = compactInstall(hot, arch);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/hot install failed/);
    expect(readFileSync(hot, 'utf8')).toBe(hotBefore);
    expect(logTexts(arch)).toEqual(['ancient', 'undated']);

    // Once the hot file is writable again, compaction converges with no duplicates.
    chmodSync(join(dir, 'ro'), 0o755);
    chmodSync(hot, 0o644);
    expect(compactInstall(hot, arch).status).toBe(0);
    expect(logTexts(hot)).toEqual(['recent']);
    expect(logTexts(arch)).toEqual(['ancient', 'undated']);
    expect(readJson(hot).stats).toMatchObject({ archivedLogs: 2, totalCommits: 3 });
  });

  it('refuses a malformed archive and touches neither file (finding #9434)', () => {
    const hot = join(dir, 'updates.json');
    const arch = join(dir, 'updates-archive.json');
    writeJson(hot, FIXTURE);
    writeFileSync(arch, '{"entries":[{"date":"2025-01-01","te');
    const hotBefore = readFileSync(hot, 'utf8');
    const r = compactInstall(hot, arch);
    expect(r.status).not.toBe(0);
    expect(readFileSync(hot, 'utf8')).toBe(hotBefore);
    expect(readFileSync(arch, 'utf8')).toBe('{"entries":[{"date":"2025-01-01","te');
  });
});

describe('compact_and_install — degraded path, archive cannot be created (finding #10132)', () => {
  it('keeps every log in the hot file, strips commits, and returns 3', () => {
    const hot = join(dir, 'updates.json');
    const arch = join(dir, 'missing-dir', 'updates-archive.json');
    writeJson(hot, FIXTURE);
    const r = compactInstall(hot, arch);
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/cannot create/);
    // Pre-cutoff and undated logs both survive: nothing ages out without an archive.
    expect(logTexts(hot)).toEqual(['ancient', 'recent', 'undated']);
    expect(readJson(hot).entries.some((e) => 'commits' in e)).toBe(false);
    expect(readJson(hot).stats).toMatchObject({ archive: false, archivedLogs: 0, totalCommits: 3 });
    expect(existsSync(arch)).toBe(false);
  });
});

describe('mase-fi-compact-updates — exit status', () => {
  const run = (env) => runScript('mase-fi-compact-updates', [], { TODAY: '2026-08-30', ...env });

  it('exits 0 and reports the cutoff on a clean compact', () => {
    const hot = join(dir, 'updates.json');
    writeJson(hot, FIXTURE);
    const r = run({ UPDATES_FILE: hot });
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Compacted .* \(cutoff 2026-06-01,/);
    expect(logTexts(join(dir, 'updates-archive.json'))).toEqual(['ancient', 'undated']);
  });

  it('exits 3 on the degraded path', () => {
    const hot = join(dir, 'updates.json');
    writeJson(hot, FIXTURE);
    const r = run({ UPDATES_FILE: hot, ARCHIVE_FILE: join(dir, 'missing-dir', 'a.json') });
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/without archiving/);
    expect(logTexts(hot)).toEqual(['ancient', 'recent', 'undated']);
  });

  it('exits non-zero without "Compacted" when the archive is malformed', () => {
    const hot = join(dir, 'updates.json');
    writeJson(hot, FIXTURE);
    writeFileSync(join(dir, 'updates-archive.json'), '{ torn');
    const r = run({ UPDATES_FILE: hot });
    expect(r.status).not.toBe(0);
    expect(r.status).not.toBe(3);
    expect(r.stdout).not.toMatch(/Compacted/);
    expect(r.stderr).toMatch(/Compact failed/);
  });
});
