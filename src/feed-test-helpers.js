// Shared jsdom harness for the feed windowing and archive-load tests
import { vi } from 'vitest';
import { dayOf } from './dates.js';

/** @import { AppData, Entry } from './types.js' */

// jsdom has no IntersectionObserver/ResizeObserver and no layout. This IO stub
// records its instances so a test can fire the callback as if the sentinel
// scrolled into view, and tracks disconnect().
/** @type {FakeIntersectionObserver[]} */
export const ioInstances = [];
export class FakeIntersectionObserver {
  /** @param {(entries: { isIntersecting: boolean }[]) => void} cb */
  constructor(cb) {
    this.cb = cb;
    /** @type {Element[]} */
    this.targets = [];
    this.disconnected = false;
    ioInstances.push(this);
  }
  /** @param {Element} el */
  observe(el) { this.targets.push(el); }
  /** @param {Element} el */
  unobserve(el) { this.targets = this.targets.filter(t => t !== el); }
  disconnect() { this.disconnected = true; this.targets = []; }
  fire() { this.cb([{ isIntersecting: true }]); }
}
export class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }

/** The newest observer a render created; throws when none exists (a test failure either way). */
export function lastIo() {
  const io = ioInstances.at(-1);
  if (!io) throw new Error('no IntersectionObserver was created');
  return io;
}

// Build `n` ascending activity 'log' entries, `perDay` per calendar day, so a
// WINDOW_SIZE (200) boundary lands mid-day and exercises the seam dedup.
/**
 * @param {number} n
 * @param {number} [perDay]
 * @param {Entry[]} [extra] rows appended after the generated ones
 * @returns {AppData}
 */
export function makeData(n, perDay = 30, extra = []) {
  /** @type {Entry[]} */
  const entries = [];
  for (let i = 0; i < n; i++) {
    const day = String(1 + Math.floor(i / perDay)).padStart(2, '0');
    const min = String(i % perDay).padStart(2, '0');
    entries.push({ channel: 'activity', category: 'log', date: `2026-06-${day}T10:${min}`, nick: 'git', text: 'commit ' + i, projectSlug: undefined, projectChannel: undefined });
  }
  return {
    meta: { server: 'mase.fi', bootTime: 0 },
    projects: [],
    entries: [...entries, ...extra],
    demos: [],
    stats: {},
    hasArchive: false,
    archiveLoaded: false,
    loadFailed: false,
    archiveFailed: false,
  };
}

// makeData rows plus the archive flags renderFeed and loadArchive read.
/** @param {number} n @returns {AppData} */
export function archiveData(n) {
  const data = makeData(n);
  data.hasArchive = true;
  data.archiveLoaded = false;
  data.projects = [{ name: 'Helm', channel: 'helm', slug: 'helm', description: '', links: [], heat: 0, lastActivity: 0 }];
  return data;
}

// Settle on a macrotask, as a real fetch does. An immediately-settled mock
// would turn a regressed re-fetch loop into a microtask spin that hangs the
// runner instead of failing these tests.
/** @param {(resolve: (v?: unknown) => void, reject: (e: Error) => void) => void} settle */
export const later = (settle) => vi.fn(() => new Promise((resolve, reject) => {
  setTimeout(() => settle(resolve, reject), 0);
}));

// Distinct calendar days across a set of entries — the expected .feed-day count.
/** @param {Entry[]} entries */
export const distinctDays = (entries) => new Set(entries.map(e => dayOf(e.date))).size;

/** @returns {HTMLElement[]} */
export const rows = () => [...document.querySelectorAll('#feed .feed-row')].map(el => /** @type {HTMLElement} */ (el));
/** @returns {HTMLElement[]} */
export const dayHeaders = () => [...document.querySelectorAll('#feed .feed-day')].map(el => /** @type {HTMLElement} */ (el));
/** @returns {HTMLElement | null} */
export const sentinel = () => document.querySelector('#feed .feed-top-sentinel');

/** Install the observer stubs and a fresh #feed element; returns the element. */
export function installFeedDom() {
  ioInstances.length = 0;
  globalThis.IntersectionObserver = /** @type {typeof IntersectionObserver} */ (/** @type {unknown} */ (FakeIntersectionObserver));
  globalThis.ResizeObserver = /** @type {typeof ResizeObserver} */ (/** @type {unknown} */ (NoopResizeObserver));
  document.body.replaceChildren();
  const feed = document.createElement('div');
  feed.id = 'feed';
  document.body.appendChild(feed);
  return feed;
}

/** Undo installFeedDom plus any stubbed globals (fetch) and spies (console). */
export function removeFeedStubs() {
  Reflect.deleteProperty(globalThis, 'IntersectionObserver');
  Reflect.deleteProperty(globalThis, 'ResizeObserver');
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}

/**
 * querySelector that throws when nothing matches, typed as HTMLElement.
 * @param {ParentNode} root
 * @param {string} sel
 * @returns {HTMLElement}
 */
export function q(root, sel) {
  const el = root.querySelector(sel);
  if (!el) throw new Error(`no element matches ${sel}`);
  return /** @type {HTMLElement} */ (el);
}
