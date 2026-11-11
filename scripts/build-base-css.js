// Inline src/base.css's @import partials into the single published dist/base.css
//
// src/base.css is an ordered @import index of src/base/*.css so the design system can be
// edited in files under the 300-line cap, while local consumers (the design-card
// prototypes, helm's design server) still link the one file and let the browser follow
// the imports. Other apps load https://mase.fi/base.css unversioned, some with an SRI
// pin, so the published sheet stays one request: every import line is replaced in place
// by its partial. Each partial opens with a one-line `/* … */` description that is
// dropped here, so the published bytes are the sheet's own and an unchanged design
// system keeps the same hash (the pins only break when the CSS itself changes).
import process from 'node:process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const IMPORT_RE = /^@import url\('\.\/base\/([a-z-]+\.css)'\);$/;
const HEADER_RE = /^\/\*.*\*\/$/;

/**
 * The published sheet for the index at `indexPath`.
 * Throws on any import line that is not a sibling `./base/<name>.css` partial and on a
 * partial without its one-line header, so a malformed index never ships half-inlined.
 * @param {string} indexPath
 * @returns {string}
 */
export function inlineBaseCss(indexPath) {
  const dir = dirname(indexPath);
  const out = [];
  for (const line of readFileSync(indexPath, 'utf8').split(/(?<=\n)/)) {
    const trimmed = line.trimEnd();
    if (!trimmed.startsWith('@import')) {
      out.push(line);
      continue;
    }
    const m = IMPORT_RE.exec(trimmed);
    if (!m) throw new Error(`build-base-css: unsupported import in ${indexPath}: ${trimmed}`);
    const partialPath = join(dir, 'base', m[1]);
    const partial = readFileSync(partialPath, 'utf8');
    const nl = partial.indexOf('\n');
    if (nl < 0 || !HEADER_RE.test(partial.slice(0, nl))) {
      throw new Error(`build-base-css: ${partialPath} must open with a one-line /* … */ description`);
    }
    out.push(partial.slice(nl + 1));
  }
  return out.join('');
}

// CLI: node scripts/build-base-css.js <out-path>
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const outPath = process.argv[2];
  if (!outPath) {
    console.error('usage: node scripts/build-base-css.js <out-path>');
    process.exit(2);
  }
  const indexPath = fileURLToPath(new URL('../src/base.css', import.meta.url));
  writeFileSync(outPath, inlineBaseCss(indexPath));
}
