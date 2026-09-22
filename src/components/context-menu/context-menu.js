// <base-context-menu> — singleton right-click context menu with zone-based registration

import { MENU_ITEM_CSS, MENU_SURFACE_CSS } from '../shared/menu-styles.js';
import { nextEnabledIndex } from '../shared/menu-nav.js';
import { addOverlayListeners, removeOverlayListeners } from '../shared/overlay-utils.js';
import { shadowStyles } from '../shared/shadow-styles.js';

const contextMenuStyles = shadowStyles(`
  :host {
    display: contents;
  }
  [part="menu"] {
    position: fixed;
    z-index: 1000;
    min-width: 140px;
    max-width: 260px;${MENU_SURFACE_CSS}
  }
  [part="menu"][hidden] {
    display: none;
  }
  .item {${MENU_ITEM_CSS}
  }
  .item.highlighted {
    background: var(--bg-hover, #27272a);
  }
  .item.disabled {
    color: var(--text-muted, #52525b);
    opacity: 0.4;
    cursor: default;
  }
  .item.disabled.highlighted {
    background: transparent;
  }
  /* A finger is not a mouse pointer: 4px rows at 13px are a target you miss. */
  @media (pointer: coarse) {
    .item {
      padding: 10px 14px;
      font-size: 15px;
    }
  }
  hr {
    border: none;
    border-top: 1px solid var(--border-color, #27272a);
    margin: 4px 0;
  }
`);

const contextMenuTemplate = document.createElement('template');
contextMenuTemplate.innerHTML = '<div part="menu" hidden></div>';

class BaseContextMenu extends HTMLElement {
  // Member convention (library-wide — see docs/base-components.md): `#member` is
  // hard-private internal state; `_member` is deliberately reachable by a friend
  // module or test. This component has no friend module, so every member is #.
  #zones = new Map();
  #open = false;
  #highlightIdx = -1;
  #items = [];
  #onContextMenu = null;
  #onPointerDown = null;
  #onKeyDown = null;
  #menu = null;
  // Whether the gesture that will produce the next `contextmenu` came from a
  // finger — see #isTouchGesture for why that has to be known before we
  // preventDefault().
  #lastPointerWasTouch = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    contextMenuStyles.adopt(this.shadowRoot);
    this.shadowRoot.appendChild(contextMenuTemplate.content.cloneNode(true));
    this.#menu = this.shadowRoot.querySelector('[part="menu"]');
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

  register(id, { selector, items, touch }) {
    // Map preserves insertion order, and re-setting an existing key keeps its
    // original position — so zone iteration order is derived, never duplicated.
    this.#zones.set(id, { selector, items, touch: !!touch });
  }

  unregister(id) {
    this.#zones.delete(id);
  }

  show(x, y, items) {
    this.#items = items;
    this.#highlightIdx = -1;
    this.#open = true;

    while (this.#menu.firstChild) this.#menu.firstChild.remove();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.separator) {
        const hr = document.createElement('hr');
        hr.dataset.index = i;
        this.#menu.appendChild(hr);
      } else {
        const span = document.createElement('span');
        span.className = 'item';
        span.textContent = item.label;
        span.dataset.index = i;
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
    if (rect.right > window.innerWidth) {
      this.#menu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      this.#menu.style.top = (y - rect.height) + 'px';
    }

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
  #isTouchGesture(e) {
    if (e.pointerType) return e.pointerType === 'touch';
    if (typeof e.mozInputSource === 'number') {
      return e.mozInputSource === 5; // MouseEvent.MOZ_SOURCE_TOUCH
    }
    return this.#lastPointerWasTouch;
  }

  #handleContextMenu(e) {
    if (this.#open) this.close();

    const isTouch = this.#isTouchGesture(e);
    const ctx = { x: e.clientX, y: e.clientY, pointerType: isTouch ? 'touch' : 'mouse' };

    for (const zone of this.#zones.values()) {
      if (isTouch && !zone.touch) continue;
      const matched = e.target.closest(zone.selector);
      if (!matched) continue;

      const selection = window.getSelection().toString();
      const result = zone.items(e.target, selection, ctx);
      if (result && result.length > 0) {
        e.preventDefault();
        this.show(e.clientX, e.clientY, result);
        return;
      }
    }
    // No match — native menu shows
  }

  #onItemClick(index) {
    const item = this.#items[index];
    if (!item || item.separator || item.disabled) return;
    item.action();
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
        { target: document, type: 'keydown', handler: (e) => this.#onNavKeydown(e) },
        { target: window, type: 'scroll', handler: () => this.close(), options: { passive: true, capture: true } },
        { target: window, type: 'blur', handler: () => this.close() },
      ],
    );
  }

  // Escape is handled by overlay-utils; this covers menu navigation only.
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
    const spans = this.#menu.querySelectorAll('.item');
    for (const span of spans) {
      const i = parseInt(span.dataset.index, 10);
      span.classList.toggle('highlighted', i === this.#highlightIdx);
    }
  }
}

customElements.define('base-context-menu', BaseContextMenu);
