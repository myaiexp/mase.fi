// Shared jsdom mount and query helpers for the <base-tabs> test files

/**
 * @typedef {HTMLElement & {
 *   readonly activeIndex: number,
 *   selectTab: (index: number) => void,
 *   _updateTabs: () => void,
 * }} TabsEl
 */
/** @typedef {{ label: string, active?: boolean, disabled?: boolean, content?: string }} TabDef */

// Helper: create a <base-tabs> with N <base-tab> children and append to body.
// Returns { tabs, tabEls } where tabEls are the <base-tab> elements.
/** @param {TabDef[]} [defs] */
export function createTabs(defs = []) {
  const tabs = /** @type {TabsEl} */ (document.createElement('base-tabs'));
  for (const def of defs) {
    const tab = document.createElement('base-tab');
    tab.setAttribute('label', def.label);
    if (def.active) tab.setAttribute('active', '');
    if (def.disabled) tab.setAttribute('disabled', '');
    tab.textContent = def.content ?? def.label + ' content';
    tabs.appendChild(tab);
  }
  document.body.appendChild(tabs);
  // Trigger initial scan (slotchange does not fire in jsdom)
  tabs._updateTabs();
  return { tabs, tabEls: /** @type {HTMLElement[]} */ (Array.from(tabs.querySelectorAll('base-tab'))) };
}

/**
 * Shadow-DOM query that throws when the element is missing.
 * @param {HTMLElement} tabs
 * @param {string} sel
 * @returns {HTMLElement}
 */
export function shadowQ(tabs, sel) {
  const found = /** @type {ShadowRoot} */ (tabs.shadowRoot).querySelector(sel);
  if (!found) throw new Error(`${sel} missing`);
  return /** @type {HTMLElement} */ (found);
}

/**
 * @param {HTMLElement} tabs
 * @param {string} sel
 * @returns {HTMLElement[]}
 */
export function shadowAll(tabs, sel) {
  return /** @type {HTMLElement[]} */ ([...(/** @type {ShadowRoot} */ (tabs.shadowRoot)).querySelectorAll(sel)]);
}

/** @param {HTMLElement} tabs */
export function tabButtons(tabs) {
  return shadowAll(tabs, '[role="tablist"] button');
}

/**
 * Record the `detail` of every `tab-change` event.
 * @param {HTMLElement} tabs
 * @returns {Array<{ index: number, label: string }>}
 */
export function collectTabChanges(tabs) {
  /** @type {Array<{ index: number, label: string }>} */
  const events = [];
  tabs.addEventListener('tab-change', (e) => events.push(/** @type {CustomEvent} */ (e).detail));
  return events;
}
