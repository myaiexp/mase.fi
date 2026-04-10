// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

beforeAll(async () => {
  await import('./dropdown.js');
});

function createDropdown({ items = [], triggerText = 'Open' } = {}) {
  const el = document.createElement('base-dropdown');

  const trigger = document.createElement('button');
  trigger.setAttribute('slot', 'trigger');
  trigger.textContent = triggerText;
  el.appendChild(trigger);

  for (const item of items) {
    if (item === 'divider') {
      el.appendChild(document.createElement('base-dropdown-divider'));
    } else {
      const i = document.createElement('base-dropdown-item');
      i.setAttribute('value', item.value);
      if (item.variant) i.setAttribute('variant', item.variant);
      if (item.disabled) i.setAttribute('disabled', '');
      i.textContent = item.label ?? item.value;
      el.appendChild(i);
    }
  }

  document.body.appendChild(el);
  return el;
}

function getTrigger(el) {
  return el.querySelector('[slot="trigger"]');
}

describe('base-dropdown', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('menu is hidden by default', () => {
    const el = createDropdown({ items: [{ value: 'a', label: 'A' }] });
    expect(el.isOpen).toBe(false);
    const menu = el.shadowRoot.querySelector('[part="menu"]');
    expect(menu.hidden).toBe(true);
  });

  it('trigger click opens the menu', () => {
    const el = createDropdown({ items: [{ value: 'a', label: 'A' }] });
    getTrigger(el).click();
    expect(el.isOpen).toBe(true);
    const menu = el.shadowRoot.querySelector('[part="menu"]');
    expect(menu.hidden).toBe(false);
  });

  it('clicking an item fires select event with correct value', () => {
    const el = createDropdown({ items: [{ value: 'foo', label: 'Foo' }] });
    getTrigger(el).click();

    const received = [];
    el.addEventListener('select', (e) => received.push(e.detail));

    const item = el.querySelector('base-dropdown-item');
    item.click();

    expect(received).toHaveLength(1);
    expect(received[0].value).toBe('foo');
  });

  it('clicking an item closes the menu', () => {
    const el = createDropdown({ items: [{ value: 'bar', label: 'Bar' }] });
    getTrigger(el).click();
    expect(el.isOpen).toBe(true);

    el.querySelector('base-dropdown-item').click();
    expect(el.isOpen).toBe(false);
  });

  it('click outside closes menu', () => {
    const el = createDropdown({ items: [{ value: 'x', label: 'X' }] });
    getTrigger(el).click();
    expect(el.isOpen).toBe(true);

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

  it('ArrowDown moves focus to next item', () => {
    const el = createDropdown({
      items: [
        { value: 'a', label: 'A' },
        { value: 'b', label: 'B' },
      ],
    });
    getTrigger(el).click();

    const items = [...el.querySelectorAll('base-dropdown-item')];
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

    const items = [...el.querySelectorAll('base-dropdown-item')];
    items[1].focus();
    items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items[0]);
  });

  it('Enter on focused item fires select and closes menu', () => {
    const el = createDropdown({ items: [{ value: 'enter-val', label: 'Enter' }] });
    getTrigger(el).click();

    const received = [];
    el.addEventListener('select', (e) => received.push(e.detail));

    const item = el.querySelector('base-dropdown-item');
    item.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(received).toHaveLength(1);
    expect(received[0].value).toBe('enter-val');
    expect(el.isOpen).toBe(false);
  });

  it('disabled item does not fire select event', () => {
    const el = createDropdown({ items: [{ value: 'nope', label: 'Nope', disabled: true }] });
    getTrigger(el).click();

    const received = [];
    el.addEventListener('select', (e) => received.push(e.detail));

    el.querySelector('base-dropdown-item').click();
    expect(received).toHaveLength(0);
  });

  it('disabled item stays open on click', () => {
    const el = createDropdown({ items: [{ value: 'nope', label: 'Nope', disabled: true }] });
    getTrigger(el).click();
    el.querySelector('base-dropdown-item').click();
    expect(el.isOpen).toBe(true);
  });

  it('variant="danger" item has danger class on inner span', () => {
    const el = createDropdown({ items: [{ value: 'del', label: 'Delete', variant: 'danger' }] });
    const item = el.querySelector('base-dropdown-item');
    expect(item.getAttribute('variant')).toBe('danger');
    const span = item.shadowRoot.querySelector('span');
    expect(span.classList.contains('danger')).toBe(true);
  });

  it('adds flip class when menu would overflow viewport bottom', () => {
    const el = createDropdown({ items: [{ value: 'x', label: 'X' }] });

    el.getBoundingClientRect = () => ({
      top: 900, bottom: 940, left: 0, right: 100, width: 100, height: 40,
    });

    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    getTrigger(el).click();
    const menu = el.shadowRoot.querySelector('[part="menu"]');
    expect(menu.classList.contains('flip')).toBe(true);

    delete el.getBoundingClientRect;
  });

  it('no flip class when menu fits below trigger', () => {
    const el = createDropdown({ items: [{ value: 'x', label: 'X' }] });

    el.getBoundingClientRect = () => ({
      top: 100, bottom: 140, left: 0, right: 100, width: 100, height: 40,
    });

    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    getTrigger(el).click();
    const menu = el.shadowRoot.querySelector('[part="menu"]');
    expect(menu.classList.contains('flip')).toBe(false);

    delete el.getBoundingClientRect;
  });

  it('divider renders a separator element', () => {
    const el = createDropdown({
      items: [{ value: 'a', label: 'A' }, 'divider', { value: 'b', label: 'B' }],
    });

    const divider = el.querySelector('base-dropdown-divider');
    expect(divider).toBeTruthy();
    const hr = divider.shadowRoot.querySelector('hr');
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
