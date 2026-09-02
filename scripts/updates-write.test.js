// Unit tests for write_updates_json: atomic rename vs in-place cp fallback,
// plus malformed-candidate refusal. Sources the real updates-write.sh.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync,
  symlinkSync, lstatSync,
} from 'node:fs';
import { join } from 'node:path';
import { makeTempDir, cleanup, SCRIPTS_DIR } from './test-helpers.js';

let dir;

beforeEach(() => {
  dir = makeTempDir();
});
afterEach(() => {
  // Re-open any dir we made non-writable so cleanup can rmdir.
  try { chmodSync(dir, 0o755); } catch { /* gone */ }
  try { chmodSync(join(dir, 'ro'), 0o755); } catch { /* n/a */ }
  cleanup(dir);
});

// source updates-write.sh and call write_updates_json <cand> <target>
function writeViaShell(candidate, target) {
  const script = `
    set -e
    source "${join(SCRIPTS_DIR, 'updates-write.sh')}"
    write_updates_json "$1" "$2"
  `;
  return spawnSync('bash', ['-c', script, '--', candidate, target], {
    encoding: 'utf8',
  });
}

describe('write_updates_json — atomic branch (dir writable)', () => {
  it('installs a valid candidate via sibling rename (target content updated)', () => {
    const target = join(dir, 'updates.json');
    const cand = join(dir, 'cand.json');
    writeFileSync(target, JSON.stringify({ entries: [], projects: [] }));
    writeFileSync(cand, JSON.stringify({ entries: [{ text: 'new' }], projects: [] }));
    const r = writeViaShell(cand, target);
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(target, 'utf8')).entries[0].text).toBe('new');
  });

  it('refuses a malformed candidate without touching the target', () => {
    const target = join(dir, 'updates.json');
    const cand = join(dir, 'cand.json');
    writeFileSync(target, '{"entries":[],"projects":[]}');
    writeFileSync(cand, '{not json');
    const before = readFileSync(target, 'utf8');
    const r = writeViaShell(cand, target);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/malformed JSON/i);
    expect(readFileSync(target, 'utf8')).toBe(before);
  });
});

describe('write_updates_json — in-place cp fallback (dir not writable)', () => {
  it('still updates the target when only the file is writable (prod webroot shape)', () => {
    // Prod: mase-owned updates.json inside a www-data-owned webroot dir.
    // Simulate: dir mode 0555, file mode 0644 owned by us.
    const ro = join(dir, 'ro');
    mkdirSync(ro);
    const target = join(ro, 'updates.json');
    const cand = join(dir, 'cand.json'); // candidate lives outside ro dir
    writeFileSync(target, JSON.stringify({ entries: [{ text: 'old' }], projects: [] }));
    writeFileSync(cand, JSON.stringify({ entries: [{ text: 'from-inplace' }], projects: [] }));
    chmodSync(ro, 0o555); // directory not writable → no sibling mktemp/rename
    expect(statSync(ro).mode & 0o200).toBe(0); // not owner-writable

    const r = writeViaShell(cand, target);
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(target, 'utf8')).entries[0].text).toBe('from-inplace');
    // No leftover sibling temp from the atomic branch
    expect(existsSync(join(ro, '.updates'))).toBe(false);
  });
});

// source updates-write.sh and call ensure_updates_lock against $1
function ensureLock(path) {
  const script = `
    set -e
    source "${join(SCRIPTS_DIR, 'updates-write.sh')}"
    UPDATES_JSON_LOCK="$1"
    ensure_updates_lock
  `;
  return spawnSync('bash', ['-c', script, '--', path], { encoding: 'utf8' });
}

