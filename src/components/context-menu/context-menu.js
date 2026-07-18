// <base-context-menu> — singleton right-click context menu with zone-based registration

import { MENU_ITEM_CSS, MENU_SURFACE_CSS } from '../shared/menu-styles.js';
import { nextEnabledIndex } from '../shared/menu-nav.js';
import { addOverlayListeners, removeOverlayListeners } from '../shared/overlay-utils.js';

const contextMenuTemplate = document.createElement('template');
contextMenuTemplate.innerHTML = `<style>
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
  hr {
    border: none;
    border-top: 1px solid var(--border-color, #27272a);
    margin: 4px 0;
  }
</style>
<div part="menu" hidden></div>`;

class BaseContextMenu extends HTMLElement {
  // Member convention (library-wide — see docs/base-components.md): `#member` is
  // hard-private internal state; `_member` is deliberately reachable by a friend
  // module or test. This component has no friend module, so every member is #.
  #zones = new Map();
  #open = false;
  #highlightIdx = -1;
  #items = [];
  #onContextMenu = null;
  #menu = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(contextMenuTemplate.content.cloneNode(true));
    this.#menu = this.shadowRoot.querySelector('[part="menu"]');
  }

  connectedCallback() {
    this.#onContextMenu = (e) => this.#handleContextMenu(e);
    document.addEventListener('contextmenu', this.#onContextMenu);
  }

  disconnectedCallback() {
    if (this.#onContextMenu) {
      document.removeEventListener('contextmenu', this.#onContextMenu);
      this.#onContextMenu = null;
    }
    this.close();
  }

  register(id, { selector, items }) {
    // Map preserves insertion order, and re-setting an existing key keeps its
    // original position — so zone iteration order is derived, never duplicated.
    this.#zones.set(id, { selector, items });
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

  #handleContextMenu(e) {
    if (this.#open) this.close();

    for (const zone of this.#zones.values()) {
      const matched = e.target.closest(zone.selector);
      if (!matched) continue;

      const selection = window.getSelection().toString();
      const result = zone.items(e.target, selection);
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
