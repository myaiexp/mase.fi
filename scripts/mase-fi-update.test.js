// Golden-file tests for mase-fi-update: prepend ordering, the category-free and legacy
// argument forms, and the malformed-JSON / bad-argument refusal paths.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFileSync, writeFileSync, symlinkSync, mkdirSync, lstatSync, existsSync } from 'node:fs';
import { makeTempDir, cleanup, writeJson, readJson, runScript, todayHelsinki, writeHelmStub, readHelmCalls } from './test-helpers.js';

let dir, file;
const update = (args, env = {}) => runScript('mase-fi-update', args, { UPDATES_FILE: file, ...env });
const seed = (entries = [], projects = []) => writeJson(file, { entries, projects });

beforeEach(() => {
  dir = makeTempDir();
  file = join(dir, 'updates.json');
});
afterEach(() => cleanup(dir));

describe('mase-fi-update — write + prepend', () => {
  it('creates the file when missing and adds a feature entry', () => {
    // file does not exist yet
    const r = update(['explorer', 'first', '2026-07-18']);
    expect(r.status).toBe(0);
    const data = readJson(file);
    expect(data.entries).toEqual([
      { date: '2026-07-18', project: 'explorer', text: 'first', category: 'feature' },
    ]);
    expect(data.projects).toEqual([]);
  });

  it('prepends newest-first', () => {
    seed();
    update(['p', 'older', '2026-07-01']);
    update(['p', 'newer', '2026-07-02']);
    expect(readJson(file).entries.map((e) => e.text)).toEqual(['newer', 'older']);
  });

  it('defaults the date to Helsinki today, ignoring host TZ', () => {
    seed();
    // Hostile TZ: the script must not inherit the host calendar. Helsinki is
    // the site's date, matching mase-fi-daily-summary. runScript also pins
    // Helsinki by default; this override proves the script itself is pinned.
    update(['p', 'no-date-given'], { TZ: 'Pacific/Kiritimati' });
    expect(readJson(file).entries[0].date).toBe(todayHelsinki());
  });

  it('preserves unrelated pre-existing entries', () => {
    seed([{ date: '2026-06-01', project: 'old', text: 'keep me', category: 'log' }]);
    update(['p', 'new']);
    expect(readJson(file).entries.map((e) => e.text)).toEqual(['new', 'keep me']);
  });
});

