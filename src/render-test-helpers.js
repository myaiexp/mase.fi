// Typed DOM lookups and partial-data casts shared by the sidebar and pinned jsdom tests.
import { renderPinned, renderHeroLine } from './pinned.js';

/** @import { AppData } from './types.js' */

/**
 * Cast a hand-built fixture to AppData; the tests only fill the fields the code under test reads.
 * @param {object} partial
 * @returns {AppData}
 */
export function asData(partial) {
  return /** @type {AppData} */ (partial); // partial shape is on purpose
}

/**
 * Element by id; throws when missing (a missing element was already a failure).
 * @param {string} id
 * @returns {HTMLElement}
 */
export function byId(id) {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} missing`);
  return el;
}

/**
 * querySelector that throws when nothing matches.
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLElement}
 */
export function $(root, sel) {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`${sel} missing`);
  return /** @type {HTMLElement} */ (el);
}

/**
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLElement[]}
 */
export function $$(root, sel) {
  return /** @type {HTMLElement[]} */ ([...root.querySelectorAll(sel)]);
}

/**
 * renderPinned taking a partial fixture.
 * @param {string} id
 * @param {object} data
 */
export function renderPinnedWith(id, data) {
  return renderPinned(id, asData(data));
}

/**
 * renderHeroLine taking a partial fixture.
 * @param {string} id
 * @param {object} data
 */
export function renderHeroLineWith(id, data) {
  return renderHeroLine(id, asData(data));
}