describe('ensure_updates_lock — O_NOFOLLOW, no truncate', () => {
  it('creates a regular 0600 lock file when the path is free', () => {
    const lock = join(dir, 'updates.json.lock');
    const r = ensureLock(lock);
    expect(r.status).toBe(0);
    expect(lstatSync(lock).isSymbolicLink()).toBe(false);
    expect(statSync(lock).mode & 0o777).toBe(0o600);
  });

  it('refuses a symlink and leaves the victim file intact', () => {
    const victim = join(dir, 'victim');
    const lock = join(dir, 'updates.json.lock');
    writeFileSync(victim, 'do-not-clobber');
    symlinkSync(victim, lock);
    const r = ensureLock(lock);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/lock/i);
    expect(readFileSync(victim, 'utf8')).toBe('do-not-clobber');
    expect(lstatSync(lock).isSymbolicLink()).toBe(true);
  });
});

// source updates-write.sh and call with_updates_lock <target> <label> <fn>
function withLock(target, transformBody, { label = 'test-label', lock } = {}) {
  const lockPath = lock || join(dir, 'updates.json.lock');
  const script = `
    set -e
    source "${join(SCRIPTS_DIR, 'updates-write.sh')}"
    UPDATES_JSON_LOCK="$3"
    _xform() { ${transformBody}
    }
    with_updates_lock "$1" "$2" _xform
  `;
  return spawnSync('bash', ['-c', script, '--', target, label, lockPath], {
    encoding: 'utf8',
  });
}

// source updates-write.sh and call compact_updates_json
function compactViaShell(hotSrc, archSrc, hotDst, archDst, cutoff) {
  const script = `
    set -e
    source "${join(SCRIPTS_DIR, 'updates-write.sh')}"
    compact_updates_json "$1" "$2" "$3" "$4" "$5"
  `;
  return spawnSync('bash', ['-c', script, '--', hotSrc, archSrc, hotDst, archDst, cutoff], {
    encoding: 'utf8',
  });
}

describe('with_updates_lock — locked read-modify-write', () => {
  it('applies the transform and installs the candidate', () => {
    const target = join(dir, 'updates.json');
    writeFileSync(target, JSON.stringify({ entries: [], projects: [] }));
    const r = withLock(target, 'jq \'.entries += [{"text":"x"}]\' "$1" > "$2"');
    expect(r.status).toBe(0);
    expect(JSON.parse(readFileSync(target, 'utf8')).entries).toEqual([{ text: 'x' }]);
  });

  it('skips the write when the transform returns 2', () => {
    const target = join(dir, 'updates.json');
    writeFileSync(target, JSON.stringify({ entries: [{ text: 'keep' }], projects: [] }));
    const before = readFileSync(target, 'utf8');
    const r = withLock(target, 'echo "appeared during the run"; return 2');
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/appeared during the run/);
    expect(readFileSync(target, 'utf8')).toBe(before);
  });

  it('refuses a malformed target without touching it', () => {
    const target = join(dir, 'updates.json');
    writeFileSync(target, '{ not json');
    const before = readFileSync(target, 'utf8');
    const r = withLock(target, 'jq . "$1" > "$2"');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/malformed JSON/i);
    expect(r.stderr).toMatch(/test-label/);
    expect(readFileSync(target, 'utf8')).toBe(before);
  });

  it('does not write when the transform fails', () => {
    const target = join(dir, 'updates.json');
    writeFileSync(target, JSON.stringify({ entries: [], projects: [] }));
    const before = readFileSync(target, 'utf8');
    const r = withLock(target, 'echo "transform blew up" >&2; return 1');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/failed to write/i);
    expect(readFileSync(target, 'utf8')).toBe(before);
  });

  it('does not truncate an existing lock file (9>> not 9>)', () => {
    const target = join(dir, 'updates.json');
    const lock = join(dir, 'updates.json.lock');
    writeFileSync(target, JSON.stringify({ entries: [], projects: [] }));
    writeFileSync(lock, 'sentinel-bytes');
    const r = withLock(target, 'jq . "$1" > "$2"', { lock });
    expect(r.status).toBe(0);
    expect(readFileSync(lock, 'utf8')).toContain('sentinel-bytes');
  });

  it('refuses a symlink lock path and leaves the victim intact', () => {
    const target = join(dir, 'updates.json');
    const victim = join(dir, 'victim');
    const lock = join(dir, 'updates.json.lock');
    writeFileSync(target, JSON.stringify({ entries: [], projects: [] }));
    writeFileSync(victim, 'do-not-clobber');
    symlinkSync(victim, lock);
    const r = withLock(target, 'jq . "$1" > "$2"', { lock });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/lock (open failed|unusable|not owned)/i);
    expect(readFileSync(victim, 'utf8')).toBe('do-not-clobber');
    expect(JSON.parse(readFileSync(target, 'utf8')).entries).toEqual([]);
  });
});

