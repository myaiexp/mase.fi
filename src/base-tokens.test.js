// Structural invariants for base.css's semantic colour tokens.
//
// base.css is consumed unversioned by every project on the box, so a gap here is a gap
// everywhere at once, and neither of the two rules below is visible in a diff. The
// asymmetry rule catches a semantic colour shipped without its tint surface (consumers
// then mint color-mix locally, which is how the set drifts). The tracking rule guards
// idea #2467's conversion: a tint frozen as an rgba/hex literal silently ignores a
// [data-theme] or per-project override of the colour it is supposed to tint.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const css = readFileSync(fileURLToPath(new URL('./base.css', import.meta.url)), 'utf8');

/** Every `--name: value;` declaration in the file, last-wins like the cascade. */
function declarations(source) {
  const out = new Map();
  for (const m of source.matchAll(/^\s*(--[a-z0-9-]+)\s*:\s*([^;]+);/gim)) {
    out.set(m[1], m[2].trim());
  }
  return out;
}

const decls = declarations(css);

// The palette the design system documents as "semantic colors".
const SEMANTIC = ['green', 'red', 'blue', 'cyan', 'orange', 'purple'];

describe('base.css semantic colour tokens', () => {
  it('defines every semantic colour the design system documents', () => {
    for (const name of SEMANTIC) {
      expect(decls.has(`--${name}`), `--${name} is missing`).toBe(true);
    }
  });

  it('gives every semantic colour a matching tint surface', () => {
    const missing = SEMANTIC.filter((name) => !decls.has(`--${name}-bg`));
    expect(missing, `semantic colours with no --*-bg tint: ${missing.join(', ')}`).toEqual([]);
  });

  // A tint must color-mix the colour var so re-theming reaches it. `rgba(34,197,94,.15)`
  // and `color-mix(in srgb, var(--green) 15%, transparent)` render identically on the
  // default palette and diverge the moment --green is overridden — which is exactly the
  // case a colour-literal diff review cannot see.
  it('derives every tint from its colour var rather than freezing a literal', () => {
    const tints = [...decls].filter(([name]) => /^--([a-z]+)-(bg|glow)$/.test(name));
    expect(tints.length).toBeGreaterThan(0); // guard against the regex silently matching nothing

    for (const [name, value] of tints) {
      const base = name.replace(/-(bg|glow)$/, '');
      expect(value, `${name} must color-mix ${base}, got: ${value}`).toContain(`var(${base})`);
    }
  });
});
