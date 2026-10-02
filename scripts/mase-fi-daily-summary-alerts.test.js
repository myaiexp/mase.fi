// Golden-file tests for mase-fi-daily-summary's ntfy alerts: the compact FAILED/degraded
// pushes, the on_exit FAILED push on a hard abort, and ntfy_send's token handling
// (stdin not argv, the HELM_ENV fallback, the CR/LF strip). A recording fake curl
// stands in for ntfy; `claude -p` is stubbed via CLAUDE_BIN and the showcase API is
// unreachable, so every run is hermetic.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import process from 'node:process';
import { join } from 'node:path';
import { chmodSync, existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { makeTempDir, cleanup, writeJson, readJson, runScript, todayHelsinki, writeClaudeStub } from './test-helpers.js';

// Each run spawns the whole script (jq, curl, the compactor, the stubs): ~2s alone on
// the VPS, and past vitest's 5s default once the other script suites run beside it.
vi.setConfig({ testTimeout: 20_000 });

let TODAY;
let dir, file, extraFile;

const seed = (entries) => writeJson(file, { entries, projects: [] });
const log = (project, text, date = TODAY) => ({ date, project, text, category: 'log' });
const dailies = () => readJson(file).entries.filter((e) => e.category === 'daily');

// Base env: unreachable showcase API (the .projects refresh no-ops), missing HELM_ENV
// + empty NTFY_TOKEN. Each test layers fakeCurl's env (token + ntfy URL) on top.
const baseEnv = () => ({
  UPDATES_FILE: file,
  SHOWCASE_API: 'http://127.0.0.1:1/x',
  SHOWCASE_EXTRA: extraFile,
  HELM_ENV: join(dir, 'nonexistent.env'),
  NTFY_TOKEN: '',
});
const run = (env = {}) => runScript('mase-fi-daily-summary', [], { ...baseEnv(), ...env });

// Fake curl first on PATH: records ntfy pushes (argv and stdin, where the headers
// travel) and fails every other call, which the showcase refresh treats as helm
// unreachable (.projects left alone).
const fakeCurl = () => {
  const bin = join(dir, 'bin');
  const argv = join(dir, 'ntfy-argv');
  const stdin = join(dir, 'ntfy-stdin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'curl'), `#!/usr/bin/env bash
case "$*" in *ntfy.test*) printf '%s\\n' "$*" >> ${JSON.stringify(argv)}; cat >> ${JSON.stringify(stdin)}; exit 0 ;; esac
exit 7
`);
  chmodSync(join(bin, 'curl'), 0o755);
  const read = (f) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
  return {
    env: { PATH: `${bin}:${process.env.PATH}`, NTFY_TOKEN: 'test-token', NTFY_URL: 'http://ntfy.test/kelo' },
    pushes: () => read(argv) + read(stdin),
    argv: () => read(argv),
    stdin: () => read(stdin),
  };
};
// No log for today → the skip path, which still compacts.
const seedSkip = () => seed([log('beta', 'old commit', '2026-01-01')]);

beforeEach(() => {
  // Capture per-test, not at module load — a file that straddles Helsinki
  // midnight would otherwise seed yesterday into a script computing today.
  TODAY = todayHelsinki();
  dir = makeTempDir();
  file = join(dir, 'updates.json');
  extraFile = join(dir, 'extra.json');
  writeFileSync(extraFile, '[]');
});
afterEach(() => cleanup(dir));

describe('mase-fi-daily-summary — compact alerts (finding #9443)', () => {
  it('pushes a FAILED alert, exits 0, and leaves both files alone on a malformed archive', () => {
    seedSkip();
    const arch = join(dir, 'updates-archive.json');
    writeFileSync(arch, '{ torn');
    const before = readFileSync(file, 'utf8');
    const curl = fakeCurl();
    const r = run({ ...curl.env, ARCHIVE_FILE: arch });
    expect(r.status).toBe(0);
    expect(r.stderr).toMatch(/not a valid .*archive/);
    expect(curl.pushes()).toMatch(/compact FAILED/);
    expect(readFileSync(arch, 'utf8')).toBe('{ torn');
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('pushes a degraded alert when the archive cannot be created', () => {
    seedSkip();
    const curl = fakeCurl();
    const r = run({ ...curl.env, ARCHIVE_FILE: join(dir, 'missing-dir', 'a.json') });
    expect(r.status).toBe(0);
    expect(curl.pushes()).toMatch(/compact degraded/);
    expect(readJson(file).entries.map((e) => e.text)).toEqual(['old commit']);
  });

  it('pushes nothing on a clean compact', () => {
    seedSkip();
    const curl = fakeCurl();
    const r = run(curl.env);
    expect(r.status).toBe(0);
    expect(curl.pushes()).toBe('');
    expect(readJson(join(dir, 'updates-archive.json')).entries.map((e) => e.text)).toEqual(['old commit']);
  });

  it('compacts on the write path too, after the day\'s summaries land', () => {
    seed([log('alpha', 'feat(alpha): only'), log('beta', 'ancient commit', '2026-01-01')]);
    const curl = fakeCurl();
    const r = run({ ...curl.env, CLAUDE_BIN: writeClaudeStub(dir, { exitCode: 1 }) });
    expect(r.status).toBe(0);
    expect(dailies()).toHaveLength(1);
    expect(curl.pushes()).toBe('');
    expect(readJson(join(dir, 'updates-archive.json')).entries.map((e) => e.text)).toEqual(['ancient commit']);
  });
});

describe('mase-fi-daily-summary — hard-abort alert (on_exit)', () => {
  // {"entries":[1]} is valid JSON with an entries array, but the first .category
  // select indexes a number: jq errors and set -e aborts mid-run. on_exit is the
  // only thing that turns that into a push instead of a silently stale homepage.
  it('pushes "daily-summary FAILED (exit N)" and leaves updates.json untouched', () => {
    writeFileSync(file, '{"entries":[1]}');
    const curl = fakeCurl();
    const r = run(curl.env);
    expect(r.status).not.toBe(0);
    expect(curl.pushes()).toMatch(new RegExp(`daily-summary FAILED \\(exit ${r.status}\\)`));
    expect(readFileSync(file, 'utf8')).toBe('{"entries":[1]}');
  });

  it('stays quiet on an intentional skip (exit 0)', () => {
    seedSkip();
    const curl = fakeCurl();
    expect(run(curl.env).status).toBe(0);
    expect(curl.pushes()).not.toMatch(/daily-summary FAILED/);
  });
});

describe('mase-fi-daily-summary — ntfy token handling', () => {
  // A torn archive forces a compact FAILED push, the cheapest way to reach ntfy_send.
  const tornArchive = () => {
    const arch = join(dir, 'updates-archive.json');
    writeFileSync(arch, '{ torn');
    return arch;
  };

  // argv is world-readable in /proc/<pid>/cmdline, so the token goes on stdin (finding #10177).
  it('hands curl the bearer token on stdin, never argv', () => {
    seedSkip();
    const curl = fakeCurl();
    run({ ...curl.env, ARCHIVE_FILE: tornArchive() });
    expect(curl.argv()).toMatch(/ntfy\.test/);
    expect(curl.argv()).not.toMatch(/test-token/);
    expect(curl.stdin()).toMatch(/^Authorization: Bearer test-token$/m);
  });

  // NTFY_TOKEN empty → the token comes from $HELM_ENV; its CRLF line ending is
  // stripped, so no stray CR can split or inject a header.
  it('falls back to NTFY_TOKEN in $HELM_ENV and strips its CR', () => {
    seedSkip();
    const helmEnv = join(dir, 'helm.env');
    writeFileSync(helmEnv, 'OTHER=x\r\nNTFY_TOKEN=tok\r\n');
    const curl = fakeCurl();
    run({ ...curl.env, NTFY_TOKEN: '', HELM_ENV: helmEnv, ARCHIVE_FILE: tornArchive() });
    const stdin = curl.stdin();
    expect(stdin).toMatch(/^Authorization: Bearer tok\nTitle: /);
    expect(stdin).not.toContain('\r');
  });

  it('sends nothing when neither NTFY_TOKEN nor $HELM_ENV holds a token', () => {
    seedSkip();
    const curl = fakeCurl();
    run({ ...curl.env, NTFY_TOKEN: '', ARCHIVE_FILE: tornArchive() });
    expect(curl.pushes()).toBe('');
  });
});