describe('compact_updates_json — strip commits + archive old logs (finding #8804)', () => {
  it('strips commits from daily entries and keeps recent logs in the hot file', () => {
    const hotSrc = join(dir, 'in.json');
    const archSrc = join(dir, 'arch-in.json');
    const hotDst = join(dir, 'hot-out.json');
    const archDst = join(dir, 'arch-out.json');
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
    const hot = JSON.parse(readFileSync(hotDst, 'utf8'));
    const arch = JSON.parse(readFileSync(archDst, 'utf8'));
    expect(hot.entries.every((e) => !('commits' in e))).toBe(true);
    expect(hot.entries.map((e) => e.text || e.summary).sort()).toEqual(['feat', 'recent', 'shipped']);
    expect(arch.entries).toEqual([
      { date: '2026-01-01', category: 'log', project: 'beta', text: 'ancient' },
    ]);
    expect(hot.stats).toMatchObject({
      totalCommits: 2,
      archive: true,
      logFirst: '2026-01-01',
      logLast: '2026-08-20',
      commitsByProject: { beta: 2 },
    });
    expect(hot.stats.totalEntries).toBe(4); // 2 non-logs in hot + 2 logs overall
  });

  it('is idempotent — a second compact does not duplicate archived logs', () => {
    const hotSrc = join(dir, 'in.json');
    const archSrc = join(dir, 'arch.json');
    const hotDst = join(dir, 'hot-out.json');
    const archDst = join(dir, 'arch-out.json');
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
    const arch = JSON.parse(readFileSync(archSrc, 'utf8'));
    expect(arch.entries).toHaveLength(1);
    expect(arch.entries[0].text).toBe('ancient');
    const hot = JSON.parse(readFileSync(hotSrc, 'utf8'));
    expect(hot.entries.filter((e) => e.category === 'log')).toHaveLength(1);
    expect(hot.stats.totalCommits).toBe(2);
  });

  it('keeps every log in the hot file when none are older than the cutoff', () => {
    const hotSrc = join(dir, 'in.json');
    const archSrc = join(dir, 'arch-in.json');
    const hotDst = join(dir, 'hot-out.json');
    const archDst = join(dir, 'arch-out.json');
    writeFileSync(hotSrc, JSON.stringify({
      projects: [],
      entries: [{ date: '2026-08-20', category: 'log', project: 'beta', text: 'recent' }],
    }));
    writeFileSync(archSrc, JSON.stringify({ entries: [] }));
    expect(compactViaShell(hotSrc, archSrc, hotDst, archDst, '2026-06-01').status).toBe(0);
    const hot = JSON.parse(readFileSync(hotDst, 'utf8'));
    const arch = JSON.parse(readFileSync(archDst, 'utf8'));
    expect(hot.entries).toHaveLength(1);
    expect(arch.entries).toHaveLength(0);
    expect(hot.stats.archive).toBe(false);
    expect(hot.stats.totalCommits).toBe(1);
  });

  it('treats a missing archive source as empty rather than failing', () => {
    const hotSrc = join(dir, 'in.json');
    const archSrc = join(dir, 'no-such-archive.json');
    const hotDst = join(dir, 'hot-out.json');
    const archDst = join(dir, 'arch-out.json');
    writeFileSync(hotSrc, JSON.stringify({
      projects: [],
      entries: [{ date: '2026-01-01', category: 'log', project: 'beta', text: 'ancient' }],
    }));
    const r = compactViaShell(hotSrc, archSrc, hotDst, archDst, '2026-06-01');
    expect(r.status).toBe(0);
    const arch = JSON.parse(readFileSync(archDst, 'utf8'));
    expect(arch.entries).toHaveLength(1);
  });
});
