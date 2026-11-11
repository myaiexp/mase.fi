// Tests for build-base-css: in-place import inlining, header drop, and the malformed-index refusals
import { describe, it, expect, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inlineBaseCss } from './build-base-css.js';
import { makeTempDir, cleanup } from './test-helpers.js';

/** @type {string[]} */
const dirs = [];
afterEach(() => { for (const d of dirs.splice(0)) cleanup(d); });

/**
 * A throwaway index + partials tree; returns the index path.
 * @param {string} index
 * @param {Record<string, string>} partials
 */
function tree(index, partials) {
  const dir = makeTempDir();
  dirs.push(dir);
  mkdirSync(join(dir, 'base'));
  for (const [name, body] of Object.entries(partials)) writeFileSync(join(dir, 'base', name), body);
  writeFileSync(join(dir, 'base.css'), index);
  return join(dir, 'base.css');
}

describe('inlineBaseCss', () => {
  it('replaces each import line in place and drops each partial header', () => {
    const index = tree(
      "/* head */\n\n@import url('./base/a.css');\n@import url('./base/b.css');\n",
      { 'a.css': '/* partial a */\n.a{}\n\n', 'b.css': '/* partial b */\n.b{}\n' },
    );
    expect(inlineBaseCss(index)).toBe('/* head */\n\n.a{}\n\n.b{}\n');
  });

  it('refuses an import that is not a ./base/ partial', () => {
    const index = tree("@import url('https://evil.example/x.css');\n", {});
    expect(() => inlineBaseCss(index)).toThrow(/unsupported import/);
  });

  it('refuses a partial with no one-line header comment', () => {
    const index = tree("@import url('./base/a.css');\n", { 'a.css': '.a{}\n' });
    expect(() => inlineBaseCss(index)).toThrow(/must open with a one-line/);
  });

  it('inlines the real index into a sheet with no imports, using every partial once', () => {
    const indexPath = fileURLToPath(new URL('../src/base.css', import.meta.url));
    const out = inlineBaseCss(indexPath);
    expect(out).not.toMatch(/@import/);
    const partials = readdirSync(fileURLToPath(new URL('../src/base/', import.meta.url)));
    const imported = [...readFileSync(indexPath, 'utf8').matchAll(/\.\/base\/([a-z-]+\.css)/g)].map((m) => m[1]);
    expect(imported.slice().sort()).toEqual(partials.slice().sort());
  });
});
