// Tests for the script-test harness itself: runScript must never let a pipeline
// script reach the live store, the claude CLI, the showcase API or ntfy by omission.
import { describe, it, expect, afterEach } from 'vitest';
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { runScript, scriptEnv } from './test-helpers.js';

const LIVE_VARS = ['UPDATES_FILE', 'ARCHIVE_FILE', 'CLAUDE_BIN', 'SHOWCASE_API', 'NTFY_URL', 'NTFY_TOKEN', 'HELM_ENV'];
// A name that resolves to no script: if the guard ever regresses, bash fails on the
// missing file instead of a real pipeline script running against the live store.
const NO_SCRIPT = 'no-such-script-for-harness-test';
const saved =Object.fromEntries(LIVE_VARS.map((k) => [k, process.env[k]]));

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('runScript', () => {
  it('refuses to run without an explicit UPDATES_FILE (the script default is the live store)', () => {
    expect(() => runScript(NO_SCRIPT, [], {})).toThrow(/UPDATES_FILE must be set/);
  });

  it('refuses an UPDATES_FILE inherited from the host env instead of passed by the test', () => {
    process.env.UPDATES_FILE = '/var/lib/mase-fi/updates.json';
    expect(() => runScript(NO_SCRIPT, [], {})).toThrow(/UPDATES_FILE must be set/);
  });
});

describe('scriptEnv', () => {
  const env = (overrides = {}) => scriptEnv({ UPDATES_FILE: '/x/updates.json', ...overrides });

  it('points every live endpoint at a dead or throwaway target when the test omits it', () => {
    const e = env();
    expect(e.SHOWCASE_API).toBe('http://127.0.0.1:1/');
    expect(e.NTFY_URL).toBe('http://127.0.0.1:1/');
    expect(e.NTFY_TOKEN).toBe('');
    expect(existsSync(e.HELM_ENV)).toBe(false);
    expect(e.UPDATES_LOCK.startsWith(tmpdir())).toBe(true);
    expect(e.HELM_BIN.startsWith(tmpdir())).toBe(true);
    expect(e.CLAUDE_BIN.startsWith(tmpdir())).toBe(true);
    expect('ARCHIVE_FILE' in e).toBe(false); // the script derives it beside UPDATES_FILE
  });

  it('the default CLAUDE_BIN fails loudly instead of answering', () => {
    const r = spawnSync(env().CLAUDE_BIN, ['-p'], { encoding: 'utf8' });
    expect(r.status).not.toBe(0);
    expect(r.stdout).toBe('');
  });

  it('host env values never leak through: only the test decides these', () => {
    process.env.CLAUDE_BIN = '/home/mase/.local/bin/claude';
    process.env.SHOWCASE_API = 'http://localhost:9754/api/projects/showcase';
    process.env.NTFY_URL = 'https://ntfy.mase.fi/kelo';
    process.env.NTFY_TOKEN = 'live-token';
    process.env.HELM_ENV = '/home/mase/Projects/helm/.env';
    process.env.ARCHIVE_FILE = '/var/lib/mase-fi/updates-archive.json';
    const e = env();
    expect(e.CLAUDE_BIN).not.toBe('/home/mase/.local/bin/claude');
    expect(e.SHOWCASE_API).toBe('http://127.0.0.1:1/');
    expect(e.NTFY_URL).toBe('http://127.0.0.1:1/');
    expect(e.NTFY_TOKEN).toBe('');
    expect(e.HELM_ENV).not.toBe('/home/mase/Projects/helm/.env');
    expect('ARCHIVE_FILE' in e).toBe(false);
  });

  it('a value the test passes wins over the hermetic default', () => {
    const e = env({ SHOWCASE_API: 'http://127.0.0.1:1/x', NTFY_TOKEN: 't', ARCHIVE_FILE: '/x/a.json' });
    expect(e.SHOWCASE_API).toBe('http://127.0.0.1:1/x');
    expect(e.NTFY_TOKEN).toBe('t');
    expect(e.ARCHIVE_FILE).toBe('/x/a.json');
  });
});
