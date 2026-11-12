// <base-context-menu> — singleton right-click context menu with zone-based registration

import { nextEnabledIndex } from '../shared/menu-nav.js';
import { addOverlayListeners, removeOverlayListeners } from '../shared/overlay-utils.js';
import { mountShadow } from '../shared/mount-shadow.js';
import { contextMenuStyles } from './context-menu-styles.js';

const contextMenuTemplate = document.createElement('template');
contextMenuTemplate.innerHTML = '<div part="menu" hidden></div>';

/**
 * @typedef {object} MenuItem
 * @property {string} [label]
 * @property {boolean} [separator]
 * @property {boolean} [disabled]
 * @property {() => void} [action]
 */
/** @typedef {{ x: number, y: number, pointerType: 'touch' | 'mouse' }} MenuContext */
/**
 * @typedef {object} ZoneOptions
 * @property {string} selector
 * @property {(target: Element, selection: string, ctx: MenuContext) => MenuItem[] | null | undefined} items
 * @property {boolean} [touch]
 */

class BaseContextMenu extends HTMLElement {
  // Member convention (library-wide — see docs/base-components.md): `#member` is
  // hard-private internal state; `_member` is deliberately reachable by a friend
  // module or test. This component has no friend module, so every member is #.
  /** @type {Map<string, { selector: string, items: ZoneOptions['items'], touch: boolean }>} */
  #zones = new Map();
  #open = false;
  #highlightIdx = -1;
  /** @type {MenuItem[]} */
  #items = [];
  /** @type {((e: MouseEvent) => void) | null} */
  #onContextMenu = null;
  /** @type {((e: PointerEvent) => void) | null} */
  #onPointerDown = null;
  /** @type {(() => void) | null} */
  #onKeyDown = null;
  /** @type {HTMLElement} */
  #menu;
  // Whether the gesture that will produce the next `contextmenu` came from a
  // finger — see #isTouchGesture for why that has to be known before we
  // preventDefault().
  #lastPointerWasTouch = false;

  constructor() {
    super();
    mountShadow(this, contextMenuStyles, contextMenuTemplate);
    this.#menu = /** @type {HTMLElement} */ (/** @type {ShadowRoot} */ (this.shadowRoot).querySelector('[part="menu"]'));
  }

