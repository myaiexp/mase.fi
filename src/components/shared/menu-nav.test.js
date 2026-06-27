import { describe, it, expect } from 'vitest';
import { wrapIndex } from './menu-nav.js';

describe('wrapIndex', () => {
  it('steps forward within bounds', () => {
    expect(wrapIndex(0, 1, 3)).toBe(1);
    expect(wrapIndex(1, 1, 3)).toBe(2);
  });

  it('steps backward within bounds', () => {
    expect(wrapIndex(2, -1, 3)).toBe(1);
    expect(wrapIndex(1, -1, 3)).toBe(0);
  });

  it('wraps from last to first when stepping forward off the end', () => {
    expect(wrapIndex(2, 1, 3)).toBe(0);
  });

  it('wraps from first to last when stepping backward off the start', () => {
    expect(wrapIndex(0, -1, 3)).toBe(2);
  });

  it('lands on the first item from the -1 sentinel stepping forward', () => {
    expect(wrapIndex(-1, 1, 3)).toBe(0);
  });

  it('lands on the last item from the -1 sentinel stepping backward', () => {
    expect(wrapIndex(-1, -1, 3)).toBe(2);
  });

  it('stays put in a single-item list', () => {
    expect(wrapIndex(0, 1, 1)).toBe(0);
    expect(wrapIndex(0, -1, 1)).toBe(0);
  });
});
