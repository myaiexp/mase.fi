// Shared jsdom mount and query helpers for the <base-dropdown> test files

/**
 * @typedef {HTMLElement & { open: () => void, close: () => void, readonly isOpen: boolean }} DropdownEl
 */
/**
 * @typedef {object} ItemSpec
 * @property {string} value
 * @property {string} [label]
 * @property {string} [variant]
 * @property {boolean} [disabled]
 */

/**
 * @param {{ items?: Array<ItemSpec | 'divider'>, triggerText?: string }} [opts]
 * @returns {DropdownEl}
 */
export function createDropdown({ items = [], triggerText = 'Open' } = {}) {
  const el = /** @type {DropdownEl} */ (document.createElement('base-dropdown'));

  const trigger = document.createElement('button');
  trigger.setAttribute('slot', 'trigger');
  trigger.textContent = triggerText;
  el.appendChild(trigger);

  for (const item of items) {
    if (item === 'divider') {
      el.appendChild(document.createElement('base-dropdown-divider'));
    } else {
      const i = document.createElement('base-dropdown-item');
      i.setAttribute('value', item.value);
      if (item.variant) i.setAttribute('variant', item.variant);
      if (item.disabled) i.setAttribute('disabled', '');
      i.textContent = item.label ?? item.value;
      el.appendChild(i);
    }
  }

  document.body.appendChild(el);
  return el;
}

/**
 * Light-DOM query that throws when the element is missing.
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLElement}
 */
export function q(root, sel) {
  const found = root.querySelector(sel);
  if (!found) throw new Error(`${sel} missing`);
  return /** @type {HTMLElement} */ (found);
}

/**
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLElement[]}
 */
export function qa(root, sel) {
  return /** @type {HTMLElement[]} */ ([...root.querySelectorAll(sel)]);
}

/**
 * Shadow-DOM query that throws when the element is missing.
 * @param {Element} host
 * @param {string} sel
 * @returns {HTMLElement}
 */
export function sq(host, sel) {
  return q(/** @type {ShadowRoot} */ (host.shadowRoot), sel);
}

/** @param {Element} el */
export function menuOf(el) {
  return sq(el, '[part="menu"]');
}

/** @param {Element} el */
export function getTrigger(el) {
  return q(el, '[slot="trigger"]');
}

/**
 * Record the `detail` of every `select` event the element fires.
 * @param {HTMLElement} el
 * @returns {Array<{ value: string }>}
 */
export function collectSelects(el) {
  /** @type {Array<{ value: string }>} */
  const received = [];
  el.addEventListener('select', (e) => received.push(/** @type {CustomEvent} */ (e).detail));
  return received;
}

/**
 * Give an element a fixed getBoundingClientRect.
 * @param {HTMLElement} el
 * @param {{ top: number, bottom: number, left: number, right: number, width: number, height: number }} rect
 */
export function stubRect(el, rect) {
  el.getBoundingClientRect = () => /** @type {DOMRect} */ (/** @type {unknown} */ (rect));
}

/** @param {HTMLElement} el */
export function unstubRect(el) {
  delete (/** @type {Partial<HTMLElement>} */ (el).getBoundingClientRect);
}
