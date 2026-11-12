// @vitest-environment jsdom
// base-context-menu click, keyboard, close triggers and listener cleanup
import { describe, it, expect, vi } from 'vitest';
import {
  installMenuHooks,
  createMenu,
  menuOf,
  inShadow,
  makeZone,
  makeSampleItems,
  fireContextMenu,
} from './context-menu-test-helpers.js';

describe('base-context-menu interaction', () => {
  installMenuHooks();

  // 14. Clicking an item calls its action and closes menu
  it('clicking an item calls its action and closes menu', () => {
    const cm = createMenu();
    const action = vi.fn();
    cm.show(100, 100, [{ label: 'Do it', action }]);

    const menu = menuOf(cm);
    const item = /** @type {HTMLElement} */ (menu.querySelector('.item'));
    item.click();

    expect(action).toHaveBeenCalled();
    expect(cm.isOpen).toBe(false);
  });

  // 15. Clicking a disabled item does nothing
  it('clicking a disabled item does nothing', () => {
    const cm = createMenu();
    const action = vi.fn();
    cm.show(100, 100, [{ label: 'Nope', action, disabled: true }]);

    const menu = menuOf(cm);
    const item = /** @type {HTMLElement} */ (menu.querySelector('.item'));
    item.click();

    expect(action).not.toHaveBeenCalled();
    expect(cm.isOpen).toBe(true);
  });

  // 16. Clicking a separator does nothing
  it('clicking a separator does nothing', () => {
    const cm = createMenu();
    cm.show(100, 100, makeSampleItems());

    const menu = menuOf(cm);
    const hr = /** @type {HTMLElement} */ (menu.querySelector('hr'));
    hr.click();

    expect(cm.isOpen).toBe(true);
  });

  // 17. ArrowDown moves highlight to next non-separator non-disabled item
  it('ArrowDown moves highlight to next non-separator non-disabled item', () => {
    const cm = createMenu();
    cm.show(100, 100, [
      { label: 'A', action: () => {} },
      { separator: true },
      { label: 'B', action: () => {}, disabled: true },
      { label: 'C', action: () => {} },
    ]);

    // First ArrowDown: highlight A (index 0)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    let highlighted = inShadow(cm, '.item.highlighted');
    expect(highlighted.textContent).toBe('A');

    // Second ArrowDown: skip separator and disabled, highlight C (index 3)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    highlighted = inShadow(cm, '.item.highlighted');
    expect(highlighted.textContent).toBe('C');
  });

  // 18. ArrowUp moves highlight to previous non-separator non-disabled item
  it('ArrowUp moves highlight to previous non-separator non-disabled item', () => {
    const cm = createMenu();
    cm.show(100, 100, [
      { label: 'A', action: () => {} },
      { separator: true },
      { label: 'B', action: () => {}, disabled: true },
      { label: 'C', action: () => {} },
    ]);

    // ArrowUp from -1 wraps to end: highlight C (index 3)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    let highlighted = inShadow(cm, '.item.highlighted');
    expect(highlighted.textContent).toBe('C');

    // Another ArrowUp: skip disabled and separator, highlight A (index 0)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    highlighted = inShadow(cm, '.item.highlighted');
    expect(highlighted.textContent).toBe('A');
  });

  // nextEnabledIndex stops after one lap; a loop without that bound never
  // returns here and the key press hangs the page.
  it.each(['ArrowDown', 'ArrowUp'])('%s highlights nothing when every item is disabled or a separator', (key) => {
    const cm = createMenu();
    const action = vi.fn();
    cm.show(100, 100, [
      { label: 'A', action, disabled: true },
      { separator: true },
      { label: 'B', action, disabled: true },
    ]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    expect(/** @type {ShadowRoot} */ (cm.shadowRoot).querySelector('.item.highlighted')).toBeNull();

    // With no highlight, Enter has nothing to run and the menu stays up.
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(action).not.toHaveBeenCalled();
    expect(cm.isOpen).toBe(true);
  });

  // 19. Enter on highlighted item calls action and closes
  it('Enter on highlighted item calls action and closes', () => {
    const cm = createMenu();
    const action = vi.fn();
    cm.show(100, 100, [{ label: 'Go', action }]);

    // Highlight first item
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    // Enter
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(action).toHaveBeenCalled();
    expect(cm.isOpen).toBe(false);
  });

  // 20. Escape closes the menu
  it('Escape closes the menu', () => {
    const cm = createMenu();
    cm.show(100, 100, [{ label: 'A', action: () => {} }]);
    expect(cm.isOpen).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cm.isOpen).toBe(false);
  });

  // 21. Click outside closes the menu
  it('click outside closes the menu', async () => {
    const cm = createMenu();
    cm.show(100, 100, [{ label: 'A', action: () => {} }]);
    expect(cm.isOpen).toBe(true);

    await Promise.resolve(); // outside-click listener attaches on the next microtask
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(cm.isOpen).toBe(false);
  });

  // 22. Scroll closes the menu
  it('scroll closes the menu', () => {
    const cm = createMenu();
    cm.show(100, 100, [{ label: 'A', action: () => {} }]);
    expect(cm.isOpen).toBe(true);

    window.dispatchEvent(new Event('scroll'));
    expect(cm.isOpen).toBe(false);
  });

  // 23. Window blur closes the menu
  it('window blur closes the menu', () => {
    const cm = createMenu();
    cm.show(100, 100, [{ label: 'A', action: () => {} }]);
    expect(cm.isOpen).toBe(true);

    window.dispatchEvent(new Event('blur'));
    expect(cm.isOpen).toBe(false);
  });

  // 24. Another contextmenu event closes the current menu
  it('another contextmenu event closes the current menu', () => {
    const cm = createMenu();
    cm.register('zone', {
      selector: '.zone',
      items: () => [{ label: 'A', action: () => {} }],
    });

    const zone = makeZone();

    fireContextMenu(zone);
    expect(cm.isOpen).toBe(true);

    // Fire another contextmenu — should close first and reopen
    fireContextMenu(zone);
    expect(cm.isOpen).toBe(true);

    // Verify the menu was rebuilt (close was called internally)
    const menu = menuOf(cm);
    expect(menu.querySelectorAll('.item').length).toBe(1);
  });

  // 25. disconnectedCallback removes document contextmenu listener
  it('disconnectedCallback removes document contextmenu listener', () => {
    const cm = createMenu();
    const items = vi.fn(() => [{ label: 'A', action: () => {} }]);
    cm.register('test', { selector: '.zone', items });

    const zone = makeZone();

    cm.remove();

    items.mockClear();
    fireContextMenu(zone);
    expect(items).not.toHaveBeenCalled();
  });

  // 26. close() removes all document listeners
  it('close() removes all document listeners', () => {
    const cm = createMenu();
    cm.show(100, 100, [{ label: 'A', action: () => {} }]);
    cm.close();

    // Escape should not cause errors or re-close
    expect(cm.isOpen).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(cm.isOpen).toBe(false);

    // Scroll should not cause errors
    window.dispatchEvent(new Event('scroll'));
    expect(cm.isOpen).toBe(false);
  });
});
