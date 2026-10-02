// Unit tests for the pure text-fit-layout algorithms: justifyLines, truncate, wrapOptimal.
import { describe, it, expect, beforeAll, vi } from 'vitest';

const DEFAULT_FONT = '13px monospace';

// Canvas mock MUST be installed before pretext initializes.
// Pretext caches the canvas context as a module-level singleton on first use.
let justifyLines, truncate, wrapOptimal, prepareWithSegments;
beforeAll(async () => {
  const mockCtx = {
    measureText: (text) => ({ width: text.length * 8 }), // 8px per char (monospace sim)
    font: '',
  };
  vi.stubGlobal('OffscreenCanvas', class {
    getContext() { return mockCtx; }
  });
  ({ justifyLines, truncate, wrapOptimal } = await import('./text-fit-layout.js'));
  ({ prepareWithSegments } = await import('@chenglou/pretext'));
});

function prep(text) {
  const result = prepareWithSegments(text, DEFAULT_FONT);
  result._font = DEFAULT_FONT;
  return result;
}

describe('justifyLines', () => {
  it('returns empty for empty text', () => {
    const result = justifyLines(prep(''), 200, 0);
    expect(result).toEqual([]);
  });

  it('returns lines with wordSpacing for non-last lines', () => {
    // ~50 chars at 8px/char = 400px, maxWidth 200 -> 2+ lines
    const result = justifyLines(prep('one two three four five six seven eight nine ten eleven twelve'), 200, 0);
    expect(result.length).toBeGreaterThan(1);
    // First line should have wordSpacing
    if (result.length > 1) {
      expect(result[0].wordSpacing).toBeDefined();
      expect(result[0].wordSpacing).toBeGreaterThan(0);
    }
    // Last line should NOT have wordSpacing
    expect(result[result.length - 1].wordSpacing).toBeUndefined();
  });

  it('handles single-word lines without wordSpacing', () => {
    // A line with just one word has no spaces to distribute
    const result = justifyLines(prep('Supercalifragilisticexpialidocious is a long word'), 200, 0);
    // Any line with 0 spaces should not have wordSpacing
    for (const line of result) {
      const spaceCount = (line.text.match(/ /g) || []).length;
      if (spaceCount === 0) {
        expect(line.wordSpacing).toBeUndefined();
      }
    }
  });
});

describe('truncate', () => {
  it('returns full text when it fits', () => {
    const prepared = prep('Hello');
    // 5 chars * 8px = 40px, maxWidth 200 -> fits
    const result = truncate(prepared, 200, 1);
    expect(result).toBe('Hello');
  });

  it('truncates and adds ellipsis when text overflows', () => {
    const prepared = prep('A'.repeat(50));
    // 50 chars * 8px = 400px > 200px
    const result = truncate(prepared, 200, 1);
    expect(result).toContain('\u2026');
    expect(result.length).toBeLessThan(50);
  });

  it('handles empty text', () => {
    const prepared = prep('');
    const result = truncate(prepared, 200, 1);
    expect(result).toBe('');
  });
});

describe('wrapOptimal', () => {
  it('returns empty string for null prepared', () => {
    expect(wrapOptimal(null, 200, 2)).toBe('');
  });

  it('returns empty string for empty text', () => {
    expect(wrapOptimal(prep(''), 200, 2)).toBe('');
  });

  it('balances width when text fits within maxLines (no truncation)', () => {
    // 'aaa bbb ccc' = 11 chars * 8px = 88px, fits in 1 line at 200px.
    // stats.lineCount (1) <= maxLines (3) -> balanced binary-search branch.
    const result = wrapOptimal(prep('aaa bbb ccc'), 200, 3);
    expect(result).not.toContain('…');
    expect(result.split('\n').length).toBeLessThanOrEqual(3);
    for (const w of ['aaa', 'bbb', 'ccc']) expect(result).toContain(w);
  });

  it('truncates last line with ellipsis when text exceeds maxLines', () => {
    // Far more than 2 lines of text -> overflow branch, last line truncated.
    const result = wrapOptimal(prep('word '.repeat(100)), 200, 2);
    expect(result.split('\n').length).toBe(2);
    expect(result).toContain('…');
  });

  it('wraps without truncation when maxLines is 0', () => {
    // maxLines=0 -> neither balanced nor overflow branch; collect all wrapped lines.
    // 19 chars * 8px = 152px > 100px container -> must wrap to multiple lines.
    const result = wrapOptimal(prep('aaa bbb ccc ddd eee'), 100, 0);
    expect(result).not.toContain('…');
    for (const w of ['aaa', 'bbb', 'ccc', 'ddd', 'eee']) expect(result).toContain(w);
    expect(result.split('\n').length).toBeGreaterThan(1);
  });
});
