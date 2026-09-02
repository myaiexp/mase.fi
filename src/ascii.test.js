// Unit tests for ascii.js pure helpers (sparkbar, scramble).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { sparkbar, scramble, GLYPHS } from './ascii.js';

const BARS = '▁▂▃▄▅▆▇█'; // 8 cells, indices 0..7
const DIGITS = '0123456789ABCDEF'; // module-private in ascii.js; mirrored here for assertions

afterEach(() => {
  vi.restoreAllMocks();
});

describe('sparkbar', () => {
  it('returns empty string for an empty array', () => {
    expect(sparkbar([], 10)).toBe('');
  });

  it('maps zero to the lowest bar', () => {
    expect(sparkbar([0], 10)).toBe('▁');
  });

  it('maps value === max to the highest bar', () => {
    expect(sparkbar([10], 10)).toBe('█');
  });

  it('rounds a mid value to the nearest bar', () => {
    // (5/10)*7 = 3.5 -> Math.round -> 4 -> bars[4]
    expect(sparkbar([5], 10)).toBe(BARS[4]);
  });

  it('maps each element independently and joins them', () => {
    expect(sparkbar([0, 10], 10)).toBe('▁█');
  });

  it('clamps values above max to the highest bar', () => {
    expect(sparkbar([20], 10)).toBe('█');
  });

  it('produces a full bar when max is 0 and value is positive (Infinity clamps to 7)', () => {
    expect(sparkbar([5], 0)).toBe('█');
  });

  it('drops the cell when max is 0 and value is 0 (NaN index -> undefined)', () => {
    expect(sparkbar([0], 0)).toBe('');
  });

  it('drops negative-value cells (negative index -> undefined)', () => {
    // (-5/10)*7 = -3.5 -> Math.round -> -3 -> bars[-3] undefined -> '' on join
    expect(sparkbar([-5], 10)).toBe('');
    // negative cells vanish but valid neighbours survive
    expect(sparkbar([-5, 10], 10)).toBe('█');
  });
});

describe('scramble', () => {
  it('returns the input unchanged when p is 0', () => {
    expect(scramble('hello 123', 0)).toBe('hello 123');
  });

  it('returns empty string for empty input', () => {
    expect(scramble('', 1)).toBe('');
  });

  it('always replaces non-whitespace when p is 1 but preserves length', () => {
    const input = 'abc123';
    const out = scramble(input, 1);
    expect(out.length).toBe(input.length);
    expect(out).not.toBe(input);
  });

  it('never touches spaces or newlines', () => {
    const out = scramble('a b\nc', 1);
    expect(out[1]).toBe(' ');
    expect(out[3]).toBe('\n');
  });

  it('replaces letters from the GLYPHS pool and digits from the DIGITS pool (p=1)', () => {
    const letters = scramble('abcXYZ', 1);
    for (const ch of letters) expect(GLYPHS.includes(ch)).toBe(true);

    const digits = scramble('012789', 1);
    for (const ch of digits) expect(DIGITS.includes(ch)).toBe(true);

    // Letters and punctuation share GLYPHS — there is no distinct letter pool.
    // Digits are the only characters that pick DIGITS (finding #8829).
    const punct = scramble('!?#', 1);
    for (const ch of punct) expect(GLYPHS.includes(ch)).toBe(true);
  });

  it('uses the deterministic first pool char when Math.random is stubbed to 0', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0); // pool index floor(0*len)=0, and 0 < p replaces
    expect(scramble('ab', 0.6)).toBe(GLYPHS[0] + GLYPHS[0]); // letters -> GLYPHS[0] === '!'
    expect(scramble('12', 0.6)).toBe(DIGITS[0] + DIGITS[0]); // digits -> DIGITS[0] === '0'
    expect(scramble('?', 0.6)).toBe(GLYPHS[0]); // symbols -> GLYPHS pool
    expect(scramble('a b', 0.6)).toBe(GLYPHS[0] + ' ' + GLYPHS[0]); // space preserved
  });

  it('does not replace when stubbed Math.random equals p (0 < 0 is false)', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(scramble('abc', 0)).toBe('abc');
  });
});
