// Unit tests for updates-write.sh: install (atomic rename vs in-place cp),
// the O_NOFOLLOW lock open, and the two locked wrappers. Sources the real file.
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

  // `jq empty` exits 0 on all three, so each used to pass the gate and be installed.
  it.each([
    ['a 0-byte file', ''],
    ['a non-object document', '[]'],
    ['an object without an entries array', '{"projects":[]}'],
    ['two concatenated documents', '{"entries":[]}{"entries":[]}'],
  ])('refuses %s as a candidate without touching the target', (_, content) => {
    const target = join(dir, 'updates.json');
    const cand = join(dir, 'cand.json');
    writeFileSync(target, '{"entries":[],"projects":[]}');
    writeFileSync(cand, content);
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

// source updates-write.sh and call run_under_updates_lock <target> <label> _fn [args...]
function runUnderLock(target, fnBody, args = [], { label = 'test-label' } = {}) {
  const lockPath = join(dir, 'updates.json.lock');
  const script = `
    set -e
    source "${join(SCRIPTS_DIR, 'updates-write.sh')}"
    UPDATES_JSON_LOCK="$3"
    _fn() { ${fnBody}
    }
    target="$1"; label="$2"; shift 3
    run_under_updates_lock "$target" "$label" _fn "$@"
  `;
  return spawnSync('bash', ['-c', script, '--', target, label, lockPath, ...args], {
    encoding: 'utf8',
  });
}

describe('run_under_updates_lock — the one owner of the lock steps', () => {
  it('runs the function with its args while holding the flock', () => {
    const target = join(dir, 'updates.json');
    writeFileSync(target, JSON.stringify({ entries: [] }));
    // A second, non-blocking flock on the same path must fail while fn runs.
    const r = runUnderLock(
      target,
      'echo "args:$*"; if flock -n "$UPDATES_JSON_LOCK" true; then echo free; else echo held; fi',
      ['a', 'b c'],
    );
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('args:a b c');
    expect(r.stdout).toContain('held');
  });

  it("returns the function's status", () => {
    const target = join(dir, 'updates.json');
    writeFileSync(target, JSON.stringify({ entries: [] }));
    expect(runUnderLock(target, 'return 7').status).toBe(7);
  });

  it('refuses a malformed target without calling the function', () => {
    const target = join(dir, 'updates.json');
    writeFileSync(target, '{ not json');
    const r = runUnderLock(target, 'echo CALLED');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/malformed JSON — test-label/);
    expect(r.stdout).not.toContain('CALLED');
  });

  it('refuses a 0-byte target without calling the function', () => {
    const target = join(dir, 'updates.json');
    writeFileSync(target, '');
    const r = runUnderLock(target, 'echo CALLED');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/malformed JSON — test-label/);
    expect(r.stdout).not.toContain('CALLED');
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

  it('does not install a candidate the transform left malformed', () => {
    const target = join(dir, 'updates.json');
    writeFileSync(target, JSON.stringify({ entries: [], projects: [] }));
    const before = readFileSync(target, 'utf8');
    const r = withLock(target, 'printf "{ half" > "$2"');
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/failed to write .* — test-label/);
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

// The store path has one owner (idea #2487): a writer that hardcodes it drifts the
// moment the store moves, and writes to a file nginx no longer serves.
describe('UPDATES_FILE_DEFAULT — the one store path', () => {
  it('points at the mase-owned store dir outside the webroot', () => {
    const r = spawnSync('bash', ['-c', `source "${join(SCRIPTS_DIR, 'updates-write.sh')}"; echo "$UPDATES_FILE_DEFAULT"`], { encoding: 'utf8' });
    expect(r.stdout.trim()).toBe('/var/lib/mase-fi/updates.json');
  });

  it.each(['mase-fi-update', 'mase-fi-daily-summary', 'mase-fi-projects', 'mase-fi-compact-updates'])(
    '%s defaults UPDATES_FILE to UPDATES_FILE_DEFAULT, not a literal path',
    (name) => {
      const src = readFileSync(join(SCRIPTS_DIR, name), 'utf8');
      expect(src).toMatch(/\$\{UPDATES_FILE:-\$UPDATES_FILE_DEFAULT\}/);
      expect(src).not.toMatch(/\/var\/(www|lib)\/[^\s"]*updates\.json/);
    },
  );
});
