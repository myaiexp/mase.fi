// @vitest-environment jsdom
// base-context-menu touch and pointer-type handling
import { describe, it, expect, vi } from 'vitest';
import {
  installMenuHooks,
  createMenu,
  inShadow,
  makeZone,
  fireContextMenu,
  firePointerDown,
} from './context-menu-test-helpers.js';

describe('base-context-menu touch', () => {
  installMenuHooks();

  // 27. A touch long-press falls through to the browser — preventing it would
  // cancel the very gesture that starts a text selection on a touchscreen.
  it('touch long-press does not open the menu or prevent default', () => {
    const cm = createMenu();
    const items = vi.fn(() => [{ label: 'A', action: () => {} }]);
    cm.register('test', { selector: '.zone', items });

    const zone = makeZone();

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

    const zone = makeZone();

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

    const zone = makeZone();

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

    const zone = makeZone();

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

    const zone = makeZone();

    firePointerDown(zone, 'touch');
    const event = fireContextMenu(zone);

    expect(items).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);
  });

  it('a zone with touch:true takes the touch long-press', () => {
    const cm = createMenu();
    const items = vi.fn(() => [{ label: 'A', action: () => {} }]);
    cm.register('test', { selector: '.zone', items, touch: true });

    const zone = makeZone();

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

    const zone = makeZone();

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

    const zone = makeZone();

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
    /** @param {Element} target @param {string} selection */
    const items = (target, selection) => [{ label: 'sel:' + selection, action: () => {} }];
    cm.register('test', { selector: '.zone', items });

    const zone = makeZone();

    firePointerDown(zone, 'mouse');
    fireContextMenu(zone);
    expect(cm.isOpen).toBe(true);
    expect(inShadow(cm, '.item').textContent).toBe('sel:');
  });

  // 31. A keyboard-invoked menu (Menu key / Shift+F10) is not a touch gesture,
  // even when the last pointerdown on the device was a finger.
  it('keyboard-invoked contextmenu after a touch still opens the menu', () => {
    const cm = createMenu();
    cm.register('test', { selector: '.zone', items: () => [{ label: 'A', action: () => {} }] });

    const zone = makeZone();

    firePointerDown(zone, 'touch');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }));
    const event = fireContextMenu(zone);

    expect(event.defaultPrevented).toBe(true);
    expect(cm.isOpen).toBe(true);
  });
});
