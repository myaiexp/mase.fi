// Shared jsdom harness for the smart-404 DOM-driver tests
import { vi } from 'vitest';

// jsdom has no matchMedia; bare matchMedia(...) would ReferenceError.
export function stubReducedMotion(matches) {
  vi.stubGlobal('matchMedia', (query) => ({ matches, media: query }));
}

// A writable location stand-in: replace() is a spy and href writes are recorded
// instead of navigating, so a test can assert on every redirect sink.
function stubLocation({ pathname = '/missing', search = '', origin = 'https://mase.fi' } = {}) {
  const replace = vi.fn();
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
    set(v) { hrefWrites.push(v); },
  });
  vi.stubGlobal('location', loc);
  return { loc, replace, hrefWrites };
}

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
  box.append(el('span', 'cnum', { textContent: '5' }), csegs, el('button', 'gobtn'), el('button', 'staybtn'));
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
const tracked = [];

/** Stub location, matchMedia (motion allowed) and fetch (every request 404s),
 *  mount the page skeleton, and track document listeners. Returns the stubs. */
export function installNotFound() {
  tracked.length = 0;
  const { loc, replace, hrefWrites } = stubLocation();
  stubReducedMotion(false);
  const fetchMock = vi.fn(async () => ({ ok: false, status: 404, json: async () => ({}) }));
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
