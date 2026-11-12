// Shared jsdom harness for the command.js test suites (autocomplete, keys, slash
// commands, applySearch-through-initCommand, formatRelativeActivity). Each test
// file still declares its own vi.mock('./registry.js'|'./channels.js'|'./data.js')
// and per-test dynamic re-import — those must live in the importing file for
// vitest to hoist and apply them.

/** @import { AppData, Channel, Entry } from './types.js' */
/** @typedef {{ getChannels: import('vitest').Mock<() => Channel[]> }} MockRegistry */

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

// The DOM nodes initCommand resolves by id. cmd-input is the only <input>.
export function setupDom() {
  document.body.replaceChildren();
  for (const id of ['cmd', 'cmd-input', 'cmd-prompt', 'cmd-hint', 'cmd-complete', 'feed']) {
    const el = document.createElement(id === 'cmd-input' ? 'input' : 'div');
    el.id = id;
    document.body.appendChild(el);
  }
}

// Point the mocked getChannels() accessor at a fresh channel list for this test.
/**
 * @param {*} registry the vi.mock'd registry module namespace
 * @param {Partial<Channel>[]} list
 */
export function setChannels(registry, list) {
  registry.getChannels.mockReturnValue(list);
}

/**
 * @param {string} id
 * @param {string} [label]
 * @param {string} [topic]
 * @param {string} [name]
 * @returns {Pick<Channel, 'id' | 'label' | 'name' | 'topic'>}
 */
export function ch(id, label = id, topic = `${id} topic`, name = label) {
  return { id, label, name, topic };
}

// Type into the command input and fire the input event initCommand listens for.
/**
 * @param {string} value
 * @returns {HTMLInputElement}
 */
export function type(value) {
  const input = /** @type {HTMLInputElement} */ (byId('cmd-input'));
  input.value = value;
  input.dispatchEvent(new Event('input'));
  return input;
}

export const cc = () => byId('cmd-complete');
export const items = () => /** @type {HTMLElement[]} */ ([...cc().querySelectorAll('.cc-item')]);

/**
 * Minimal AppData for initCommand; the tests only fill the fields they read.
 * @param {Partial<AppData>} [partial]
 * @returns {AppData}
 */
export function appData(partial = {}) {
  return /** @type {AppData} */ (/** @type {unknown} */ (partial)); // partial shape is on purpose
}

/**
 * Stub entries carrying only a date, for the mocked entriesFor.
 * @param {string} iso
 * @returns {Entry[]}
 */
export function entriesAt(iso) {
  return /** @type {Entry[]} */ (/** @type {unknown} */ ([{ date: iso }])); // date-only on purpose
}

/**
 * @param {EventTarget} el
 * @param {string} key
 */
export function press(el, key) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

// jsdom mount helper shared by tests that stage rows in #feed for applySearch.
/**
 * @param {string} raw
 * @param {string} text
 * @returns {HTMLDivElement}
 */
export function feedRow(raw, text) {
  const row = document.createElement('div');
  row.className = 'feed-row';
  row.dataset.raw = raw;
  const msg = document.createElement('div');
  msg.className = 'msg';
  msg.textContent = text;
  row.appendChild(msg);
  return row;
}
