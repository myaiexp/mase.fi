// Keeps base.css's search-match recipe — ::highlight(search-match) and <mark> — one look.
//
// The two forms must be separate rules: a browser that can't parse ::highlight() drops
// every selector in a list holding it, so folding them into `::highlight(...), mark`
// would silently strip <mark> styling there. They must also stay identical, or a page
// that switches forms changes colour.
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { inlineBaseCss } from '../scripts/build-base-css.js';

// The published sheet, not the @import index: the rules live in src/base/*.css.
const css = inlineBaseCss(fileURLToPath(new URL('./base.css', import.meta.url)));

/** The declaration block of the rule whose selector list is exactly `selector`. */
function block(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  expect(m, `no rule for ${selector}`).toBeTruthy();
  return m[1].trim();
}

describe('base.css search match', () => {
  it('styles ::highlight(search-match) and mark in two rules with one recipe', () => {
    const highlight = block('::highlight(search-match)');
    expect(block('mark')).toBe(highlight);
  });

  it('never puts ::highlight() in a selector list', () => {
    expect(css).not.toMatch(/::highlight\([^)]*\)\s*,|,\s*::highlight\(/);
  });

  it('tints from --accent, stronger than ::selection, with bright text', () => {
    const highlight = block('::highlight(search-match)');
    expect(highlight).toMatch(/background-color:\s*color-mix\(in srgb, var\(--accent\) 40%, transparent\)/);
    expect(highlight).toMatch(/color:\s*var\(--fg-1\)/);
    expect(block('::selection')).toMatch(/var\(--accent\) 25%/);
  });
});
