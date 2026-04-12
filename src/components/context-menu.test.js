// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';

let el;

beforeAll(async () => {
  await import('./context-menu.js');
});

function createMenu() {
  el = document.createElement('base-context-menu');
  document.body.appendChild(el);
  return el;
}

function fireContextMenu(target, x = 100, y = 100) {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  target.dispatchEvent(event);
  return event;
}

function makeSampleItems() {
  return [
    { label: 'Copy', action: vi.fn() },
    { separator: true },
    { label: 'Paste', action: vi.fn() },
  ];
}

describe('base-context-menu', () => {
  afterEach(() => {
    if (el && el.parentNode) {
      el.remove();
    }
    document.body.textContent = '';
    vi.restoreAllMocks();
  });

  // 1. register() stores zone, unregister() removes it
  it('register() stores zone, unregister() removes it', () => {
    const cm = createMenu();
    const items = vi.fn(() => [{ label: 'A', action: () => {} }]);
    cm.register('test', { selector: '.zone', items });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    fireContextMenu(zone);
    expect(items).toHaveBeenCalled();

    items.mockClear();
    cm.unregister('test');
    fireContextMenu(zone);
    expect(items).not.toHaveBeenCalled();
  });

  // 2. Registering duplicate id overwrites the previous zone
  it('registering duplicate id overwrites the previous zone', () => {
    const cm = createMenu();
    const items1 = vi.fn(() => [{ label: 'A', action: () => {} }]);
    const items2 = vi.fn(() => [{ label: 'B', action: () => {} }]);

    cm.register('dup', { selector: '.zone', items: items1 });
    cm.register('dup', { selector: '.zone', items: items2 });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    fireContextMenu(zone);
    expect(items1).not.toHaveBeenCalled();
    expect(items2).toHaveBeenCalled();
  });

  // 3. contextmenu on matching element calls items builder with matched el and selection text
  it('contextmenu on matching element calls items builder with matched el and selection', () => {
    const cm = createMenu();
    const items = vi.fn(() => [{ label: 'A', action: () => {} }]);
    cm.register('test', { selector: '.zone', items });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    // Mock getSelection
    const origGetSelection = window.getSelection;
    window.getSelection = () => ({ toString: () => 'selected text' });

    fireContextMenu(zone);
    expect(items).toHaveBeenCalledWith(zone, 'selected text');

    window.getSelection = origGetSelection;
  });

  // 4. contextmenu on non-matching element does not prevent default
  it('contextmenu on non-matching element does not prevent default', () => {
    const cm = createMenu();
    cm.register('test', {
      selector: '.zone',
      items: () => [{ label: 'A', action: () => {} }],
    });

    const other = document.createElement('div');
    other.className = 'other';
    document.body.appendChild(other);

    const event = fireContextMenu(other);
    expect(event.defaultPrevented).toBe(false);
  });

  // 5. Zones checked in registration order — first match wins
  it('zones checked in registration order — first match wins', () => {
    const cm = createMenu();
    const items1 = vi.fn(() => [{ label: 'A', action: () => {} }]);
    const items2 = vi.fn(() => [{ label: 'B', action: () => {} }]);

    cm.register('first', { selector: '.zone', items: items1 });
    cm.register('second', { selector: '.zone', items: items2 });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    fireContextMenu(zone);
    expect(items1).toHaveBeenCalled();
    expect(items2).not.toHaveBeenCalled();
  });

  // 6. Items builder returning null falls through to native menu
  it('items builder returning null falls through to native menu', () => {
    const cm = createMenu();
    cm.register('test', { selector: '.zone', items: () => null });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    const event = fireContextMenu(zone);
    expect(event.defaultPrevented).toBe(false);
    expect(cm.isOpen).toBe(false);
  });

  // 7. Items builder returning empty array falls through to native menu
  it('items builder returning empty array falls through to native menu', () => {
    const cm = createMenu();
    cm.register('test', { selector: '.zone', items: () => [] });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    const event = fireContextMenu(zone);
    expect(event.defaultPrevented).toBe(false);
    expect(cm.isOpen).toBe(false);
  });

  // 8. show() renders items in shadow DOM and sets isOpen = true
  it('show() renders items in shadow DOM and sets isOpen = true', () => {
    const cm = createMenu();
    cm.show(100, 100, makeSampleItems());

    expect(cm.isOpen).toBe(true);
    const menu = cm.shadowRoot.querySelector('[part="menu"]');
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

    const menu = cm.shadowRoot.querySelector('[part="menu"]');
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

    const menu = cm.shadowRoot.querySelector('[part="menu"]');
    const spans = menu.querySelectorAll('.item');
    expect(spans[0].classList.contains('disabled')).toBe(false);
    expect(spans[1].classList.contains('disabled')).toBe(true);
  });

  // 11. Menu positioned at clientX/clientY
  it('menu positioned at clientX/clientY', () => {
    const cm = createMenu();
    cm.show(200, 300, [{ label: 'A', action: () => {} }]);

    const menu = cm.shadowRoot.querySelector('[part="menu"]');
    expect(menu.style.left).toBe('200px');
    expect(menu.style.top).toBe('300px');
  });

  // 12. Menu flips left when it would overflow viewport right edge
  it('menu flips left when it would overflow viewport right edge', () => {
    const cm = createMenu();
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });

    const menu = cm.shadowRoot.querySelector('[part="menu"]');
    const origGetRect = menu.getBoundingClientRect.bind(menu);
    menu.getBoundingClientRect = () => ({
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

    const menu = cm.shadowRoot.querySelector('[part="menu"]');
    const origGetRect = menu.getBoundingClientRect.bind(menu);
    menu.getBoundingClientRect = () => ({
      left: 100, right: 250, top: 580, bottom: 650, width: 150, height: 70,
    });

    cm.show(100, 580, [{ label: 'A', action: () => {} }]);

    // The top should be adjusted: 580 - 70 = 510
    expect(menu.style.top).toBe('510px');

    menu.getBoundingClientRect = origGetRect;
  });

  // 14. Clicking an item calls its action and closes menu
  it('clicking an item calls its action and closes menu', () => {
    const cm = createMenu();
    const action = vi.fn();
    cm.show(100, 100, [{ label: 'Do it', action }]);

    const menu = cm.shadowRoot.querySelector('[part="menu"]');
    const item = menu.querySelector('.item');
    item.click();

    expect(action).toHaveBeenCalled();
    expect(cm.isOpen).toBe(false);
  });

  // 15. Clicking a disabled item does nothing
  it('clicking a disabled item does nothing', () => {
    const cm = createMenu();
    const action = vi.fn();
    cm.show(100, 100, [{ label: 'Nope', action, disabled: true }]);

    const menu = cm.shadowRoot.querySelector('[part="menu"]');
    const item = menu.querySelector('.item');
    item.click();

    expect(action).not.toHaveBeenCalled();
    expect(cm.isOpen).toBe(true);
  });

  // 16. Clicking a separator does nothing
  it('clicking a separator does nothing', () => {
    const cm = createMenu();
    cm.show(100, 100, makeSampleItems());

    const menu = cm.shadowRoot.querySelector('[part="menu"]');
    const hr = menu.querySelector('hr');
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
    let highlighted = cm.shadowRoot.querySelector('.item.highlighted');
    expect(highlighted.textContent).toBe('A');

    // Second ArrowDown: skip separator and disabled, highlight C (index 3)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    highlighted = cm.shadowRoot.querySelector('.item.highlighted');
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
    let highlighted = cm.shadowRoot.querySelector('.item.highlighted');
    expect(highlighted.textContent).toBe('C');

    // Another ArrowUp: skip disabled and separator, highlight A (index 0)
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    highlighted = cm.shadowRoot.querySelector('.item.highlighted');
    expect(highlighted.textContent).toBe('A');
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
  it('click outside closes the menu', () => {
    const cm = createMenu();
    cm.show(100, 100, [{ label: 'A', action: () => {} }]);
    expect(cm.isOpen).toBe(true);

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

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    fireContextMenu(zone);
    expect(cm.isOpen).toBe(true);

    // Fire another contextmenu — should close first and reopen
    fireContextMenu(zone);
    expect(cm.isOpen).toBe(true);

    // Verify the menu was rebuilt (close was called internally)
    const menu = cm.shadowRoot.querySelector('[part="menu"]');
    expect(menu.querySelectorAll('.item').length).toBe(1);
  });

  // 25. disconnectedCallback removes document contextmenu listener
  it('disconnectedCallback removes document contextmenu listener', () => {
    const cm = createMenu();
    const items = vi.fn(() => [{ label: 'A', action: () => {} }]);
    cm.register('test', { selector: '.zone', items });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

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
