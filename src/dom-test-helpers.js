// Typed DOM lookups for jsdom tests: a missing element throws, never returns null

/**
 * The first match for `sel` under `root`. A miss throws with the selector, which
 * reads better in a failure than the TypeError a null dereference would give.
 * @param {string} sel
 * @param {ParentNode} [root]
 * @returns {HTMLElement}
 */
export function $(sel, root = document) {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`no element matches ${sel}`);
  return /** @type {HTMLElement} */ (el);
}

/**
 * Every match for `sel` under `root`, as an array.
 * @param {string} sel
 * @param {ParentNode} [root]
 * @returns {HTMLElement[]}
 */
export function $$(sel, root = document) {
  return /** @type {HTMLElement[]} */ ([...root.querySelectorAll(sel)]);
}

/**
 * A custom element's open shadow root. Throws when it has none, which in these
 * tests means the element never upgraded.
 * @param {Element} el
 * @returns {ShadowRoot}
 */
export function shadow(el) {
  if (!el.shadowRoot) throw new Error(`<${el.localName}> has no shadow root`);
  return el.shadowRoot;
}