  connectedCallback() {
    this.#onContextMenu = (e) => this.#handleContextMenu(e);
    // Captured on document so a consumer that stopPropagation()s its own
    // pointerdown can't blind the touch check below.
    this.#onPointerDown = (e) => { this.#lastPointerWasTouch = e.pointerType === 'touch'; };
    // A Menu-key / Shift+F10 menu is keyboard-invoked and gets no pointerdown of
    // its own, so on a touchscreen laptop it would otherwise inherit whatever
    // the last finger did.
    this.#onKeyDown = () => { this.#lastPointerWasTouch = false; };
    document.addEventListener('contextmenu', this.#onContextMenu);
    document.addEventListener('pointerdown', this.#onPointerDown, true);
    document.addEventListener('keydown', this.#onKeyDown, true);
  }

  disconnectedCallback() {
    if (this.#onContextMenu) {
      document.removeEventListener('contextmenu', this.#onContextMenu);
      this.#onContextMenu = null;
    }
    if (this.#onPointerDown) {
      document.removeEventListener('pointerdown', this.#onPointerDown, true);
      this.#onPointerDown = null;
    }
    if (this.#onKeyDown) {
      document.removeEventListener('keydown', this.#onKeyDown, true);
      this.#onKeyDown = null;
    }
    this.close();
  }

  /**
   * @param {string} id
   * @param {ZoneOptions} zone
   */
  register(id, { selector, items, touch }) {
    // Map preserves insertion order, and re-setting an existing key keeps its
    // original position — so zone iteration order is derived, never duplicated.
    this.#zones.set(id, { selector, items, touch: !!touch });
  }

  /** @param {string} id */
  unregister(id) {
    this.#zones.delete(id);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {MenuItem[]} items
   */
  show(x, y, items) {
    this.#items = items;
    this.#highlightIdx = -1;
    this.#open = true;

    while (this.#menu.firstChild) this.#menu.firstChild.remove();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.separator) {
        const hr = document.createElement('hr');
        hr.dataset.index = String(i);
        this.#menu.appendChild(hr);
      } else {
        const span = document.createElement('span');
        span.className = 'item';
        span.textContent = /** @type {string} */ (item.label);
        span.dataset.index = String(i);
        if (item.disabled) span.classList.add('disabled');
        span.addEventListener('click', (e) => {
          e.stopPropagation();
          this.#onItemClick(i);
        });
        this.#menu.appendChild(span);
      }
    }

    this.#menu.style.left = x + 'px';
    this.#menu.style.top = y + 'px';
    this.#menu.hidden = false;

    const rect = this.#menu.getBoundingClientRect();
    let left = rect.right > window.innerWidth ? x - rect.width : x;
    let top = rect.bottom > window.innerHeight ? y - rect.height : y;
    // A flip near the opposite edge lands negative (x - width on a narrow
    // screen). Pin into the viewport; a menu larger than the viewport stays
    // at 0 rather than clamping to a negative upper bound.
    left = Math.max(0, Math.min(left, window.innerWidth - rect.width));
    top = Math.max(0, Math.min(top, window.innerHeight - rect.height));
    this.#menu.style.left = left + 'px';
    this.#menu.style.top = top + 'px';

    this.#addDocListeners();
  }

  close() {
    this.#open = false;
    this.#highlightIdx = -1;
    this.#items = [];
    this.#menu.hidden = true;
    while (this.#menu.firstChild) this.#menu.firstChild.remove();
    removeOverlayListeners(this);
  }

  get isOpen() {
    return this.#open;
  }

  // On a touchscreen the long-press that fires `contextmenu` is the SAME gesture
  // that starts a text selection, so preventDefault() there doesn't swap one menu
  // for another — it costs the page its only copy affordance. Zones therefore opt
  // in (`touch: true`) rather than out: a zone takes the gesture only when it has
  // something better to offer than the browser's selection handles, and every zone
  // that doesn't ask leaves touch alone.
  //
  // `pointerType` rides on the contextmenu event itself only in Chromium; Firefox
  // exposes mozInputSource and WebKit dispatches a plain MouseEvent — so the
  // preceding pointerdown is the portable signal, and the event's own fields win
  // when present.
  /** @param {MouseEvent & { pointerType?: string, mozInputSource?: number }} e */
  #isTouchGesture(e) {
    if (e.pointerType) return e.pointerType === 'touch';
    if (typeof e.mozInputSource === 'number') {
      return e.mozInputSource === 5; // MouseEvent.MOZ_SOURCE_TOUCH
    }
    return this.#lastPointerWasTouch;
  }

  /** @param {MouseEvent} e */
  #handleContextMenu(e) {
    if (this.#open) this.close();

    const isTouch = this.#isTouchGesture(e);
    /** @type {MenuContext} */
    const ctx = { x: e.clientX, y: e.clientY, pointerType: isTouch ? 'touch' : 'mouse' };

    const target = /** @type {Element} */ (e.target);
    for (const zone of this.#zones.values()) {
      if (isTouch && !zone.touch) continue;
      const matched = target.closest(zone.selector);
      if (!matched) continue;

      const selection = /** @type {Selection} */ (window.getSelection()).toString();
      const result = zone.items(target, selection, ctx);
      if (result && result.length > 0) {
        e.preventDefault();
        this.show(e.clientX, e.clientY, result);
        return;
      }
    }
    // No match — native menu shows
  }

  /** @param {number} index */
  #onItemClick(index) {
    const item = this.#items[index];
    if (!item || item.separator || item.disabled) return;
    /** @type {() => void} */ (item.action)();
    this.close();
  }

  // Shared lifecycle (close-on-outside-click + Escape + cleanup) comes from
  // overlay-utils; the arrow/enter nav and scroll/blur-to-close are this
  // component's extras layered on top via the same descriptor registry.
  #addDocListeners() {
    addOverlayListeners(
      this,
      (e) => !e.composedPath().includes(this.#menu),
      [
        { target: document, type: 'keydown', handler: (e) => this.#onNavKeydown(/** @type {KeyboardEvent} */ (e)) },
        { target: window, type: 'scroll', handler: () => this.close(), options: { passive: true, capture: true } },
        { target: window, type: 'blur', handler: () => this.close() },
      ],
    );
  }

  // Escape is handled by overlay-utils; this covers menu navigation only.
  /** @param {KeyboardEvent} e */
  #onNavKeydown(e) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.#moveHighlight(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.#moveHighlight(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.#highlightIdx >= 0) {
        this.#onItemClick(this.#highlightIdx);
      }
    }
  }

  /** @param {number} direction */
  #moveHighlight(direction) {
    const items = this.#items;
    if (!items.length) return;

    const idx = nextEnabledIndex(
      this.#highlightIdx,
      direction,
      items.length,
      (i) => items[i].separator || items[i].disabled,
    );
    if (idx !== -1) {
      this.#highlightIdx = idx;
      this.#updateHighlight();
    }
  }

  #updateHighlight() {
    const spans = /** @type {NodeListOf<HTMLElement>} */ (this.#menu.querySelectorAll('.item'));
    for (const span of spans) {
      const i = parseInt(/** @type {string} */ (span.dataset.index), 10);
      span.classList.toggle('highlighted', i === this.#highlightIdx);
    }
  }
}

customElements.define('base-context-menu', BaseContextMenu);
