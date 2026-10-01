// Tests for mase-fi-daily-summary's feed-embargo gate: a project under an embargo, or
// one whose embargo cannot be checked, gets no daily entry and no summarizer call.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { makeTempDir, cleanup, writeJson, readJson, runScript, todayHelsinki, writeClaudeStub, writeHelmStub, readHelmCalls } from './test-helpers.js';

// Each run spawns the whole script (jq, curl, the compactor, the stubs): ~2s alone on
// the VPS, and past vitest's 5s default once the other script suites run beside it.
vi.setConfig({ testTimeout: 20_000 });

let TODAY;
let dir, file, extraFile;

const seed = (entries) => writeJson(file, { entries, projects: [] });
const log = (project, text) => ({ date: TODAY, project, text, category: 'log' });
const dailies = () => readJson(file).entries.filter((e) => e.category === 'daily');
const run = (env = {}) =>
  runScript('mase-fi-daily-summary', [], {
    UPDATES_FILE: file,
    SHOWCASE_API: 'http://127.0.0.1:1/x',
    SHOWCASE_EXTRA: extraFile,
    HELM_ENV: join(dir, 'nonexistent.env'),
    NTFY_TOKEN: '',
    ...env,
  });

beforeEach(() => {
  TODAY = todayHelsinki();
  dir = makeTempDir();
  file = join(dir, 'updates.json');
  extraFile = join(dir, 'extra.json');
  writeFileSync(extraFile, '[]');
});
afterEach(() => cleanup(dir));

describe('mase-fi-daily-summary — per-project feed embargo', () => {
  it('writes no daily entry for an embargoed project and still summarizes the rest', () => {
    seed([log('held-back', 'feat: a hidden thing'), log('alpha', 'feat(alpha): visible')]);
    const HELM_BIN = writeHelmStub(dir, { embargoed: ['held-back'] });
    const r = run({ HELM_BIN, CLAUDE_BIN: writeClaudeStub(dir, { output: 'unused' }) });
    expect(r.status).toBe(0);
    expect(dailies().map((e) => e.project)).toEqual(['alpha']);
    expect(r.stderr).toMatch(/feed embargo until 2099-01-01/);
    expect(readHelmCalls(HELM_BIN).sort()).toEqual(['project embargo alpha', 'project embargo held-back']);
  });

  it('never sends an embargoed project\'s commits to the summarizer', () => {
    seed([log('held-back', 'feat: one'), log('held-back', 'feat: two')]);
    const HELM_BIN = writeHelmStub(dir, { embargoed: ['held-back'] });
    const r = run({ HELM_BIN, CLAUDE_BIN: writeClaudeStub(dir, { output: 'a summary that must not exist' }) });
    expect(r.status).toBe(0);
    expect(dailies()).toEqual([]);
    expect(existsSync(join(dir, 'claude-argv'))).toBe(false);
  });

  it('skips an embargo file with no valid date the same way', () => {
    seed([log('mistyped', 'feat: a thing')]);
    const HELM_BIN = writeHelmStub(dir, { indefinite: ['mistyped'] });
    const r = run({ HELM_BIN });
    expect(dailies()).toEqual([]);
    expect(r.stderr).toMatch(/indefinitely/);
  });

  it('skips a project whose embargo cannot be checked, and says how many', () => {
    seed([log('unreachable', 'feat: a thing'), log('alpha', 'feat(alpha): visible')]);
    const HELM_BIN = writeHelmStub(dir, { unknown: ['unreachable'] });
    const r = run({ HELM_BIN });
    expect(r.status).toBe(0);
    expect(dailies().map((e) => e.project)).toEqual(['alpha']);
    expect(r.stdout).toMatch(/1 project\(s\) skipped: feed embargo could not be checked/);
  });
});
