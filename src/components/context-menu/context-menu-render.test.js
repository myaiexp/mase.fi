// @vitest-environment jsdom
// base-context-menu rendering and viewport positioning
import { describe, it, expect } from 'vitest';
import {
  installMenuHooks,
  createMenu,
  menuOf,
  makeSampleItems,
  stubRect,
} from './context-menu-test-helpers.js';

describe('base-context-menu render', () => {
  installMenuHooks();

  // 8. show() renders items in shadow DOM and sets isOpen = true
  it('show() renders items in shadow DOM and sets isOpen = true', () => {
    const cm = createMenu();
    cm.show(100, 100, makeSampleItems());

    expect(cm.isOpen).toBe(true);
    const menu = menuOf(cm);
    expect(menu.hidden).toBe(false);

    const spans = menu.querySelectorAll('.item');
    expect(spans.length).toBe(2);
    expect(spans[0].textContent).toBe('Copy');
    expect(spans[1].textContent).toBe('Paste');
  });

  // 9. Separator items render as divider elements (<hr>)
  it('separator items render as hr dividers', () => {
    const cm = createMenu();
    cm.show(100, 100, makeSampleItems());

    const menu = menuOf(cm);
    const hrs = menu.querySelectorAll('hr');
    expect(hrs.length).toBe(1);
  });

  // 10. Disabled items render with muted styling
  it('disabled items render with disabled class', () => {
    const cm = createMenu();
    cm.show(100, 100, [
      { label: 'Enabled', action: () => {} },
      { label: 'Disabled', action: () => {}, disabled: true },
    ]);

    const menu = menuOf(cm);
    const spans = menu.querySelectorAll('.item');
    expect(spans[0].classList.contains('disabled')).toBe(false);
    expect(spans[1].classList.contains('disabled')).toBe(true);
  });

  // 11. Menu positioned at clientX/clientY
  it('menu positioned at clientX/clientY', () => {
    const cm = createMenu();
    cm.show(200, 300, [{ label: 'A', action: () => {} }]);

    const menu = menuOf(cm);
    expect(menu.style.left).toBe('200px');
    expect(menu.style.top).toBe('300px');
  });

  // 12. Menu flips left when it would overflow viewport right edge
  it('menu flips left when it would overflow viewport right edge', () => {
    const cm = createMenu();
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });

    const menu = menuOf(cm);
    const origGetRect = menu.getBoundingClientRect.bind(menu);
    stubRect(menu, {
      left: 750, right: 900, top: 100, bottom: 130, width: 150, height: 30,
    });

    cm.show(750, 100, [{ label: 'A', action: () => {} }]);

    // The left should be adjusted: 750 - 150 = 600
    expect(menu.style.left).toBe('600px');

    menu.getBoundingClientRect = origGetRect;
  });

  // 13. Menu flips up when it would overflow viewport bottom edge
  it('menu flips up when it would overflow viewport bottom edge', () => {
    const cm = createMenu();
    Object.defineProperty(window, 'innerHeight', { value: 600, configurable: true });

    const menu = menuOf(cm);
    const origGetRect = menu.getBoundingClientRect.bind(menu);
    stubRect(menu, {
      left: 100, right: 250, top: 580, bottom: 650, width: 150, height: 70,
    });

    cm.show(100, 580, [{ label: 'A', action: () => {} }]);

    // The top should be adjusted: 580 - 70 = 510
    expect(menu.style.top).toBe('510px');

    menu.getBoundingClientRect = origGetRect;
  });

  // A flip on a narrow viewport lands past the near edge (x < width, and
  // x + width still overflows). The menu must pin to 0, not hang off negative.
  it('clamps a flipped menu that would hang off the near edge', () => {
    const cm = createMenu();
    const prevW = window.innerWidth;
    const prevH = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 100, configurable: true });

    const menu = menuOf(cm);
    stubRect(menu, {
      left: 200, right: 420, top: 40, bottom: 120, width: 220, height: 80,
    });

    cm.show(200, 40, [{ label: 'A', action: () => {} }]);

    // 200 - 220 = -20 and 40 - 80 = -40 without a second clamp.
    expect(menu.style.left).toBe('0px');
    expect(menu.style.top).toBe('0px');

    Object.defineProperty(window, 'innerWidth', { value: prevW, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: prevH, configurable: true });
  });

  // innerWidth - width is negative here. Clamping into [0, innerWidth - width]
  // with the wrong bound order yields that negative upper bound, not 0.
  it('pins a menu wider than the viewport to the left edge', () => {
    const cm = createMenu();
    const prevW = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { value: 100, configurable: true });

    const menu = menuOf(cm);
    stubRect(menu, {
      left: 50, right: 270, top: 10, bottom: 40, width: 220, height: 30,
    });

    cm.show(50, 10, [{ label: 'A', action: () => {} }]);

    expect(menu.style.left).toBe('0px');

    Object.defineProperty(window, 'innerWidth', { value: prevW, configurable: true });
  });
});
