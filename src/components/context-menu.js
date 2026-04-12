// <base-context-menu> — singleton right-click context menu with zone-based registration

const menuTemplate = document.createElement('template');
menuTemplate.innerHTML = `<style>
  :host {
    display: contents;
  }
  [part="menu"] {
    position: fixed;
    z-index: 1000;
    min-width: 140px;
    max-width: 260px;
    background: var(--bg-raised, #18181b);
    border: 1px solid var(--border-color, #27272a);
    border-radius: 0;
    padding: 4px 0;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  [part="menu"][hidden] {
    display: none;
  }
  .item {
    display: block;
    padding: 4px 12px;
    font-size: 12px;
    font-family: var(--font-mono, monospace);
    color: var(--text, #fafafa);
    background: transparent;
    cursor: pointer;
    border-radius: 0;
    white-space: nowrap;
    user-select: none;
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
  #zones = new Map();
  #zoneOrder = [];
  #open = false;
  #highlightIdx = -1;
  #items = [];
  #onContextMenu = null;
  #onDocClick = null;
  #onDocKeydown = null;
  #onScroll = null;
  #onBlur = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(menuTemplate.content.cloneNode(true));
    this._menu = this.shadowRoot.querySelector('[part="menu"]');
  }

  connectedCallback() {
    this.#onContextMenu = (e) => this._handleContextMenu(e);
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
    const existed = this.#zones.has(id);
    this.#zones.set(id, { selector, items });
    if (!existed) {
      this.#zoneOrder.push(id);
    }
  }

  unregister(id) {
    this.#zones.delete(id);
    const idx = this.#zoneOrder.indexOf(id);
    if (idx !== -1) this.#zoneOrder.splice(idx, 1);
  }

  show(x, y, items) {
    this.#items = items;
    this.#highlightIdx = -1;
    this.#open = true;

    // Build menu content
    while (this._menu.firstChild) this._menu.firstChild.remove();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.separator) {
        const hr = document.createElement('hr');
        hr.dataset.index = i;
        this._menu.appendChild(hr);
      } else {
        const span = document.createElement('span');
        span.className = 'item';
        span.textContent = item.label;
        span.dataset.index = i;
        if (item.disabled) span.classList.add('disabled');
        span.addEventListener('click', (e) => {
          e.stopPropagation();
          this._onItemClick(i);
        });
        this._menu.appendChild(span);
      }
    }

    // Position
    this._menu.style.left = x + 'px';
    this._menu.style.top = y + 'px';
    this._menu.hidden = false;

    // Flip if overflowing
    const rect = this._menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      this._menu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      this._menu.style.top = (y - rect.height) + 'px';
    }

    this._addDocListeners();
  }

  close() {
    this.#open = false;
    this.#highlightIdx = -1;
    this.#items = [];
    this._menu.hidden = true;
    while (this._menu.firstChild) this._menu.firstChild.remove();
    this._removeDocListeners();
  }

  get isOpen() {
    return this.#open;
  }

  _handleContextMenu(e) {
    // Close any open menu first
    if (this.#open) this.close();

    for (const id of this.#zoneOrder) {
      const zone = this.#zones.get(id);
      if (!zone) continue;
      const matched = e.target.closest(zone.selector);
      if (!matched) continue;

      const selection = window.getSelection().toString();
      const result = zone.items(matched, selection);
      if (result && result.length > 0) {
        e.preventDefault();
        this.show(e.clientX, e.clientY, result);
        return;
      }
    }
    // No match — native menu shows
  }

  _onItemClick(index) {
    const item = this.#items[index];
    if (!item || item.separator || item.disabled) return;
    item.action();
    this.close();
  }

  _addDocListeners() {
    this.#onDocClick = (e) => {
      const path = e.composedPath();
      if (!path.includes(this._menu)) this.close();
    };
    this.#onDocKeydown = (e) => {
      if (e.key === 'Escape') {
        this.close();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this._moveHighlight(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this._moveHighlight(-1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (this.#highlightIdx >= 0) {
          this._onItemClick(this.#highlightIdx);
        }
      }
    };
    this.#onScroll = () => this.close();
    this.#onBlur = () => this.close();

    document.addEventListener('click', this.#onDocClick);
    document.addEventListener('keydown', this.#onDocKeydown);
    window.addEventListener('scroll', this.#onScroll, { passive: true, capture: true });
    window.addEventListener('blur', this.#onBlur);
  }

  _removeDocListeners() {
    if (this.#onDocClick) {
      document.removeEventListener('click', this.#onDocClick);
      this.#onDocClick = null;
    }
    if (this.#onDocKeydown) {
      document.removeEventListener('keydown', this.#onDocKeydown);
      this.#onDocKeydown = null;
    }
    if (this.#onScroll) {
      window.removeEventListener('scroll', this.#onScroll, { passive: true, capture: true });
      this.#onScroll = null;
    }
    if (this.#onBlur) {
      window.removeEventListener('blur', this.#onBlur);
      this.#onBlur = null;
    }
  }

  _moveHighlight(direction) {
    const items = this.#items;
    if (!items.length) return;

    let idx = this.#highlightIdx;
    const len = items.length;

    // Find next valid item
    for (let step = 0; step < len; step++) {
      idx += direction;
      if (idx < 0) idx = len - 1;
      if (idx >= len) idx = 0;
      const item = items[idx];
      if (!item.separator && !item.disabled) {
        this.#highlightIdx = idx;
        this._updateHighlight();
        return;
      }
    }
  }

  _updateHighlight() {
    const spans = this._menu.querySelectorAll('.item');
    for (const span of spans) {
      const i = parseInt(span.dataset.index, 10);
      span.classList.toggle('highlighted', i === this.#highlightIdx);
    }
  }
}

customElements.define('base-context-menu', BaseContextMenu);
