// Keeps base.css's two accent outlines — the focus ring and the .flagged edge — apart.
//
// Both are --accent outlines and differ only in width and side. If they ever converge
// (focus shrinks to 1px, or the flag grows), every app loses the ability to tell "this
// has keyboard focus" from "this is flagged", and nothing in a CSS diff says so.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('./base.css', import.meta.url)), 'utf8');

/** The declaration block of the first rule whose selector list is exactly `selector`. */
function block(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
  expect(m, `no rule for ${selector}`).toBeTruthy();
  return m[1];
}

function token(name) {
  const m = css.match(new RegExp(`${name}\\s*:\\s*(\\d+)px\\s*;`));
  expect(m, `${name} must be declared in px`).toBeTruthy();
  return Number(m[1]);
}

describe('base.css accent outlines', () => {
  it('keeps the focus ring wider than the flag edge', () => {
    expect(token('--ring-focus')).toBeGreaterThan(token('--ring-flag'));
  });

  it('draws focus from --ring-focus, outside the edge', () => {
    const focus = block(':focus-visible');
    expect(focus).toMatch(/outline:\s*var\(--ring-focus\)\s+solid\s+var\(--accent\)/);
    expect(focus).toMatch(/outline-offset:\s*1px/);
  });

  it('draws .flagged from --ring-flag, inset by its own width', () => {
    const flagged = block('.flagged');
    expect(flagged).toMatch(/outline:\s*var\(--ring-flag\)\s+solid\s+var\(--accent\)/);
    expect(flagged).toMatch(/outline-offset:\s*calc\(-1\s*\*\s*var\(--ring-flag\)\)/);
  });

  // .flagged and :focus-visible share specificity and .flagged comes later, so without
  // this rule a focused flagged element would show the flag, not the focus ring.
  it('restores the focus ring on a focused flagged element', () => {
    const both = block('.flagged:focus-visible');
    expect(both).toMatch(/outline-width:\s*var\(--ring-focus\)/);
    expect(both).toMatch(/outline-offset:\s*1px/);
    expect(css.indexOf('.flagged:focus-visible')).toBeGreaterThan(css.indexOf('\n.flagged {'));
  });
});
