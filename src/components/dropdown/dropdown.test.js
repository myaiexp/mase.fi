// @vitest-environment jsdom
// <base-dropdown> open/close, select events, disabled items, flip and divider
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  createDropdown,
  getTrigger,
  q,
  sq,
  menuOf,
  collectSelects,
  stubRect,
  unstubRect,
} from './dropdown-test-helpers.js';

beforeAll(async () => {
  await import('./dropdown.js');
});

describe('base-dropdown', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('menu is hidden by default', () => {
    const el = createDropdown({ items: [{ value: 'a', label: 'A' }] });
    expect(el.isOpen).toBe(false);
    const menu = menuOf(el);
    expect(menu.hidden).toBe(true);
  });

  it('trigger click opens the menu', () => {
    const el = createDropdown({ items: [{ value: 'a', label: 'A' }] });
    getTrigger(el).click();
    expect(el.isOpen).toBe(true);
    const menu = menuOf(el);
    expect(menu.hidden).toBe(false);
  });

  it('clicking an item fires select event with correct value', () => {
    const el = createDropdown({ items: [{ value: 'foo', label: 'Foo' }] });
    getTrigger(el).click();

    const received = collectSelects(el);

    const item = q(el, 'base-dropdown-item');
    item.click();

    expect(received).toHaveLength(1);
    expect(received[0].value).toBe('foo');
  });

  it('clicking an item closes the menu', () => {
    const el = createDropdown({ items: [{ value: 'bar', label: 'Bar' }] });
    getTrigger(el).click();
    expect(el.isOpen).toBe(true);

    q(el, 'base-dropdown-item').click();
    expect(el.isOpen).toBe(false);
  });

  it('click outside closes menu', async () => {
    const el = createDropdown({ items: [{ value: 'x', label: 'X' }] });
    getTrigger(el).click();
    expect(el.isOpen).toBe(true);

    await Promise.resolve(); // outside-click listener attaches on the next microtask
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(el.isOpen).toBe(false);
  });

  it('Escape key closes the menu', () => {
    const el = createDropdown({ items: [{ value: 'x', label: 'X' }] });
    getTrigger(el).click();
    expect(el.isOpen).toBe(true);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(el.isOpen).toBe(false);
  });

  it('Enter on focused item fires select and closes menu', () => {
    const el = createDropdown({ items: [{ value: 'enter-val', label: 'Enter' }] });
    getTrigger(el).click();

    const received = collectSelects(el);

    const item = q(el, 'base-dropdown-item');
    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(received).toHaveLength(1);
    expect(received[0].value).toBe('enter-val');
    expect(el.isOpen).toBe(false);
  });

  it('disabled item does not fire select event', () => {
    const el = createDropdown({ items: [{ value: 'nope', label: 'Nope', disabled: true }] });
    getTrigger(el).click();

    const received = collectSelects(el);

    q(el, 'base-dropdown-item').click();
    expect(received).toHaveLength(0);
  });

  it('disabled item stays open on click', () => {
    const el = createDropdown({ items: [{ value: 'nope', label: 'Nope', disabled: true }] });
    getTrigger(el).click();
    q(el, 'base-dropdown-item').click();
    expect(el.isOpen).toBe(true);
  });

  it('variant="danger" item has danger class on inner span', () => {
    const el = createDropdown({ items: [{ value: 'del', label: 'Delete', variant: 'danger' }] });
    const item = q(el, 'base-dropdown-item');
    expect(item.getAttribute('variant')).toBe('danger');
    const span = sq(item, 'span');
    expect(span.classList.contains('danger')).toBe(true);
  });

  it('adds flip class when menu would overflow viewport bottom', () => {
    const el = createDropdown({ items: [{ value: 'x', label: 'X' }] });

    stubRect(el, {
      top: 900, bottom: 940, left: 0, right: 100, width: 100, height: 40,
    });

    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    getTrigger(el).click();
    const menu = menuOf(el);
    expect(menu.classList.contains('flip')).toBe(true);

    unstubRect(el);
  });

  it('no flip class when menu fits below trigger', () => {
    const el = createDropdown({ items: [{ value: 'x', label: 'X' }] });

    // spaceBelow = 768 - 518 = 250, just clears the 200px estimate. Boundary-
    // sensitive: bumping MENU_HEIGHT_ESTIMATE to 300 would flip this RED.
    stubRect(el, {
      top: 478, bottom: 518, left: 0, right: 100, width: 100, height: 40,
    });

    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    getTrigger(el).click();
    const menu = menuOf(el);
    expect(menu.classList.contains('flip')).toBe(false);

    unstubRect(el);
  });

  it('divider renders a separator element', () => {
    const el = createDropdown({
      items: [{ value: 'a', label: 'A' }, 'divider', { value: 'b', label: 'B' }],
    });

    const divider = q(el, 'base-dropdown-divider');
    expect(divider).toBeTruthy();
    const hr = sq(divider, 'hr');
    expect(hr).toBeTruthy();
  });

  it('open() and close() methods work programmatically', () => {
    const el = createDropdown({ items: [{ value: 'a', label: 'A' }] });
    el.open();
    expect(el.isOpen).toBe(true);
    el.close();
    expect(el.isOpen).toBe(false);
  });
});
