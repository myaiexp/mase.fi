// @vitest-environment jsdom
// <base-dropdown> keyboard navigation: Tab close, arrow focus movement and wrapping
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  createDropdown,
  getTrigger,
  q,
  qa,
  menuOf,
} from './dropdown-test-helpers.js';

beforeAll(async () => {
  await import('./dropdown.js');
});

describe('base-dropdown keyboard', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  // Tab leaves the focused item for the next real tab stop. The menu must close
  // with it, and the key must not be swallowed or focus never moves. Shift+Tab
  // is the same key in the other direction.
  it.each([false, true])('Tab on the focused item closes the menu (shiftKey=%s)', (shiftKey) => {
    const el = createDropdown({
      items: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }],
    });
    getTrigger(el).click();
    expect(el.isOpen).toBe(true);

    const item = q(el, 'base-dropdown-item');
    expect(document.activeElement).toBe(item);
    const press = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    item.dispatchEvent(press);

    expect(el.isOpen).toBe(false);
    expect(menuOf(el).hidden).toBe(true);
    expect(press.defaultPrevented).toBe(false);
  });

  it('ArrowDown moves focus to next item', () => {
    const el = createDropdown({
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    });
    getTrigger(el).click();

    const items = qa(el, 'base-dropdown-item');
    expect(document.activeElement).toBe(items[0]);

    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);
  });

  it('ArrowUp moves focus to previous item', () => {
    const el = createDropdown({
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    });
    getTrigger(el).click();

    const items = qa(el, 'base-dropdown-item');
    items[1].focus();
    items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
  });

  it('ArrowDown wraps from the last item to the first', () => {
    const el = createDropdown({
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    });
    getTrigger(el).click();

    const items = qa(el, 'base-dropdown-item');
    items[1].focus();
    items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
  });

  it('ArrowUp wraps from the first item to the last', () => {
    const el = createDropdown({
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    });
    getTrigger(el).click();

    const items = qa(el, 'base-dropdown-item');
    expect(document.activeElement).toBe(items[0]);
    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items[1]);
  });

  it('arrow nav skips disabled items when wrapping', () => {
    const el = createDropdown({
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B', disabled: true },
        { value: 'c', label: 'C' },
      ],
    });
    getTrigger(el).click();

    const items = qa(el, 'base-dropdown-item');
    // Enabled set is [A, C] — ArrowDown from A skips the disabled B.
    items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[2]);
    // ...and wraps from C back to A rather than stopping at the end.
    items[2].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
  });
});
