// Shared setup for the base-context-menu test files
import { beforeAll, afterEach, vi } from 'vitest';

/** @import { MenuItem, ZoneOptions } from './context-menu.js' */
/**
 * @typedef {HTMLElement & {
 *   register: (id: string, zone: ZoneOptions) => void,
 *   unregister: (id: string) => void,
 *   show: (x: number, y: number, items: MenuItem[]) => void,
 *   close: () => void,
 *   isOpen: boolean,
 * }} ContextMenuEl
 */

/** @type {ContextMenuEl | undefined} */
let el;

/** Registers the import hook and the per-test cleanup; call inside the top-level describe. */
export function installMenuHooks() {
  // Several tests swap window.getSelection. Restoring here rather than at the end
  // of each test means a FAILING test can't leak its stub into the next one — which
  // it otherwise does, since the assertion throws before the restore line runs.
  const origGetSelection = window.getSelection;

  beforeAll(async () => {
    await import('./context-menu.js');
  });

  afterEach(() => {
    if (el && el.parentNode) {
      el.remove();
    }
    window.getSelection = origGetSelection;
    document.body.textContent = '';
    vi.restoreAllMocks();
  });
}

/** @returns {ContextMenuEl} */
export function createMenu() {
  el = /** @type {ContextMenuEl} */ (document.createElement('base-context-menu'));
  document.body.appendChild(el);
  return el;
}

/** @returns {HTMLElement} a `.zone` div appended to the body */
export function makeZone() {
  const zone = document.createElement('div');
  zone.className = 'zone';
  document.body.appendChild(zone);
  return zone;
}

/**
 * @param {ContextMenuEl} cm
 * @returns {HTMLElement}
 */
export function menuOf(cm) {
  const menu = /** @type {ShadowRoot} */ (cm.shadowRoot).querySelector('[part="menu"]');
  if (!menu) throw new Error('menu element missing');
  return /** @type {HTMLElement} */ (menu);
}

/**
 * @param {ContextMenuEl} cm
 * @param {string} sel
 * @returns {HTMLElement}
 */
export function inShadow(cm, sel) {
  const found = /** @type {ShadowRoot} */ (cm.shadowRoot).querySelector(sel);
  if (!found) throw new Error(`${sel} missing`);
  return /** @type {HTMLElement} */ (found);
}

/**
 * @param {EventTarget} target
 * @param {number} [x]
 * @param {number} [y]
 */
export function fireContextMenu(target, x = 100, y = 100) {
  const event = new MouseEvent('contextmenu', {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
  });
  target.dispatchEvent(event);
  return event;
}

/**
 * @param {EventTarget} target
 * @param {string} pointerType
 */
export function firePointerDown(target, pointerType) {
  // jsdom's PointerEvent ignores pointerType in its init dict, so stamp it on.
  const event = new MouseEvent('pointerdown', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
  return event;
}

/** @returns {MenuItem[]} */
export function makeSampleItems() {
  return [
    { label: 'Copy', action: vi.fn() },
    { separator: true },
    { label: 'Paste', action: vi.fn() },
  ];
}

/**
 * Replace an element's getBoundingClientRect with a fixed rect.
 * @param {HTMLElement} elem
 * @param {{ left: number, right: number, top: number, bottom: number, width: number, height: number }} rect
 */
export function stubRect(elem, rect) {
  elem.getBoundingClientRect = () => /** @type {DOMRect} */ (/** @type {unknown} */ (rect));
}
