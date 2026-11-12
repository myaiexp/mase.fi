// Shared jsdom harness for the smart-404 DOM-driver tests
import { vi } from 'vitest';
/** @import { Candidate, Route, Suggestion } from './notfound.js' */

// jsdom has no matchMedia; bare matchMedia(...) would ReferenceError.
/** @param {boolean} matches */
export function stubReducedMotion(matches) {
  vi.stubGlobal('matchMedia', (/** @type {string} */ query) => ({ matches, media: query }));
}

// A writable location stand-in: replace() is a spy and href writes are recorded
// instead of navigating, so a test can assert on every redirect sink.
/** @param {{ pathname?: string, search?: string, origin?: string }} [opts] */
function stubLocation({ pathname = '/missing', search = '', origin = 'https://mase.fi' } = {}) {
  const replace = vi.fn();
  /** @type {string[]} */
  const hrefWrites = [];
  const loc = {
    pathname,
    search,
    origin,
    replace,
  };
  Object.defineProperty(loc, 'href', {
    configurable: true,
    get() { return `${loc.origin}${loc.pathname}${loc.search}`; },
    set(/** @type {string} */ v) { hrefWrites.push(v); },
  });
  vi.stubGlobal('location', loc);
  return { loc, replace, hrefWrites };
}

/**
 * @param {string} tag
 * @param {string} id
 * @param {Record<string, unknown>} [extra]
 * @returns {HTMLElement}
 */
function el(tag, id, extra = {}) {
  const n = document.createElement(tag);
  n.id = id;
  Object.assign(n, extra);
  return n;
}

/** Mount the element ids notfound-page.js resolves, in their initial state. */
export function mountDom() {
  document.body.replaceChildren();
  const csegs = el('span', 'csegs');
  for (let i = 0; i < 5; i++) {
    const s = document.createElement('span');
    s.className = 'on';
    csegs.append(s);
  }
  const box = el('section', 'countbox', { hidden: true });
  box.append(
    el('span', 'clabel', { className: 'clabel', textContent: 'redirecting in' }),
    el('span', 'cnum', { textContent: '5' }),
    csegs,
    el('button', 'gobtn'),
    el('button', 'staybtn'),
  );
  const big = document.createElement('a');
  big.className = 'big';
  document.body.append(
    el('div', 'drain', { hidden: true }),
    el('div', 'ghost', { textContent: '404' }),
    el('span', 'dot'),
    el('span', 'badge', { textContent: 'HTTP 404' }),
    el('span', 'phead'),
    el('span', 'ptail'),
    el('span', 'pellip', { hidden: true }),
    el('div', 'pnote', { hidden: true }),
    el('div', 'errline', { textContent: 'error: no such page' }),
    el('div', 'tailnote', { hidden: true }),
    el('section', 'sugg'),
    box,
    el('div', 'cancelnote', { hidden: true }),
    el('span', 'fhints'),
    big,
  );
}

// Document listeners added during a test. The page's keydown/click handlers
// would otherwise leak into the next test and fire against its DOM.
/** @type {[string, EventListenerOrEventListenerObject, boolean | AddEventListenerOptions | undefined][]} */
const tracked = [];

/** @typedef {ReturnType<typeof installNotFound>} NotFoundEnv */

/** Stub location, matchMedia (motion allowed) and fetch (every request 404s),
 *  mount the page skeleton, and track document listeners. Returns the stubs. */
export function installNotFound() {
  tracked.length = 0;
  const { loc, replace, hrefWrites } = stubLocation();
  stubReducedMotion(false);
  /** @type {(url: string, opts?: RequestInit) => Promise<Record<string, unknown>>} */
  const notFound = async () => ({ ok: false, status: 404, json: async () => ({}) });
  const fetchMock = vi.fn(notFound);
  vi.stubGlobal('fetch', fetchMock);
  mountDom();
  const origAdd = document.addEventListener.bind(document);
  vi.spyOn(document, 'addEventListener').mockImplementation((type, fn, opts) => {
    tracked.push([type, fn, opts]);
    origAdd(type, fn, opts);
  });
  return { loc, replace, hrefWrites, fetchMock };
}

/** Undo installNotFound: listeners, stubbed globals, spies, fake timers, DOM. */
export function removeNotFound() {
  for (const [type, fn, opts] of tracked) document.removeEventListener(type, fn, opts);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.body.replaceChildren();
}

/**
 * Element by id; throws when missing (the test asserts it exists).
 * @param {string} id
 * @returns {HTMLElement}
 */
export function byId(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} is missing`);
  return node;
}

/**
 * First match of a selector; throws when missing (the test asserts it exists).
 * @param {string} selector
 * @param {ParentNode} [root]
 * @returns {HTMLElement}
 */
export function pick(selector, root = document) {
  const node = root.querySelector(selector);
  if (!node) throw new Error(`${selector} is missing`);
  return /** @type {HTMLElement} */ (node);
}

/** @type {Suggestion} The explorer suggestion the countdown/markup tests share. */
export const PLAN = { target: '/explorer', targetLabel: '/explorer', targetCaption: 'map explorer' };

/**
 * A fuzzy candidate (path-kind unless told otherwise).
 * @param {string} href
 * @param {string} caption
 * @param {number} distance
 * @param {Route['kind']} [kind]
 * @returns {Candidate}
 */
export function candidate(href, caption, distance, kind = 'path') {
  /** @type {Route} */
  const route = { href, label: href, caption, keys: [], kind };
  return { route, distance };
}
