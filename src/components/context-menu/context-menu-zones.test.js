// @vitest-environment jsdom
// base-context-menu zone registration and matching
import { describe, it, expect, vi } from 'vitest';
import {
  installMenuHooks,
  createMenu,
  makeZone,
  fireContextMenu,
} from './context-menu-test-helpers.js';

describe('base-context-menu zones', () => {
  installMenuHooks();

  // 1. register() stores zone, unregister() removes it
  it('register() stores zone, unregister() removes it', () => {
    const cm = createMenu();
    const items = vi.fn(() => [{ label: 'A', action: () => {} }]);
    cm.register('test', { selector: '.zone', items });

    const zone = makeZone();

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

    const zone = makeZone();

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
    window.getSelection = () => /** @type {Selection} */ (/** @type {unknown} */ ({ toString: () => 'selected text' }));

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

    const zone = makeZone();

    fireContextMenu(zone);
    expect(items1).toHaveBeenCalled();
    expect(items2).not.toHaveBeenCalled();
  });

  // 6. Items builder returning null falls through to native menu
  it('items builder returning null falls through to native menu', () => {
    const cm = createMenu();
    cm.register('test', { selector: '.zone', items: () => null });

    const zone = makeZone();

    const event = fireContextMenu(zone);
    expect(event.defaultPrevented).toBe(false);
    expect(cm.isOpen).toBe(false);
  });

  // 7. Items builder returning empty array falls through to native menu
  it('items builder returning empty array falls through to native menu', () => {
    const cm = createMenu();
    cm.register('test', { selector: '.zone', items: () => [] });

    const zone = makeZone();

    const event = fireContextMenu(zone);
    expect(event.defaultPrevented).toBe(false);
    expect(cm.isOpen).toBe(false);
  });
});
