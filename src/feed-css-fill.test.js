// Feed-row animations must not hold their end state, or they override search dimming.
//
// An animation filling forwards keeps applying its last keyframe after it ends, and
// animated values beat normal declarations — so `.feed-row.search-dim { opacity }`
// loses on every row that played a forwards-filling animation. jsdom runs no
// animations, so this pins the CSS text instead.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('./styles/feed.css', import.meta.url)), 'utf8');

/** Every [selector, declarations] pair in a flat (non-nested) stylesheet. */
function rules(text) {
  const out = [];
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) out.push([m[1].trim(), m[2]]);
  return out;
}

describe('feed.css row animations', () => {
  it('never fill forwards on a .feed-row rule', () => {
    const offenders = rules(css)
      .filter(([sel, body]) => /\.feed-row\b/.test(sel) && /animation\s*:/.test(body))
      .filter(([sel]) => !/::?(after|before)\b/.test(sel))
      .filter(([, body]) => /animation\s*:[^;]*\b(forwards|both)\b/.test(body))
      .map(([sel]) => sel);
    expect(offenders).toEqual([]);
  });

  it('still animates arriving rows', () => {
    const arriving = rules(css).find(([sel]) => sel === '.feed-row.arriving');
    expect(arriving?.[1]).toMatch(/animation\s*:\s*rowArrive\b/);
  });
});
