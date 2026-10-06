import { describe, it, expect } from 'vitest';
import { wrapIndex, nextEnabledIndex } from './menu-nav.js';

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

describe('nextEnabledIndex', () => {
  const disabledAt = (...idxs) => (i) => idxs.includes(i);

  it('returns the adjacent index when it is enabled', () => {
    expect(nextEnabledIndex(0, 1, 3, disabledAt())).toBe(1);
    expect(nextEnabledIndex(2, -1, 3, disabledAt())).toBe(1);
  });

  it('skips disabled indexes, wrapping past either end', () => {
    expect(nextEnabledIndex(0, 1, 4, disabledAt(1, 2))).toBe(3);
    expect(nextEnabledIndex(3, 1, 4, disabledAt(0))).toBe(1);
    expect(nextEnabledIndex(0, -1, 4, disabledAt(3, 2))).toBe(1);
  });

  it('comes back to the current index when it is the only enabled one', () => {
    expect(nextEnabledIndex(1, 1, 3, disabledAt(0, 2))).toBe(1);
    expect(nextEnabledIndex(1, -1, 3, disabledAt(0, 2))).toBe(1);
  });

  // The single-lap bound: without it an all-disabled list never returns, and the
  // Arrow key that asked hangs the page.
  it('returns -1 after one lap of an all-disabled list, in both directions', () => {
    const probe = (direction, start) => {
      const seen = [];
      const idx = nextEnabledIndex(start, direction, 3, (i) => { seen.push(i); return true; });
      return { idx, seen };
    };
    expect(probe(1, 0)).toEqual({ idx: -1, seen: [1, 2, 0] });
    expect(probe(-1, 0)).toEqual({ idx: -1, seen: [2, 1, 0] });
    expect(probe(1, -1)).toEqual({ idx: -1, seen: [0, 1, 2] });
  });
});
