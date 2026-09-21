// Golden-file tests for mase-fi-daily-summary's clean_lines() drop-regexes.
// These only ran through a canned-clean claude stub before this split — this
// file drives the narration/refusal/preamble paths the bug history cares about.
// Grouping + summary-branch and fallback/skip/compact/lock-guard suites live in
// mase-fi-daily-summary.test.js.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { writeFileSync } from 'node:fs';
import { makeTempDir, cleanup, writeJson, readJson, runScript, todayHelsinki, writeClaudeStub } from './test-helpers.js';

let TODAY;
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
  // Capture per-test, not at module load — a file that straddles Helsinki
  // midnight would otherwise seed yesterday into a script computing today.
  TODAY = todayHelsinki();
  dir = makeTempDir();
  file = join(dir, 'updates.json');
  extraFile = join(dir, 'extra.json');
  writeFileSync(extraFile, '[]');
});
afterEach(() => cleanup(dir));

describe('mase-fi-daily-summary — clean_lines drop rules', () => {
  const multi = () => seed([log('beta', 'c1'), log('beta', 'c2')]);

  it('keeps real changelog lines and drops preamble / narration / refusal noise', () => {
    multi();
    const dirty = [
      'Here are the summaries:',
      'two lines',
      'commits are all from a single day',
      'let me write the changelog',
      'I don\'t see any commits in your message',
      'working directory is empty',
      'please paste the commits',
      '- shipped dark mode toggle',
      '1. hardened the auth refresh path',
      '"quoted real work"',
      'Output:',
      '42 characters',
      'Summary:',
    ].join('\n');
    const CLAUDE_BIN = writeClaudeStub(dir, { output: dirty });
    run({ CLAUDE_BIN, MAX_LINES: '5' });
    expect(dailies().map((e) => e.summary)).toEqual([
      'shipped dark mode toggle',
      'hardened the auth refresh path',
      'quoted real work',
    ]);
  });

  it('drops trailing-colon lead-ins and "one per project" / distinct-threads meta', () => {
    multi();
    const dirty = [
      'Changes:',
      'Note: not a real summary:',
      'there appear to be three distinct threads',
      'emitting one per project',
      'added session claim locks',
    ].join('\n');
    const CLAUDE_BIN = writeClaudeStub(dir, { output: dirty });
    run({ CLAUDE_BIN });
    expect(dailies().map((e) => e.summary)).toEqual(['added session claim locks']);
  });

  it('drops a dangling open-paren when truncate lands mid-parenthetical', () => {
    multi();
    // >110 chars so truncate_summary clamps; ends with an unclosed "(" fragment
    const long =
      'word '.repeat(20).trim() + ' (and then a dangling parenthetical that never closes';
    expect(long.length).toBeGreaterThan(110);
    const CLAUDE_BIN = writeClaudeStub(dir, { output: long });
    run({ CLAUDE_BIN });
    const { summary } = dailies()[0];
    expect(summary).not.toMatch(/\([^)]*$/); // no unclosed paren at end
    expect(summary.length).toBeLessThanOrEqual(111);
  });
});
