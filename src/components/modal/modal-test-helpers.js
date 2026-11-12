// Shared jsdom mount helpers for the <base-modal> test suites

/**
 * @typedef {HTMLElement & {
 *   readonly isOpen: boolean,
 *   open: () => void,
 *   close: () => void,
 *   _handleKeyDown: (e: KeyboardEvent) => void,
 *   _getFocusableElements: () => HTMLElement[],
 * }} ModalEl
 */

/**
 * @param {string} [slottedHtml]
 * @returns {ModalEl}
 */
export function createModal(slottedHtml = '') {
  const el = /** @type {ModalEl} */ (document.createElement('base-modal'));
  if (slottedHtml) el.innerHTML = slottedHtml;
  document.body.appendChild(el);
  return el;
}

/**
 * Shadow-DOM query that throws when the element is missing.
 * @param {HTMLElement} modal
 * @param {string} sel
 * @returns {HTMLElement}
 */
export function shadowEl(modal, sel) {
  const found = /** @type {ShadowRoot} */ (modal.shadowRoot).querySelector(sel);
  if (!found) throw new Error(`${sel} missing`);
  return /** @type {HTMLElement} */ (found);
}

// Build a focusable button in light DOM via createElement (security hook blocks innerHTML=)
/**
 * @param {HTMLElement} modal
 * @param {string} label
 * @param {{ disabled?: boolean, hidden?: boolean, slot?: string | null }} [opts]
 */
export function appendButton(modal, label, { disabled = false, hidden = false, slot = null } = {}) {
  const btn = document.createElement('button');
  btn.textContent = label;
  if (disabled) btn.disabled = true;
  if (hidden) btn.hidden = true;
  if (slot) btn.setAttribute('slot', slot);
  modal.appendChild(btn);
  return btn;
}
