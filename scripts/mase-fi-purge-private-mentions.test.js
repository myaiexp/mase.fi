// Golden-file tests for mase-fi-purge-private's mention report: which other rows
// count as still naming a private project, and that the report finishes inside
// helm's 60s purge timeout on a feed the size of production's.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { makeTempDir, cleanup, writeJson, runScript } from './test-helpers.js';

/** @type {string} */
let dir;
/** @type {string} */
let file;
/** @type {string} */
let archive;
/** @type {string} */
let apiFile;

beforeEach(() => {
  dir = makeTempDir();
  file = join(dir, 'updates.json');
  archive = join(dir, 'updates-archive.json');
  apiFile = join(dir, 'private.json');
});
afterEach(() => cleanup(dir));

/** @param {string[]} names */
const run = (names) => {
  writeFileSync(apiFile, JSON.stringify({ private: names.map((name) => ({ name })) }));
  return runScript('mase-fi-purge-private', [], {
    UPDATES_FILE: file,
    ARCHIVE_FILE: archive,
    BACKUP_DIR: join(dir, 'backups'),
    PRIVATE_API: `file://${apiFile}`,
    TODAY: '2026-10-11',
    LOG_HOT_DAYS: '90',
  });
};
/**
 * @param {string} date
 * @param {string} summary
 */
const daily = (date, summary) => ({ date, category: 'daily', project: 'home', summary });
/**
 * @param {string} date
 * @param {string} text
 */
const log = (date, text) => ({ date, category: 'log', project: 'helm', text });
/** @param {{ stdout: string }} r */
const mentioned = (r) => r.stdout.split('\n').filter((l) => l.startsWith('still mentioned: ')).sort();

describe('mase-fi-purge-private — mention report', () => {
  it('reports mentions in both files, in summary and text, on a nothing-to-purge run', () => {
    writeJson(file, { projects: [], entries: [daily('2026-10-02', 'Acme shipped x'), log('2026-10-03', 'wire ACME in')] });
    writeJson(archive, { entries: [log('2026-01-04', 'first acme commit')] });
    const r = run(['acme']);
    expect(r.status).toBe(0);
    expect(r.stdout.split('\n')[0]).toBe('nothing to purge');
    expect(mentioned(r)).toEqual([
      'still mentioned: helm 2026-01-04 (log)',
      'still mentioned: helm 2026-10-03 (log)',
      'still mentioned: home 2026-10-02 (daily)',
    ]);
  });

  it('needs a whole name: hyphen, underscore and letters on either side do not count', () => {
    writeJson(file, {
      projects: [],
      entries: [
        daily('2026-10-01', 'acme-tools and my_acme and acmes'),
        daily('2026-10-02', '(acme), acme. and acme/x'),
      ],
    });
    writeJson(archive, { entries: [] });
    expect(mentioned(run(['acme']))).toEqual(['still mentioned: home 2026-10-02 (daily)']);
  });

  it('matches a name with regex characters literally', () => {
    writeJson(file, { projects: [], entries: [daily('2026-10-01', 'a.b landed'), daily('2026-10-02', 'axb landed')] });
    writeJson(archive, { entries: [] });
    expect(mentioned(run(['a.b']))).toEqual(['still mentioned: home 2026-10-01 (daily)']);
  });

  it('lists a row once when it names several private projects', () => {
    writeJson(file, { projects: [], entries: [daily('2026-10-01', 'acme and beta both')] });
    writeJson(archive, { entries: [] });
    expect(mentioned(run(['acme', 'beta']))).toEqual(['still mentioned: home 2026-10-01 (daily)']);
  });

  // Production: 25 private names, ~17k rows. The per-name regex took 68s there,
  // past helm's execFile timeout. A third of that feed must finish well inside it.
  it('scans 6,000 rows against 25 names in under 10s', () => {
    const names = Array.from({ length: 25 }, (_, i) => `private-name-${i}`);
    const rows = Array.from({ length: 6000 }, (_, i) =>
      log(`2026-0${(i % 9) + 1}-01`, `commit ${i}: refactor the feed renderer and its tests`));
    rows[17] = log('2026-09-30', 'mentions private-name-3 once');
    writeJson(file, { projects: [], entries: rows.slice(0, 3000) });
    writeJson(archive, { entries: rows.slice(3000) });
    const started = Date.now();
    const r = run(names);
    const elapsed = Date.now() - started;
    expect(r.status).toBe(0);
    expect(mentioned(r)).toEqual(['still mentioned: helm 2026-09-30 (log)']);
    expect(elapsed).toBeLessThan(10_000);
  }, 60_000);
});
