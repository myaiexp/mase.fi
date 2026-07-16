// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { MENU_HEIGHT_ESTIMATE, applyMenuFlip } from './menu-flip.js';

// Build a fake trigger host whose getBoundingClientRect yields a given `bottom`,
// plus a real menu element we can inspect for the `flip` class.
function makeFlipPair(bottom) {
  const host = { getBoundingClientRect: () => ({ bottom }) };
  const menu = document.createElement('div');
  return { host, menu };
}

afterEach(() => {
  document.body.textContent = '';
});

describe('menu-flip', () => {
  // --- Shared constant ---
  // This value is the single source of truth consumed by <base-select> and
  // <base-dropdown>. Mutating it to anything but 200 must turn this RED (and,
  // via the boundary-sensitive consumer tests, both component flip tests too).
  it('exports MENU_HEIGHT_ESTIMATE as 200', () => {
    expect(MENU_HEIGHT_ESTIMATE).toBe(200);
  });

  // --- applyMenuFlip ---

  it('adds the flip class when space below is less than the estimate', () => {
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    // bottom 940 -> spaceBelow = 768 - 940 = -172 < 200
    const { host, menu } = makeFlipPair(940);
    applyMenuFlip(host, menu);
    expect(menu.classList.contains('flip')).toBe(true);
  });

  it('omits the flip class when space below meets the estimate', () => {
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    // bottom 518 -> spaceBelow = 768 - 518 = 250 >= 200
    const { host, menu } = makeFlipPair(518);
    applyMenuFlip(host, menu);
    expect(menu.classList.contains('flip')).toBe(false);
  });

  it('flips exactly at the estimate boundary (spaceBelow < estimate, not <=)', () => {
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });
    // bottom 568 -> spaceBelow = 200, which is NOT < 200 -> no flip
    const exact = makeFlipPair(768 - MENU_HEIGHT_ESTIMATE);
    applyMenuFlip(exact.host, exact.menu);
    expect(exact.menu.classList.contains('flip')).toBe(false);

    // one pixel less room -> flip
    const justUnder = makeFlipPair(768 - MENU_HEIGHT_ESTIMATE + 1);
    applyMenuFlip(justUnder.host, justUnder.menu);
    expect(justUnder.menu.classList.contains('flip')).toBe(true);
  });
});
