// Unit tests for write_updates_json: atomic rename vs in-place cp fallback,
// plus malformed-candidate refusal. Sources the real updates-write.sh.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync, statSync,
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
