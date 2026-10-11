// Golden-file tests for mase-fi-purge-private: private rows leave both feed
// files, nothing is written when the private list is unusable, and a backup
// exists only after a real removal.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { chmodSync, existsSync, mkdirSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir, cleanup, writeJson, readJson, runScript } from './test-helpers.js';

let dir, file, archive, apiFile, backup;
const locked = [];

beforeEach(() => {
  dir = makeTempDir();
  file = join(dir, 'updates.json');
  archive = join(dir, 'updates-archive.json');
  apiFile = join(dir, 'private.json');
  backup = join(dir, 'backups');
});
afterEach(() => {
  for (const d of locked.splice(0)) {
    try { chmodSync(d, 0o755); } catch { /* gone */ }
  }
  cleanup(dir);
});

const setApi = (value) => {
  writeFileSync(apiFile, typeof value === 'string' ? value : JSON.stringify(value));
  return `file://${apiFile}`;
};
const run = (env = {}) => runScript('mase-fi-purge-private', [], {
  UPDATES_FILE: file,
  ARCHIVE_FILE: archive,
  BACKUP_DIR: backup,
  TODAY: '2026-10-11',
  LOG_HOT_DAYS: '90',
  ...env,
});

// A file (and its parent) the test user cannot write: write_updates_json's
// sibling rename needs a writable dir, and its in-place cp needs a writable file.
function readOnly(path) {
  const parent = join(path, '..');
  chmodSync(path, 0o444);
  chmodSync(parent, 0o555);
  locked.push(parent);
}

const KEPT_LOG = { date: '2026-10-01', category: 'log', project: 'beta', text: 'kept log' };
const KEPT_FEATURE = { date: '2026-10-01', category: 'feature', project: 'beta', text: 'kept feature' };
const MENTION = { date: '2026-10-02', category: 'daily', project: 'home', summary: 'acme shipped x' };
const NOT_A_WORD = { date: '2026-10-03', category: 'daily', project: 'home', summary: 'packaging acme-tools' };
const BETA_PROJECT = { name: 'Beta', slug: 'beta', channel: 'beta', url: 'https://mase.fi/beta', desc: '' };
const ARCH_KEPT = { date: '2026-01-02', category: 'log', project: 'beta', text: 'old kept' };

function seedFull() {
  writeJson(file, {
    stats: { totalCommits: 99 },
    projects: [
      { name: 'Acme', slug: 'acme', channel: 'acme', url: null, desc: '' },
      { name: 'Alias', slug: 'other', channel: 'acme', url: null, desc: '' },
      BETA_PROJECT,
    ],
    entries: [
      { date: '2026-10-01', category: 'log', project: 'acme', text: 'secret log' },
      { date: '2026-10-01', category: 'daily', project: 'ACME', summary: 'secret daily' },
      { date: '2026-10-01', category: 'feature', project: 'acme', text: 'secret feature' },
      KEPT_LOG,
      KEPT_FEATURE,
      MENTION,
      NOT_A_WORD,
    ],
  });
  writeJson(archive, {
    entries: [
      { date: '2026-01-01', category: 'log', project: 'acme', text: 'old secret' },
      ARCH_KEPT,
    ],
  });
}

