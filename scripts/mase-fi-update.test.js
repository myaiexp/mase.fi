// Golden-file tests for mase-fi-update: prepend ordering + sticky-capacity
// demotion (the jq index-arithmetic that could silently drop the site's content)
// plus the malformed-JSON / bad-category refusal paths.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { readFileSync, writeFileSync } from 'node:fs';
import { makeTempDir, cleanup, writeJson, readJson, runScript, todayHelsinki } from './test-helpers.js';

let dir, file;
const update = (args, env = {}) => runScript('mase-fi-update', args, { UPDATES_FILE: file, ...env });
const seed = (entries = [], projects = []) => writeJson(file, { entries, projects });

beforeEach(() => {
  dir = makeTempDir();
  file = join(dir, 'updates.json');
});
afterEach(() => cleanup(dir));

describe('mase-fi-update — write + prepend', () => {
  it('creates the file when missing and adds the entry', () => {
    // file does not exist yet
    const r = update(['feature', 'explorer', 'first', '2026-07-18']);
    expect(r.status).toBe(0);
    const data = readJson(file);
    expect(data.entries).toHaveLength(1);
    expect(data.entries[0]).toMatchObject({
      project: 'explorer', text: 'first', category: 'feature', sticky: true,
    });
    expect(data.projects).toEqual([]);
  });

  it('prepends newest-first and marks new entries sticky', () => {
    seed();
    update(['feature', 'p', 'older', '2026-07-01']);
    update(['feature', 'p', 'newer', '2026-07-02']);
    const texts = readJson(file).entries.map((e) => e.text);
    expect(texts).toEqual(['newer', 'older']);
    expect(readJson(file).entries.every((e) => e.sticky === true)).toBe(true);
  });

  it('defaults the date to today when omitted', () => {
    seed();
    update(['feature', 'p', 'no-date-given']);
    expect(readJson(file).entries[0].date).toBe(todayHelsinki());
  });

  it('preserves unrelated pre-existing entries', () => {
    seed([{ date: '2026-06-01', project: 'old', text: 'keep me', category: 'log' }]);
    update(['feature', 'p', 'new']);
    const texts = readJson(file).entries.map((e) => e.text);
    expect(texts).toEqual(['new', 'keep me']);
  });
});

describe('mase-fi-update — sticky-capacity demotion', () => {
  it('demotes the oldest project entry past the 2-sticky limit', () => {
    seed();
    update(['project', 'p', 'proj1']);
    update(['project', 'p', 'proj2']);
    update(['project', 'p', 'proj3']); // 3rd — oldest must demote
    const byText = Object.fromEntries(readJson(file).entries.map((e) => [e.text, e.sticky]));
    expect(byText).toEqual({ proj3: true, proj2: true, proj1: false });
  });

  it('demotes the oldest feature entry past the 3-sticky limit', () => {
    seed();
    for (const t of ['f1', 'f2', 'f3', 'f4']) update(['feature', 'p', t]);
    const byText = Object.fromEntries(readJson(file).entries.map((e) => [e.text, e.sticky]));
    expect(byText).toEqual({ f4: true, f3: true, f2: true, f1: false });
  });

  it('keeps exactly `limit` sticky entries per category as more pile up', () => {
    seed();
    for (const t of ['f1', 'f2', 'f3', 'f4', 'f5']) update(['feature', 'p', t]);
    const stickies = readJson(file).entries.filter((e) => e.category === 'feature' && e.sticky);
    expect(stickies.map((e) => e.text)).toEqual(['f5', 'f4', 'f3']);
  });

  it('demotes per-category — adding features never touches project stickiness', () => {
    seed();
    update(['project', 'p', 'projA']);
    update(['project', 'p', 'projB']); // 2 project stickies (at limit, none demoted)
    for (const t of ['f1', 'f2', 'f3', 'f4']) update(['feature', 'p', t]); // 4 features → f1 demotes
    const stickyProjects = readJson(file).entries.filter((e) => e.category === 'project' && e.sticky);
    expect(stickyProjects.map((e) => e.text).sort()).toEqual(['projA', 'projB']);
  });
});

describe('mase-fi-update — refusal paths (no silent corruption)', () => {
  it('rejects an unknown category without writing', () => {
    seed([{ date: '2026-06-01', project: 'x', text: 'y', category: 'log' }]);
    const before = readFileSync(file, 'utf8');
    const r = update(['bogus', 'p', 'text']);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/category must be/i);
    expect(readFileSync(file, 'utf8')).toBe(before); // untouched
  });

  it('exits with usage when required args are missing', () => {
    const r = update(['feature', 'onlyproject']);
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toMatch(/Usage:/);
  });

  it('refuses a malformed updates.json and leaves it byte-for-byte intact', () => {
    writeFileSync(file, '{ this is not json ');
    const before = readFileSync(file, 'utf8');
    const r = update(['feature', 'p', 'text']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/malformed JSON/i);
    expect(readFileSync(file, 'utf8')).toBe(before);
  });
});
