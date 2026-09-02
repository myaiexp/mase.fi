// Unit tests for command-fuzzy.js: subsequence ranking + highlight markup.
import { describe, it, expect } from 'vitest';
import { fuzzyScore, highlightFuzzy } from './command-fuzzy.js';

describe('fuzzyScore', () => {
  it('empty query short-circuits to 1 (non-throwing baseline)', () => {
    expect(fuzzyScore('anything', '')).toBe(1);
    expect(fuzzyScore('', '')).toBe(1);
  });

  it('lowercases the query so mixed-case callers match like highlightFuzzy', () => {
    // Same contract as highlightFuzzy: a future caller must not have to
    // pre-lowercase `q`. Mixed-case used to score 0 because only `str` was
    // folded (finding #8129).
    expect(fuzzyScore('home', 'HO')).toBe(fuzzyScore('home', 'ho'));
    expect(fuzzyScore('Home', 'HOME')).toBe(fuzzyScore('home', 'home'));
    expect(fuzzyScore('home', 'HO')).toBeGreaterThan(0);
  });

  it('exact match scores higher than a prefix, which beats a mid-string match', () => {
    const exact = fuzzyScore('home', 'home');
    const prefix = fuzzyScore('home', 'hom');
    const mid = fuzzyScore('home', 'ome');
    expect(exact).toBeGreaterThan(prefix);
    expect(prefix).toBeGreaterThan(mid);
  });

  it('a prefix match outscores the same query appearing mid-string', () => {
    // "or" leads "order" (prefix + startsWith bonus) but sits mid-word in "world".
    expect(fuzzyScore('order', 'or')).toBeGreaterThan(fuzzyScore('world', 'or'));
  });

  it('returns 0 when the query is not a subsequence', () => {
    expect(fuzzyScore('home', 'xyz')).toBe(0);
    // Order matters: a, c, b is not a subsequence of "abc".
    expect(fuzzyScore('abc', 'acb')).toBe(0);
  });

  it('treats query characters literally, not as a regex', () => {
    // A "." matches a literal dot...
    expect(fuzzyScore('a.b.c', '.')).toBeGreaterThan(0);
    expect(fuzzyScore('[id]', '[')).toBeGreaterThan(0);
    // ...and ".*" is NOT a wildcard: "plain" has no dot, so no match.
    expect(fuzzyScore('plain', '.*')).toBe(0);
  });

  it('orders realistic channel labels monotonically by score', () => {
    // Query "ho": "home" (prefix, +10), "shop" (h then o adjacent), "chrome"
    // (h then o, scattered). Sorting desc reproduces the autocomplete's order.
    const labels = ['chrome', 'home', 'shop'];
    const ranked = labels
      .map((l) => ({ l, s: fuzzyScore(l, 'ho') }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.l);
    expect(ranked).toEqual(['home', 'shop', 'chrome']);
  });
});

describe('highlightFuzzy', () => {
  it('wraps each matched character in a .hit span, leaving the tail plain', () => {
    expect(highlightFuzzy('explorer', 'exp')).toBe(
      '<span class="hit">e</span><span class="hit">x</span><span class="hit">p</span>lorer'
    );
  });

  it('wraps non-adjacent matches with the literal text between them intact', () => {
    expect(highlightFuzzy('explorer', 'er')).toBe(
      '<span class="hit">e</span>xplo<span class="hit">r</span>er'
    );
  });

  it('no-match returns the input unchanged (escaped, no hit spans)', () => {
    expect(highlightFuzzy('home', 'xyz')).toBe('home');
    // "unchanged" still means HTML-escaped for safe interpolation.
    expect(highlightFuzzy('a<b', 'zzz')).toBe('a&lt;b');
  });

  it('empty query returns the escaped input without throwing', () => {
    expect(highlightFuzzy('home', '')).toBe('home');
    expect(highlightFuzzy('a<b', '')).toBe('a&lt;b');
  });

  it('escapes both surrounding text and the matched character (XSS-safe)', () => {
    // Matched "a" sits between escaped angle brackets.
    expect(highlightFuzzy('<a>', 'a')).toBe('&lt;<span class="hit">a</span>&gt;');
    // A matched special character is itself escaped inside the hit span.
    expect(highlightFuzzy('a<c', '<')).toBe('a<span class="hit">&lt;</span>c');
  });
});