describe('mase-fi-update — legacy category argument', () => {
  it.each(['feature', 'project'])('accepts a leading "%s" and writes a feature', (word) => {
    seed();
    const r = update([word, 'p', 'legacy', '2026-07-01']);
    expect(r.status).toBe(0);
    expect(readJson(file).entries).toEqual([
      { date: '2026-07-01', project: 'p', text: 'legacy', category: 'feature' },
    ]);
  });

  it('accepts the legacy form without a date', () => {
    seed();
    expect(update(['feature', 'p', 'legacy']).status).toBe(0);
    expect(readJson(file).entries[0]).toMatchObject({ project: 'p', text: 'legacy', category: 'feature' });
  });

  it('names the removed category argument when another word sits in its place', () => {
    seed([{ date: '2026-06-01', project: 'x', text: 'y', category: 'log' }]);
    const before = readFileSync(file, 'utf8');
    const r = update(['improvement', 'p', 'text']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/category argument was removed/i);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});

describe('mase-fi-update — refusal paths (no silent corruption)', () => {
  it('exits with usage when required args are missing', () => {
    const r = update(['onlyproject']);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/Usage:/);
  });

  it('exits with usage on too many args', () => {
    const r = update(['feature', 'p', 'text', '2026-07-01', 'extra']);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/Usage:/);
  });

  it('prints usage and exits 0 on --help', () => {
    const r = update(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toMatch(/Usage: mase-fi-update <project> <text> \[date\]/);
  });

  it('refuses a malformed updates.json and leaves it byte-for-byte intact', () => {
    writeFileSync(file, '{ this is not json ');
    const before = readFileSync(file, 'utf8');
    const r = update(['p', 'text']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/malformed JSON/i);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('refuses a non-YYYY-MM-DD date and leaves the file untouched', () => {
    seed([{ date: '2026-06-01', project: 'x', text: 'y', category: 'log' }]);
    const before = readFileSync(file, 'utf8');
    const r = update(['p', 'text', 'junkT12:34']);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/YYYY-MM-DD/i);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('refuses an impossible calendar day and leaves the file untouched', () => {
    seed([{ date: '2026-06-01', project: 'x', text: 'y', category: 'log' }]);
    const before = readFileSync(file, 'utf8');
    const r = update(['p', 'text', '2026-02-30']);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/valid calendar day/i);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});

describe('mase-fi-update — per-project feed embargo', () => {
  const existing = [{ date: '2026-06-01', project: 'x', text: 'y', category: 'log' }];

  it('refuses an embargoed project, naming the file and the date, and writes nothing', () => {
    seed(existing);
    const before = readFileSync(file, 'utf8');
    const HELM_BIN = writeHelmStub(dir, { embargoed: ['held-back'] });
    const r = update(['held-back', 'a new thing'], { HELM_BIN });
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/feed embargo until 2099-01-01/);
    expect(r.stderr).toContain('/srv/held-back/.embargo');
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(readHelmCalls(HELM_BIN)).toEqual(['project embargo held-back']);
  });

  it('does not create a missing updates.json for an embargoed project', () => {
    const HELM_BIN = writeHelmStub(dir, { embargoed: ['held-back'] });
    expect(update(['held-back', 'a new thing'], { HELM_BIN }).status).toBe(3);
    expect(existsSync(file)).toBe(false);
  });

  it('refuses an embargo file with no valid date as embargoed indefinitely', () => {
    seed(existing);
    const before = readFileSync(file, 'utf8');
    const HELM_BIN = writeHelmStub(dir, { indefinite: ['mistyped'] });
    const r = update(['mistyped', 'a new thing'], { HELM_BIN });
    expect(r.status).toBe(3);
    expect(r.stderr).toMatch(/indefinitely/);
    expect(r.stderr).toContain('/srv/mistyped/.embargo');
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('writes when the embargo is expired or absent (helm answers clear)', () => {
    seed(existing);
    const HELM_BIN = writeHelmStub(dir, { embargoed: ['held-back'] });
    const r = update(['released', 'a new thing', '2026-07-01'], { HELM_BIN });
    expect(r.status).toBe(0);
    expect(readJson(file).entries[0]).toEqual({ date: '2026-07-01', project: 'released', text: 'a new thing', category: 'feature' });
    expect(readHelmCalls(HELM_BIN)).toEqual(['project embargo released']);
  });

  it('checks the project, not the legacy category word', () => {
    seed(existing);
    const HELM_BIN = writeHelmStub(dir, { embargoed: ['held-back'] });
    expect(update(['feature', 'held-back', 'a new thing'], { HELM_BIN }).status).toBe(3);
  });

  it('refuses when the embargo cannot be determined', () => {
    seed(existing);
    const before = readFileSync(file, 'utf8');
    const HELM_BIN = writeHelmStub(dir, { unknown: ['p'] });
    const r = update(['p', 'a new thing'], { HELM_BIN });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/cannot check the feed embargo/);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('refuses when the helm CLI is missing', () => {
    seed(existing);
    const before = readFileSync(file, 'utf8');
    const r = update(['p', 'a new thing'], { HELM_BIN: join(dir, 'no-such-helm') });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/cannot check the feed embargo/);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});

describe('mase-fi-update — lock file must not clobber via symlink', () => {
  it('refuses a symlink lock path and leaves the victim file intact', () => {
    seed();
    const victim = join(dir, 'victim');
    const lock = join(dir, 'updates.json.lock');
    writeFileSync(victim, 'do-not-clobber');
    symlinkSync(victim, lock);
    const r = update(['p', 'text'], { UPDATES_LOCK: lock });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/lock/i);
    expect(readFileSync(victim, 'utf8')).toBe('do-not-clobber');
    expect(readJson(file).entries).toHaveLength(0); // entry not added
  });

  it('creates the lock as a regular file owned by us, not a followable path', () => {
    seed();
    const lockDir = join(dir, 'locks');
    mkdirSync(lockDir);
    const lock = join(lockDir, 'updates.json.lock');
    const r = update(['p', 'text'], { UPDATES_LOCK: lock });
    expect(r.status).toBe(0);
    expect(readJson(file).entries).toHaveLength(1);
    expect(lstatSync(lock).isSymbolicLink()).toBe(false);
  });
});