describe('mase-fi-purge-private', () => {
  it('removes private rows from both files and recomputes stats', () => {
    seedFull();
    const r = run({ PRIVATE_API: setApi({ private: [{ name: 'acme', source: 'own setting' }] }) });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('purged 6 row(s) for: acme');
    expect(r.stdout).toContain('still mentioned: home 2026-10-02 (daily)');
    expect(r.stdout).not.toContain('still mentioned: home 2026-10-03');
    const hot = readJson(file);
    expect(hot.entries).toEqual([KEPT_LOG, KEPT_FEATURE, MENTION, NOT_A_WORD]);
    expect(hot.projects).toEqual([BETA_PROJECT]);
    expect(hot.stats.totalCommits).toBe(2);
    expect(hot.stats.commitsByProject).toEqual({ beta: 2 });
    expect(readJson(archive).entries).toEqual([ARCH_KEPT]);
  });

  it('prints nothing to purge and does not write or back up when nothing matches', () => {
    writeJson(file, { stats: { totalCommits: 1 }, projects: [BETA_PROJECT], entries: [KEPT_LOG] });
    writeJson(archive, { entries: [ARCH_KEPT] });
    const hotMtime = statSync(file).mtimeMs;
    const archMtime = statSync(archive).mtimeMs;
    const r = run({ PRIVATE_API: setApi({ private: [{ name: 'acme' }] }) });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe('nothing to purge\n');
    expect(statSync(file).mtimeMs).toBe(hotMtime);
    expect(statSync(archive).mtimeMs).toBe(archMtime);
    expect(readJson(file).entries).toEqual([KEPT_LOG]);
    expect(existsSync(backup)).toBe(false);
  });

  it('backs up both files mode 0600 and keeps the newest 20 pre-purge copies', () => {
    seedFull();
    mkdirSync(backup);
    for (let i = 0; i < 21; i++) {
      const stamp = `20200101T${String(i).padStart(6, '0')}Z`;
      writeFileSync(join(backup, `updates.json.pre-purge.${stamp}.json`), '{}\n');
    }
    const r = run({ PRIVATE_API: setApi({ private: [{ name: 'acme' }] }) });
    expect(r.status).toBe(0);
    const hotCopies = readdirSync(backup).filter((n) => n.startsWith('updates.json.pre-purge.')).sort();
    expect(hotCopies).toHaveLength(20);
    expect(hotCopies.some((n) => n.includes('20200101T000000Z'))).toBe(false);
    expect(hotCopies.some((n) => n.includes('20200101T000001Z'))).toBe(false);
    expect(hotCopies.some((n) => n.includes('20200101T000002Z'))).toBe(true);
    expect(statSync(join(backup, hotCopies.at(-1))).mode & 0o777).toBe(0o600);
    expect(statSync(backup).mode & 0o777).toBe(0o700);
    const archCopies = readdirSync(backup).filter((n) => n.startsWith('updates-archive.json.pre-purge.'));
    expect(archCopies).toHaveLength(1);
    expect(statSync(join(backup, archCopies[0])).mode & 0o777).toBe(0o600);
  });

  it.each([
    ['unreachable', () => 'http://127.0.0.1:1/private'],
    ['a reply without a private array', () => setApi({ nope: 1 })],
    ['non-JSON', () => setApi('not json')],
  ])('exits 1 and leaves the files untouched on %s', (_label, api) => {
    writeJson(file, { projects: [BETA_PROJECT], entries: [KEPT_LOG] });
    writeJson(archive, { entries: [ARCH_KEPT] });
    const before = readJson(file);
    const archBefore = readJson(archive);
    const r = run({ PRIVATE_API: api() });
    expect(r.status).toBe(1);
    expect(readJson(file)).toEqual(before);
    expect(readJson(archive)).toEqual(archBefore);
    expect(existsSync(backup)).toBe(false);
  });

  it('leaves the hot file untouched when the archive cannot be installed', () => {
    seedFull();
    const before = readJson(file);
    const archDir = join(dir, 'archro');
    mkdirSync(archDir);
    const archRo = join(archDir, 'updates-archive.json');
    renameSync(archive, archRo);
    readOnly(archRo);
    const r = run({
      ARCHIVE_FILE: archRo,
      PRIVATE_API: setApi({ private: [{ name: 'acme' }] }),
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/left untouched/);
    expect(readJson(file)).toEqual(before);
    expect(readJson(archRo).entries).toHaveLength(2);
  });

  it('purges the hot file when the archive is missing', () => {
    writeJson(file, {
      projects: [BETA_PROJECT, { name: 'Acme', slug: 'acme', channel: 'acme', url: null, desc: '' }],
      entries: [KEPT_LOG, { date: '2026-10-01', category: 'log', project: 'acme', text: 'secret' }],
    });
    const r = run({ PRIVATE_API: setApi({ private: [{ name: 'acme' }] }) });
    expect(r.status).toBe(0);
    expect(readJson(file).entries).toEqual([KEPT_LOG]);
    expect(readJson(file).projects).toEqual([BETA_PROJECT]);
    expect(readJson(archive).entries).toEqual([]);
  });

  it('reports a hot install failure after the archive was already updated', () => {
    seedFull();
    const before = readJson(file);
    const hotDir = join(dir, 'hotro');
    mkdirSync(hotDir);
    const hotRo = join(hotDir, 'updates.json');
    renameSync(file, hotRo);
    file = hotRo;
    readOnly(hotRo);
    const r = run({ PRIVATE_API: setApi({ private: [{ name: 'acme' }] }) });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/still in the hot file/);
    expect(readJson(hotRo)).toEqual(before);
    expect(readJson(archive).entries).toEqual([ARCH_KEPT]);
  });
});
