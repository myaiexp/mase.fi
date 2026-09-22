// <base-dropdown>, <base-dropdown-item>, <base-dropdown-divider> — accessible dropdown menu components

import { addOverlayListeners, removeOverlayListeners } from '../shared/overlay-utils.js';
import { applyMenuFlip } from '../shared/menu-flip.js';
import { wrapIndex } from '../shared/menu-nav.js';
import { MENU_ITEM_CSS, MENU_SURFACE_CSS } from '../shared/menu-styles.js';
import { shadowStyles } from '../shared/shadow-styles.js';

// ─── base-dropdown-item ──────────────────────────────────────────────────────

const itemStyles = shadowStyles(`
  :host {
    display: block;
    outline: none;
  }
  span {${MENU_ITEM_CSS}
  }
  span.danger {
    color: var(--red, #ef4444);
  }
  span.disabled {
    opacity: 0.4;
    cursor: default;
  }
  :host(:focus) span:not(.disabled),
  span:not(.disabled):hover {
    background: var(--bg-hover, #27272a);
  }
`);

const itemTemplate = document.createElement('template');
itemTemplate.innerHTML = '<span><slot></slot></span>';

class BaseDropdownItem extends HTMLElement {
  static observedAttributes = ['variant', 'disabled'];

  #span = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    itemStyles.adopt(this.shadowRoot);
    this.shadowRoot.appendChild(itemTemplate.content.cloneNode(true));
    this.#span = this.shadowRoot.querySelector('span');
  }

  connectedCallback() {
    this.setAttribute('tabindex', '-1');
    this.#syncClasses();
  }

  attributeChangedCallback() {
    this.#syncClasses();
  }

  #syncClasses() {
    const variant = this.getAttribute('variant');
    const disabled = this.hasAttribute('disabled');
    this.#span.classList.toggle('danger', variant === 'danger');
    this.#span.classList.toggle('disabled', disabled);
  }

  get disabled() {
    return this.hasAttribute('disabled');
  }

  get value() {
    return this.getAttribute('value') ?? '';
  }
}

customElements.define('base-dropdown-item', BaseDropdownItem);

// ─── base-dropdown-divider ───────────────────────────────────────────────────

const dividerStyles = shadowStyles(`
  :host { display: block; }
  hr {
    border: none;
    border-top: 1px solid var(--border-color, #27272a);
    margin: 4px 0;
  }
`);

const dividerTemplate = document.createElement('template');
dividerTemplate.innerHTML = '<hr>';

class BaseDropdownDivider extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    dividerStyles.adopt(this.shadowRoot);
    this.shadowRoot.appendChild(dividerTemplate.content.cloneNode(true));
  }
}

customElements.define('base-dropdown-divider', BaseDropdownDivider);

// ─── base-dropdown ───────────────────────────────────────────────────────────

const dropdownStyles = shadowStyles(`
  :host {
    display: inline-block;
    position: relative;
    font-family: var(--font-mono, monospace);
  }
  [part="menu"] {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 100;
    min-width: 160px;${MENU_SURFACE_CSS}
  }
  [part="menu"].flip {
    top: auto;
    bottom: 100%;
  }
  [part="menu"][hidden] {
    display: none;
  }
`);

const dropdownTemplate = document.createElement('template');
dropdownTemplate.innerHTML = `<slot name="trigger"></slot>
<div part="menu" hidden>
  <slot name="items"></slot>
</div>`;

class BaseDropdown extends HTMLElement {
  // Member convention (library-wide — see docs/base-components.md): `#member` is
  // hard-private internal state; `_member` is deliberately reachable by a friend
  // module or test. This component has no friend module, so every member is #.
  #open = false;
  // Items already wired with click/keydown listeners. A WeakSet keyed on the
  // element avoids stamping a bookkeeping flag onto the public DOM node (which
  // would survive detach/reattach and leak into the element's namespace) and
  // lets GC reclaim removed items.
  #boundItems = new WeakSet();
  #menu = null;
  #observer = null;
  #trigger = null;
  #onTriggerClick = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    dropdownStyles.adopt(this.shadowRoot);
    this.shadowRoot.appendChild(dropdownTemplate.content.cloneNode(true));
    this.#menu = this.shadowRoot.querySelector('[part="menu"]');
  }

  connectedCallback() {
    // Scan for trigger element — slotchange doesn't fire in jsdom
    this.#bindTrigger();

    // Also bind items — forward keydown events for arrow/enter navigation
    this.#bindItems();

    // Watch for dynamically added children (items added after connectedCallback)
    this.#observer = new MutationObserver(() => {
      this.#bindTrigger();
      this.#bindItems();
    });
    this.#observer.observe(this, { childList: true });
  }

  disconnectedCallback() {
    removeOverlayListeners(this);
    this.#observer?.disconnect();
  }

  #bindTrigger() {
    const trigger = this.querySelector('[slot="trigger"]');
    if (trigger && trigger !== this.#trigger) {
      this.#trigger?.removeEventListener('click', this.#onTriggerClick);
      this.#trigger = trigger;
      this.#onTriggerClick = (e) => {
        e.stopPropagation();
        this.isOpen ? this.close() : this.open();
      };
      this.#trigger.addEventListener('click', this.#onTriggerClick);
    }
  }

  #bindItems() {
    const items = this.#items();
    for (const item of items) {
      if (!this.#boundItems.has(item)) {
        this.#boundItems.add(item);
        item.addEventListener('click', () => this.#selectItem(item));
        item.addEventListener('keydown', (e) => this.#onItemKeydown(e, item));
      }
    }
  }

  #items() {
    return [...this.querySelectorAll('base-dropdown-item')];
  }

  #selectItem(item) {
    if (item.disabled) return;
    this.dispatchEvent(new CustomEvent('select', {
      bubbles: true,
      detail: { value: item.value },
    }));
    this.close();
  }

  #onItemKeydown(e, item) {
    // Pre-filtered to enabled items, so wrapIndex alone lands on a valid target
    // (no skip loop). A disabled item is not in the list, so its idx of -1 wraps
    // to the first/last enabled item — the same convention menu-nav documents.
    const items = this.#items().filter(i => !i.disabled);
    const idx = items.indexOf(item);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (items.length) items[wrapIndex(idx, 1, items.length)].focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length) items[wrapIndex(idx, -1, items.length)].focus();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.#selectItem(item);
    }
  }

  open() {
    this.#open = true;

    applyMenuFlip(this, this.#menu);

    this.#menu.hidden = false;

    // Focus first enabled item
    const first = this.#items().find(i => !i.disabled);
    first?.focus();

    addOverlayListeners(this, (e) => !this.contains(e.target));
  }

  close() {
    this.#open = false;
    this.#menu.hidden = true;
    removeOverlayListeners(this);
  }

  get isOpen() {
    return this.#open;
  }
}

customElements.define('base-dropdown', BaseDropdown);
