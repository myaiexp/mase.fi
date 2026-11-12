// <base-dropdown-item> and <base-dropdown-divider> — the menu rows <base-dropdown> slots in

import { MENU_DISABLED_CSS, MENU_DIVIDER_CSS, MENU_ITEM_CSS } from '../shared/menu-styles.js';
import { mountShadow } from '../shared/mount-shadow.js';
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
  span.disabled {${MENU_DISABLED_CSS}
  }
  :host(:focus) span:not(.disabled),
  span:not(.disabled):hover {
    background: var(--bg-hover, #27272a);
  }
`);

const itemTemplate = document.createElement('template');
itemTemplate.innerHTML = '<span><slot></slot></span>';

export class BaseDropdownItem extends HTMLElement {
  static observedAttributes = ['variant', 'disabled'];

  /** @type {HTMLSpanElement} */
  #span;

  constructor() {
    super();
    mountShadow(this, itemStyles, itemTemplate);
    this.#span = /** @type {HTMLSpanElement} */ (/** @type {ShadowRoot} */ (this.shadowRoot).querySelector('span'));
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
  hr {${MENU_DIVIDER_CSS}
  }
`);

const dividerTemplate = document.createElement('template');
dividerTemplate.innerHTML = '<hr>';

class BaseDropdownDivider extends HTMLElement {
  constructor() {
    super();
    mountShadow(this, dividerStyles, dividerTemplate);
  }
}

customElements.define('base-dropdown-divider', BaseDropdownDivider);
