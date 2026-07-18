// Golden-file tests for mase-fi-projects: the showcase merge (map/unique_by/
// sort_by + extra-file overlay) and the leave-.projects-unchanged safety valves
// (API down, non-array reply, zero projects, malformed target).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { writeFileSync, readFileSync } from 'node:fs';
import { makeTempDir, cleanup, writeJson, readJson, runScript } from './test-helpers.js';

let dir, file, apiFile, extraFile;

// Point SHOWCASE_API at a local fixture via file:// (curl reads it directly),
// so the merge runs with no live helm API.
const setApi = (value) => {
  writeFileSync(apiFile, typeof value === 'string' ? value : JSON.stringify(value));
  return `file://${apiFile}`;
};
const setExtra = (arr) => {
  writeFileSync(extraFile, JSON.stringify(arr));
  return extraFile;
};
const run = (env = {}) => runScript('mase-fi-projects', [], { UPDATES_FILE: file, ...env });

beforeEach(() => {
  dir = makeTempDir();
  file = join(dir, 'updates.json');
  apiFile = join(dir, 'showcase.json');
  extraFile = join(dir, 'extra.json');
  writeJson(file, { entries: [{ date: '2026-01-01', project: 'x', text: 'keep', category: 'log' }], projects: [] });
});
afterEach(() => cleanup(dir));

describe('mase-fi-projects — showcase merge', () => {
  it('maps API records to {name,slug,channel,url,desc} with channel = slug', () => {
    const SHOWCASE_API = setApi([{ name: 'Explorer', slug: 'explorer', url: 'https://mase.fi/explorer', tagline: 'file browser' }]);
    const r = run({ SHOWCASE_API, SHOWCASE_EXTRA: setExtra([]) });
    expect(r.status).toBe(0);
    expect(readJson(file).projects).toEqual([
      { name: 'Explorer', slug: 'explorer', channel: 'explorer', url: 'https://mase.fi/explorer', desc: 'file browser' },
    ]);
  });

  it('falls back slug → ascii_downcase(name) and desc → "" when absent', () => {
    const SHOWCASE_API = setApi([{ name: 'MixedCase', url: 'https://mase.fi/mixedcase' }]);
    run({ SHOWCASE_API, SHOWCASE_EXTRA: setExtra([]) });
    expect(readJson(file).projects[0]).toMatchObject({ slug: 'mixedcase', channel: 'mixedcase', desc: '' });
  });

  it('overlays the SHOWCASE_EXTRA entries on top of the API list', () => {
    const SHOWCASE_API = setApi([{ name: 'A', slug: 'aaa', url: 'https://a', tagline: 'a' }]);
    const SHOWCASE_EXTRA = setExtra([{ name: 'Porssi', slug: 'spot-price', channel: 'porssi', url: 'https://p', desc: 'spot' }]);
    run({ SHOWCASE_API, SHOWCASE_EXTRA });
    const channels = readJson(file).projects.map((p) => p.channel);
    expect(channels).toEqual(['aaa', 'porssi']); // sorted, both present
  });

  it('dedupes a channel collision (unique_by), the API entry winning over extra', () => {
    const SHOWCASE_API = setApi([{ name: 'FromApi', slug: 'dup', url: 'https://api', tagline: 'api one' }]);
    const SHOWCASE_EXTRA = setExtra([{ name: 'FromExtra', slug: 'dup', channel: 'dup', url: 'https://extra', desc: 'extra one' }]);
    run({ SHOWCASE_API, SHOWCASE_EXTRA });
    const dup = readJson(file).projects.filter((p) => p.channel === 'dup');
    expect(dup).toHaveLength(1);
    expect(dup[0].name).toBe('FromApi');
  });

  it('sorts the merged projects by channel', () => {
    const SHOWCASE_API = setApi([
      { name: 'Zed', slug: 'zed', url: 'https://z', tagline: '' },
      { name: 'Alpha', slug: 'alpha', url: 'https://a', tagline: '' },
      { name: 'Mid', slug: 'mid', url: 'https://m', tagline: '' },
    ]);
    run({ SHOWCASE_API, SHOWCASE_EXTRA: setExtra([]) });
    expect(readJson(file).projects.map((p) => p.channel)).toEqual(['alpha', 'mid', 'zed']);
  });

  it('rewrites only .projects, leaving .entries untouched', () => {
    const SHOWCASE_API = setApi([{ name: 'A', slug: 'a', url: 'https://a', tagline: '' }]);
    run({ SHOWCASE_API, SHOWCASE_EXTRA: setExtra([]) });
    expect(readJson(file).entries).toEqual([{ date: '2026-01-01', project: 'x', text: 'keep', category: 'log' }]);
  });
});

describe('mase-fi-projects — leave-unchanged safety valves', () => {
  const snapshot = () => readFileSync(file, 'utf8');

  it('leaves .projects unchanged when the API is unreachable', () => {
    const before = snapshot();
    const r = run({ SHOWCASE_API: 'http://127.0.0.1:1/nope', SHOWCASE_EXTRA: setExtra([]) });
    expect(r.status).toBe(0);
    expect(snapshot()).toBe(before);
  });

  it('leaves .projects unchanged when the API returns a non-array', () => {
    const before = snapshot();
    const SHOWCASE_API = setApi('{"error":"nope"}');
    const r = run({ SHOWCASE_API, SHOWCASE_EXTRA: setExtra([]) });
    expect(r.status).toBe(0);
    expect(snapshot()).toBe(before);
  });

  it('leaves .projects unchanged when zero projects are showcased', () => {
    const before = snapshot();
    const SHOWCASE_API = setApi([]);
    const r = run({ SHOWCASE_API, SHOWCASE_EXTRA: setExtra([]) });
    expect(r.status).toBe(0);
    expect(snapshot()).toBe(before);
  });

  it('refuses to rewrite a malformed updates.json and leaves it intact', () => {
    writeFileSync(file, '{ broken json ');
    const before = snapshot();
    const SHOWCASE_API = setApi([{ name: 'A', slug: 'a', url: 'https://a', tagline: '' }]);
    const r = run({ SHOWCASE_API, SHOWCASE_EXTRA: setExtra([]) });
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/malformed JSON/i);
    expect(snapshot()).toBe(before);
  });
});
