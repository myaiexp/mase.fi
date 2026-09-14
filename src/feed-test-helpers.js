// Shared jsdom harness for the feed windowing and archive-load tests
import { vi } from 'vitest';
import { dayOf } from './dates.js';

// jsdom has no IntersectionObserver/ResizeObserver and no layout. This IO stub
// records its instances so a test can fire the callback as if the sentinel
// scrolled into view, and tracks disconnect().
export const ioInstances = [];
export class FakeIntersectionObserver {
  constructor(cb) { this.cb = cb; this.targets = []; this.disconnected = false; ioInstances.push(this); }
  observe(el) { this.targets.push(el); }
  unobserve(el) { this.targets = this.targets.filter(t => t !== el); }
  disconnect() { this.disconnected = true; this.targets = []; }
  fire() { this.cb([{ isIntersecting: true }]); }
}
export class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }

// Build `n` ascending activity 'log' entries, `perDay` per calendar day, so a
// WINDOW_SIZE (200) boundary lands mid-day and exercises the seam dedup.
export function makeData(n, perDay = 30) {
  const entries = [];
  for (let i = 0; i < n; i++) {
    const day = String(1 + Math.floor(i / perDay)).padStart(2, '0');
    const min = String(i % perDay).padStart(2, '0');
    entries.push({ ch: 'activity', cat: 'log', date: `2026-06-${day}T10:${min}`, nick: 'git', text: 'commit ' + i });
  }
  return { entries };
}

// Distinct calendar days across a set of entries — the expected .feed-day count.
export const distinctDays = (entries) => new Set(entries.map(e => dayOf(e.date))).size;

export const rows = () => [...document.querySelectorAll('#feed .feed-row')];
export const dayHeaders = () => [...document.querySelectorAll('#feed .feed-day')];
export const sentinel = () => document.querySelector('#feed .feed-top-sentinel');

/** Install the observer stubs and a fresh #feed element; returns the element. */
export function installFeedDom() {
  ioInstances.length = 0;
  globalThis.IntersectionObserver = FakeIntersectionObserver;
  globalThis.ResizeObserver = NoopResizeObserver;
  document.body.replaceChildren();
  const feed = document.createElement('div');
  feed.id = 'feed';
  document.body.appendChild(feed);
  return feed;
}

/** Undo installFeedDom plus any stubbed globals (fetch) and spies (console). */
export function removeFeedStubs() {
  delete globalThis.IntersectionObserver;
  delete globalThis.ResizeObserver;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
}
