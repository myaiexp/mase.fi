// Shared harness for the content-pipeline script tests.
// Runs the REAL scripts against a throwaway updates.json fixture via their env
// overrides (UPDATES_FILE / SHOWCASE_API / SHOWCASE_EXTRA / CLAUDE_BIN / HELM_BIN / NTFY_URL), so the
// tests exercise the actual jq programs end-to-end (golden-file style) rather
// than reimplementing them.
import process from 'node:process';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs';
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

// Every script default below is a live resource on the VPS these suites run on.
// Only the calling test may set them: a value inherited from the host env is
// dropped, and an omitted one falls back to a hermetic stand-in. ARCHIVE_FILE is
// dropped rather than defaulted so the script derives it beside UPDATES_FILE.
const UNREACHABLE = 'http://127.0.0.1:1/';
const hermeticDefaults = {
  // The live /tmp/mase-updates-json.lock: a concurrent deploy would wait on us, and we on it.
  UPDATES_LOCK: () => join(tmpdir(), `mase-fi-test-${process.pid}.lock`),
  // The writers ask helm about feed embargoes; the stub answers "clear" for every name.
  HELM_BIN: () => writeHelmStub(tmpdir(), { name: `mase-fi-test-helm-${process.pid}` }),
  CLAUDE_BIN: () => writeFailingStub(tmpdir(), `mase-fi-test-claude-${process.pid}`),
  SHOWCASE_API: () => UNREACHABLE,
  NTFY_URL: () => UNREACHABLE,
  NTFY_TOKEN: () => '',
  // ntfy_send falls back to helm's .env for a token; a missing file means none.
  HELM_ENV: () => join(tmpdir(), `mase-fi-test-${process.pid}-nonexistent.env`),
  ARCHIVE_FILE: () => undefined,
};

// The env a pipeline script runs under: host env, Helsinki TZ, the caller's
// overrides, and hermeticDefaults for whatever live resource the caller left out.
export function scriptEnv(env = {}) {
  // Pin Helsinki unless the caller overrides TZ. Both pipeline scripts that
  // compute "today" also force it internally; this keeps fixtures, helpers,
  // and any future date call on the same calendar even if a host TZ leaks in
  // (e.g. `TZ=Pacific/Kiritimati vitest`). Only an explicit per-call env.TZ
  // wins over the pin.
  const merged = { ...process.env, TZ: 'Europe/Helsinki', ...env };
  for (const [key, fallback] of Object.entries(hermeticDefaults)) {
    if (key in env) continue;
    const value = fallback();
    if (value === undefined) delete merged[key];
    else merged[key] = value;
  }
  return merged;
}

// Run a pipeline script under bash with env overrides. Returns { status, stdout,
// stderr } for both success and non-zero exits so tests can assert on the refusal
// paths (malformed JSON, bad category, lock busy). Throws only on harness misuse:
// a call without its own UPDATES_FILE, whose script default is the live store.
export function runScript(name, args = [], env = {}) {
  if (!env.UPDATES_FILE) {
    throw new Error('runScript: UPDATES_FILE must be set — the script default is the live /var/lib/mase-fi/updates.json');
  }
  const r = spawnSync('bash', [join(SCRIPTS_DIR, name), ...args], {
    env: scriptEnv(env),
    encoding: 'utf8',
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

// An executable that prints to stderr and exits 1 — the default for a CLI a test
// did not stub, so an unplanned call fails loudly instead of reaching the real one.
function writeFailingStub(dir, name) {
  const path = join(dir, name);
  writeFileSync(path, `#!/usr/bin/env bash\necho "${name}: unstubbed call from a test" >&2\nexit 1\n`);
  chmodSync(path, 0o755);
  return path;
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
export function writeClaudeStub(dir, { output = '', exitCode = 0, prelude = '' } = {}) {
  const path = join(dir, 'claude-stub');
  // Record argv (NUL-separated) so tests can assert flags like --tools ""; then
  // emit canned output and exit. The live binary is never invoked.
  // `prelude` runs first so a test can mutate updates.json mid-run (in-lock
  // malformed-JSON / race-with-a-sibling-writer paths).
  const argvFile = join(dir, 'claude-argv');
  const body = `#!/usr/bin/env bash
${prelude}
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

// Write an executable stub standing in for the helm CLI (HELM_BIN), which the writers
// call as `helm project embargo <project>`. Projects named in `embargoed` get exit 3 with
// a dated refusal, in `indefinite` exit 3 with the no-valid-date refusal, in `unknown`
// exit 1 (helm could not answer); every other project is clear (exit 0). Each call's
// argv is appended to `<stub>.calls`, read back with readHelmCalls.
export function writeHelmStub(dir, { embargoed = [], indefinite = [], unknown = [], name = 'helm-stub' } = {}) {
  const path = join(dir, name);
  const arm = (names, body) => (names.length ? `  ${names.join('|')}) ${body} ;;\n` : '');
  const body = `#!/usr/bin/env bash
printf '%s\\n' "$*" >> ${JSON.stringify(`${path}.calls`)}
case "\${3:-}" in
${arm(embargoed, 'echo "$3: feed embargo until 2099-01-01 (/srv/$3/.embargo)"; exit 3')}${arm(
    indefinite,
    'echo "$3: feed embargo, indefinitely — /srv/$3/.embargo has no YYYY-MM-DD date on its first non-comment line"; exit 3',
  )}${arm(unknown, `echo "Error: cannot determine $3's feed embargo — helm is unreachable" >&2; exit 1`)}esac
echo "$3: no feed embargo"
`;
  writeFileSync(path, body);
  chmodSync(path, 0o755);
  return path;
}

export function readHelmCalls(stubPath) {
  const calls = `${stubPath}.calls`;
  return existsSync(calls) ? readFileSync(calls, 'utf8').split('\n').filter(Boolean) : [];
}
