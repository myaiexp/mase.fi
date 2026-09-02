// Guard: every getElementById / $() id in src/*.js exists in the matching HTML.
// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const SRC = dirname(fileURLToPath(import.meta.url));
const ROOT = join(SRC, '..');

// getElementById('x') / $('x') — the two lookup forms production modules use.
const LOOKUP_RE = /(?:getElementById|\$)\(\s*['"]([^'"]+)['"]\s*\)/g;
// IDs the same file assigns (injected <style>, etc.) are not HTML contract.
const CREATED_RE = /\.id\s*=\s*['"]([^'"]+)['"]/g;

function referencedIds(filename) {
  const source = readFileSync(join(SRC, filename), 'utf8');
  const created = new Set([...source.matchAll(CREATED_RE)].map((m) => m[1]));
  const ids = new Set();
  for (const m of source.matchAll(LOOKUP_RE)) {
    if (!created.has(m[1])) ids.add(m[1]);
  }
  return ids;
}

function htmlIds(filename) {
  const html = readFileSync(join(ROOT, filename), 'utf8');
  const doc = new JSDOM(html).window.document;
  return new Set([...doc.querySelectorAll('[id]')].map((el) => el.id));
}

function homepageModules() {
  return readdirSync(SRC).filter(
    (f) => f.endsWith('.js') && !f.endsWith('.test.js') && f !== 'notfound-page.js',
  );
}

function missing(required, present) {
  return [...required].filter((id) => !present.has(id)).sort();
}

describe('DOM contract', () => {
  it('every homepage getElementById id exists in index.html', () => {
    const required = new Set();
    for (const file of homepageModules()) {
      for (const id of referencedIds(file)) required.add(id);
    }
    // Vacuous pass guard: a broken regex would collect nothing and succeed.
    expect([...required].length).toBeGreaterThanOrEqual(19);
    expect(missing(required, htmlIds('index.html'))).toEqual([]);
  });

  it('every notfound-page.js $()/getElementById id exists in 404.html', () => {
    const required = referencedIds('notfound-page.js');
    expect([...required].length).toBeGreaterThanOrEqual(18);
    expect(missing(required, htmlIds('404.html'))).toEqual([]);
  });
});
