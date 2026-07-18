// Golden-file tests for mase-fi-daily-summary: the group-by-project rewrite and
// the single-vs-multi-commit branch. `claude -p` is stubbed via CLAUDE_BIN; the
// live helm showcase API and ntfy are neutralized so the run is fully hermetic.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { makeTempDir, cleanup, writeJson, readJson, runScript, todayHelsinki, writeClaudeStub } from './test-helpers.js';

const TODAY = todayHelsinki();
let dir, file, extraFile;

const seed = (entries) => writeJson(file, { entries, projects: [] });
const log = (project, text, date = TODAY) => ({ date, project, text, category: 'log' });
const dailies = () => readJson(file).entries.filter((e) => e.category === 'daily');

// Base env: point every external dependency at a dead end so the script can only
// touch our fixture — unreachable showcase API (internal .projects refresh
// no-ops), missing HELM_ENV + empty NTFY_TOKEN (ntfy can find no token → no push).
const baseEnv = () => ({
  UPDATES_FILE: file,
  SHOWCASE_API: 'http://127.0.0.1:1/x',
  SHOWCASE_EXTRA: extraFile,
  HELM_ENV: join(dir, 'nonexistent.env'),
  NTFY_TOKEN: '',
});
const run = (env = {}) => runScript('mase-fi-daily-summary', [], { ...baseEnv(), ...env });

beforeEach(() => {
  dir = makeTempDir();
  file = join(dir, 'updates.json');
  extraFile = join(dir, 'extra.json');
  writeFileSync(extraFile, '[]');
});
afterEach(() => cleanup(dir));

describe('mase-fi-daily-summary — grouping + summary branch', () => {
  it('uses the commit subject verbatim for a single-commit project (no claude call)', () => {
    seed([log('alpha', 'feat(alpha): the only commit')]);
    // CLAUDE_BIN points at a stub that would FAIL loudly if ever invoked.
    const CLAUDE_BIN = writeClaudeStub(dir, { output: 'SHOULD-NOT-APPEAR', exitCode: 1 });
    const r = run({ CLAUDE_BIN });
    expect(r.status).toBe(0);
    expect(dailies()).toHaveLength(1);
    expect(dailies()[0]).toMatchObject({ project: 'alpha', summary: 'feat(alpha): the only commit' });
  });

  it('summarizes a multi-commit project through claude and stores the cleaned line', () => {
    seed([log('beta', 'feat(beta): one'), log('beta', 'fix(beta): two')]);
    const CLAUDE_BIN = writeClaudeStub(dir, { output: 'added a dark mode toggle' });
    run({ CLAUDE_BIN });
    expect(dailies()).toHaveLength(1);
    expect(dailies()[0]).toMatchObject({ project: 'beta', summary: 'added a dark mode toggle' });
  });

  it('emits one daily entry per summary line, capped at MAX_LINES', () => {
    seed([log('beta', 'c1'), log('beta', 'c2')]);
    const CLAUDE_BIN = writeClaudeStub(dir, { output: 'first thread shipped\nsecond thread shipped\nthird thread shipped' });
    run({ CLAUDE_BIN, MAX_LINES: '2' });
    expect(dailies().map((e) => e.summary)).toEqual(['first thread shipped', 'second thread shipped']);
  });

  it('groups commits by project — one daily set per project', () => {
    seed([log('alpha', 'feat(alpha): only'), log('beta', 'feat(beta): one'), log('beta', 'fix(beta): two')]);
    const CLAUDE_BIN = writeClaudeStub(dir, { output: 'hardened the auth layer' });
    run({ CLAUDE_BIN });
    const byProject = Object.fromEntries(dailies().map((e) => [e.project, e.summary]));
    expect(byProject).toEqual({ alpha: 'feat(alpha): only', beta: 'hardened the auth layer' });
  });

  it('carries the raw commit list onto each daily entry', () => {
    seed([log('beta', 'c1'), log('beta', 'c2')]);
    const CLAUDE_BIN = writeClaudeStub(dir, { output: 'did the thing' });
    run({ CLAUDE_BIN });
    expect(dailies()[0].commits).toEqual(['c1', 'c2']);
  });

  it('truncates an over-long summary line to a word boundary with an ellipsis', () => {
    seed([log('beta', 'c1'), log('beta', 'c2')]);
    const longLine = 'word '.repeat(30).trim(); // 149 chars, all word-boundaries
    const CLAUDE_BIN = writeClaudeStub(dir, { output: longLine });
    run({ CLAUDE_BIN });
    const { summary } = dailies()[0];
    expect(summary.length).toBeLessThanOrEqual(111);
    expect(summary.endsWith('…')).toBe(true);
    expect(longLine.startsWith(summary.replace(/…$/, '').trimEnd())).toBe(true);
  });
});

describe('mase-fi-daily-summary — fallback + skip paths', () => {
  it('falls back to "project: N commits" when claude fails/returns nothing', () => {
    seed([log('beta', 'c1'), log('beta', 'c2')]);
    const CLAUDE_BIN = writeClaudeStub(dir, { output: '', exitCode: 1 });
    run({ CLAUDE_BIN });
    expect(dailies()).toHaveLength(1);
    expect(dailies()[0].summary).toBe('beta: 2 commits');
  });

  it('is idempotent — skips when daily entries already exist for today', () => {
    seed([
      { date: TODAY, project: 'beta', category: 'daily', summary: 'already summarized', commits: ['c1'] },
      log('beta', 'c1'),
      log('beta', 'c2'),
    ]);
    const CLAUDE_BIN = writeClaudeStub(dir, { output: 'should not be added' });
    const r = run({ CLAUDE_BIN });
    expect(r.stdout).toMatch(/already exist/i);
    expect(dailies().map((e) => e.summary)).toEqual(['already summarized']);
  });

  it('skips when there are no log entries for today', () => {
    seed([log('beta', 'old commit', '2026-01-01')]); // not today
    const CLAUDE_BIN = writeClaudeStub(dir, { output: 'should not run' });
    const r = run({ CLAUDE_BIN });
    expect(r.stdout).toMatch(/No log entries/i);
    expect(dailies()).toHaveLength(0);
  });
});
