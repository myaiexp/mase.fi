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

function firePointerDown(target, pointerType) {
  // jsdom's PointerEvent ignores pointerType in its init dict, so stamp it on.
  const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
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
  // Several tests swap window.getSelection. Restoring here rather than at the end
  // of each test means a FAILING test can't leak its stub into the next one — which
  // it otherwise does, since the assertion throws before the restore line runs.
  const origGetSelection = window.getSelection;

  afterEach(() => {
    if (el && el.parentNode) {
      el.remove();
    }
    window.getSelection = origGetSelection;
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

  // 3. contextmenu passes e.target (actual click target) and selection text to items builder
  it('contextmenu passes e.target and selection text to items builder', () => {
    const cm = createMenu();
    const items = vi.fn(() => [{ label: 'A', action: () => {} }]);
    cm.register('test', { selector: '.zone', items });

    const zone = document.createElement('div');
    zone.className = 'zone';
    const child = document.createElement('span');
    zone.appendChild(child);
    document.body.appendChild(zone);

    // Mock getSelection (restored by afterEach, so a failure here can't leak it)
    window.getSelection = () => ({ toString: () => 'selected text' });

    // Fire on child — items builder should receive the child (e.target), not the zone
    fireContextMenu(child);
    expect(items).toHaveBeenCalledWith(child, 'selected text', {
      x: 100, y: 100, pointerType: 'mouse',
    });
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

  // 27. A touch long-press falls through to the browser — preventing it would
  // cancel the very gesture that starts a text selection on a touchscreen.
  it('touch long-press does not open the menu or prevent default', () => {
    const cm = createMenu();
    const items = vi.fn(() => [{ label: 'A', action: () => {} }]);
    cm.register('test', { selector: '.zone', items });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    firePointerDown(zone, 'touch');
    const event = fireContextMenu(zone);

    expect(items).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
    expect(cm.isOpen).toBe(false);
  });

  // 28. ...and a mouse right-click on the same device still gets the menu
  it('mouse right-click after a touch still opens the menu', () => {
    const cm = createMenu();
    cm.register('test', { selector: '.zone', items: () => [{ label: 'A', action: () => {} }] });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    firePointerDown(zone, 'touch');
    firePointerDown(zone, 'mouse');
    const event = fireContextMenu(zone);

    expect(event.defaultPrevented).toBe(true);
    expect(cm.isOpen).toBe(true);
  });

  // 29. The event's own pointerType wins over the tracked pointerdown when the
  // engine provides it (Chromium dispatches contextmenu as a PointerEvent).
  it('contextmenu carrying pointerType=touch falls through with no pointerdown', () => {
    const cm = createMenu();
    const items = vi.fn(() => [{ label: 'A', action: () => {} }]);
    cm.register('test', { selector: '.zone', items });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'pointerType', { value: 'touch' });
    zone.dispatchEvent(event);

    expect(items).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  // 30. Firefox reports the source on the MouseEvent instead of pointerType
  it('contextmenu with mozInputSource=TOUCH falls through', () => {
    const cm = createMenu();
    const items = vi.fn(() => [{ label: 'A', action: () => {} }]);
    cm.register('test', { selector: '.zone', items });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'mozInputSource', { value: 5 });
    zone.dispatchEvent(event);

    expect(items).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    // ...and mozInputSource=MOUSE still opens it
    const mouseEvent = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(mouseEvent, 'mozInputSource', { value: 1 });
    zone.dispatchEvent(mouseEvent);
    expect(items).toHaveBeenCalled();
  });

  // 32-36. Per-zone touch opt-in. The default (fall through) is the whole point of
  // the 302e4006 fix; a zone that has something better to offer than the browser's
  // selection handles asks for the gesture explicitly.
  it('a zone without touch:true still falls through on a touch long-press', () => {
    const cm = createMenu();
    const items = vi.fn(() => [{ label: 'A', action: () => {} }]);
    cm.register('test', { selector: '.zone', items });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    firePointerDown(zone, 'touch');
    const event = fireContextMenu(zone);

    expect(items).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('a zone with touch:true takes the touch long-press', () => {
    const cm = createMenu();
    const items = vi.fn(() => [{ label: 'A', action: () => {} }]);
    cm.register('test', { selector: '.zone', items, touch: true });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    firePointerDown(zone, 'touch');
    const event = fireContextMenu(zone);

    expect(items).toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);
    expect(cm.isOpen).toBe(true);
  });

  it('a non-opted zone is skipped on touch but still wins on mouse', () => {
    const cm = createMenu();
    const first = vi.fn(() => [{ label: 'first', action: () => {} }]);
    const second = vi.fn(() => [{ label: 'second', action: () => {} }]);
    cm.register('first', { selector: '.zone', items: first });
    cm.register('second', { selector: '.zone', items: second, touch: true });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    // Touch: the non-opted zone is skipped entirely, so the opted one answers.
    firePointerDown(zone, 'touch');
    fireContextMenu(zone);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalled();
    cm.close();

    // Mouse: registration order decides, as before.
    first.mockClear(); second.mockClear();
    firePointerDown(zone, 'mouse');
    fireContextMenu(zone);
    expect(first).toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();
  });

  it('the items builder receives press coordinates and the resolved pointer type', () => {
    const cm = createMenu();
    const items = vi.fn(() => [{ label: 'A', action: () => {} }]);
    cm.register('test', { selector: '.zone', items, touch: true });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    firePointerDown(zone, 'touch');
    fireContextMenu(zone, 120, 340);

    expect(items).toHaveBeenCalledWith(zone, '', { x: 120, y: 340, pointerType: 'touch' });

    // ...and a mouse press reports itself as such.
    cm.close();
    items.mockClear();
    firePointerDown(zone, 'mouse');
    fireContextMenu(zone, 10, 20);
    expect(items).toHaveBeenCalledWith(zone, '', { x: 10, y: 20, pointerType: 'mouse' });
  });

  it('a two-argument items builder still works', () => {
    const cm = createMenu();
    // Deliberately ignores the third argument, like every pre-existing consumer.
    const items = (target, selection) => [{ label: 'sel:' + selection, action: () => {} }];
    cm.register('test', { selector: '.zone', items });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    firePointerDown(zone, 'mouse');
    fireContextMenu(zone);
    expect(cm.isOpen).toBe(true);
    expect(cm.shadowRoot.querySelector('.item').textContent).toBe('sel:');
  });

  // 31. A keyboard-invoked menu (Menu key / Shift+F10) is not a touch gesture,
  // even when the last pointerdown on the device was a finger.
  it('keyboard-invoked contextmenu after a touch still opens the menu', () => {
    const cm = createMenu();
    cm.register('test', { selector: '.zone', items: () => [{ label: 'A', action: () => {} }] });

    const zone = document.createElement('div');
    zone.className = 'zone';
    document.body.appendChild(zone);

    firePointerDown(zone, 'touch');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }));
    const event = fireContextMenu(zone);

    expect(event.defaultPrevented).toBe(true);
    expect(cm.isOpen).toBe(true);
  });
});
