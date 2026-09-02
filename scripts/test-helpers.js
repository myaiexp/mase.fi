// Shared harness for the content-pipeline script tests.
// Runs the REAL scripts against a throwaway updates.json fixture via their env
// overrides (UPDATES_FILE / SHOWCASE_API / SHOWCASE_EXTRA / CLAUDE_BIN), so the
// tests exercise the actual jq programs end-to-end (golden-file style) rather
// than reimplementing them.
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPTS_DIR = dirname(fileURLToPath(import.meta.url));

export function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'mase-fi-scripts-'));
}

export function cleanup(dir) {
  rmSync(dir, { recursive: true, force: true });
}

export function writeJson(file, obj) {
  writeFileSync(file, JSON.stringify(obj, null, 2));
}

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

// Run a pipeline script under bash with env overrides. Never throws — returns
// { status, stdout, stderr } for both success and non-zero exits so tests can
// assert on the refusal paths (malformed JSON, bad category, lock busy).
export function runScript(name, args = [], env = {}) {
  // Pin Helsinki unless the caller overrides TZ. Both pipeline scripts that
  // compute "today" also force it internally; this keeps fixtures, helpers,
  // and any future date call on the same calendar even if a host TZ leaks in
  // (e.g. `TZ=Pacific/Kiritimati vitest`). Only an explicit per-call env.TZ
  // wins over the pin.
  const merged = { ...process.env, TZ: 'Europe/Helsinki', ...env };
  // Don't flock the live /tmp/mase-updates-json.lock from tests — a concurrent
  // deploy would wait on us, and we would wait on it.
  if (!merged.UPDATES_LOCK) {
    merged.UPDATES_LOCK = join(tmpdir(), `mase-fi-test-${process.pid}.lock`);
  }
  const r = spawnSync('bash', [join(SCRIPTS_DIR, name), ...args], {
    env: merged,
    encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// The exact date string the scripts use for "today" (both force
// `TZ="Europe/Helsinki" date +%Y-%m-%d`; runScript pins the same TZ so a
// fixture seeded before spawn cannot drift). Shell out so there is zero chance
// of TZ drift between the fixture and the script.
export function todayHelsinki() {
  const r = spawnSync('date', ['+%Y-%m-%d'], {
    env: { ...process.env, TZ: 'Europe/Helsinki' },
    encoding: 'utf8',
  });
  return r.stdout.trim();
}

// Write an executable stub standing in for `claude -p` (CLAUDE_BIN). `output` is
// printed verbatim to stdout; a non-zero `exitCode` simulates a failed/timed-out
// call so the daily-summary fallback path can be exercised.
export function writeClaudeStub(dir, { output = '', exitCode = 0 } = {}) {
  const path = join(dir, 'claude-stub');
  // Record argv (NUL-separated) so tests can assert flags like --tools ""; then
  // emit canned output and exit. The live binary is never invoked.
  const argvFile = join(dir, 'claude-argv');
  const body = `#!/usr/bin/env bash
printf '%s\\0' "$@" > ${JSON.stringify(argvFile)}
cat <<'STUB_EOF'
${output}
STUB_EOF
exit ${exitCode}
`;
  writeFileSync(path, body);
  chmodSync(path, 0o755);
  return path;
}

export function readClaudeArgv(dir) {
  return readFileSync(join(dir, 'claude-argv'), 'utf8').split('\0');
}
