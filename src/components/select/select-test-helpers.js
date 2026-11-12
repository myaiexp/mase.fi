// Shared jsdom fixtures for the <base-select> suites: build a select, reach its shadow parts

/**
 * @typedef {HTMLElement & {
 *   value: string, selectedOption: HTMLElement | null, isOpen: boolean,
 *   open(): void, close(): void, disabled?: boolean, _menu: HTMLElement,
 *   _selectOption(div: HTMLElement): void,
 * }} SelectEl
 */
/** @typedef {{ value: string, label?: string, disabled?: boolean, action?: boolean }} OptionSpec */
/** @typedef {{ label: string, options: OptionSpec[] }} GroupSpec */

/**
 * @param {{ options?: OptionSpec[], groups?: GroupSpec[], placeholder?: string, searchable?: boolean, disabled?: boolean, size?: string, value?: string }} [spec]
 * @returns {SelectEl}
 */
export function createSelect({ options = [], groups = [], placeholder = '', searchable = false, disabled = false, size = '', value = '' } = {}) {
  const el = /** @type {SelectEl} */ (document.createElement('base-select'));
  if (placeholder) el.setAttribute('placeholder', placeholder);
  if (searchable) el.setAttribute('searchable', '');
  if (disabled) el.setAttribute('disabled', '');
  if (size) el.setAttribute('size', size);
  if (value) el.setAttribute('value', value);

  for (const opt of options) {
    const o = document.createElement('base-option');
    o.setAttribute('value', opt.value);
    if (opt.disabled) o.setAttribute('disabled', '');
    if (opt.action) o.setAttribute('action', '');
    o.textContent = opt.label ?? opt.value;
    el.appendChild(o);
  }

  for (const group of groups) {
    const g = document.createElement('base-option-group');
    g.setAttribute('label', group.label);
    for (const opt of group.options) {
      const o = document.createElement('base-option');
      o.setAttribute('value', opt.value);
      if (opt.disabled) o.setAttribute('disabled', '');
      o.textContent = opt.label ?? opt.value;
      g.appendChild(o);
    }
    el.appendChild(g);
  }

  document.body.appendChild(el);
  return el;
}

/**
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLElement}
 */
export function $(root, sel) {
  const found = root.querySelector(sel);
  if (!found) throw new Error(`missing element: ${sel}`);
  return /** @type {HTMLElement} */ (found);
}

/**
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLElement[]}
 */
export function $$(root, sel) {
  return [.../** @type {NodeListOf<HTMLElement>} */ (root.querySelectorAll(sel))];
}

/** @param {HTMLElement} el */
export function getMenu(el) {
  return $(/** @type {ShadowRoot} */ (el.shadowRoot), '[part="menu"]');
}

/**
 * The trigger is an input when searchable and a button otherwise; typed as the
 * input since the tests only read value/selection on the searchable form.
 * @param {HTMLElement} el
 * @returns {HTMLInputElement}
 */
export function getTrigger(el) {
  return /** @type {HTMLInputElement} */ ($(/** @type {ShadowRoot} */ (el.shadowRoot), '[part="trigger"]'));
}

/** @param {HTMLElement} el */
export function getOptions(el) {
  return [.../** @type {NodeListOf<HTMLElement>} */ (getMenu(el).querySelectorAll('.option'))];
}
