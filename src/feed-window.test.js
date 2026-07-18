// @vitest-environment jsdom
// Windowing tests for renderFeed: it materializes only the newest WINDOW_SIZE
// rows and lazy-loads older batches when the top sentinel intersects. jsdom has
// no IntersectionObserver/ResizeObserver and no layout, so we stub the observers
// (the IO stub is hand-fired to simulate scroll-up) and assert pure DOM structure
// — row counts, the sentinel, and day-separator seam dedup across batches.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Controllable IntersectionObserver: records instances so a test can fire the
// callback as if the sentinel scrolled into view, and tracks disconnect().
let ioInstances = [];
class FakeIntersectionObserver {
  constructor(cb) { this.cb = cb; this.targets = []; this.disconnected = false; ioInstances.push(this); }
  observe(el) { this.targets.push(el); }
  unobserve(el) { this.targets = this.targets.filter(t => t !== el); }
  disconnect() { this.disconnected = true; this.targets = []; }
  fire() { this.cb([{ isIntersecting: true }]); }
}
class NoopResizeObserver { observe() {} unobserve() {} disconnect() {} }

// Build `n` ascending activity 'log' entries, `perDay` per calendar day, so a
// WINDOW_SIZE (200) boundary lands mid-day and exercises the seam dedup.
function makeData(n, perDay = 30) {
  const entries = [];
  for (let i = 0; i < n; i++) {
    const day = String(1 + Math.floor(i / perDay)).padStart(2, '0');
    const min = String(i % perDay).padStart(2, '0');
    entries.push({ ch: 'activity', cat: 'log', date: `2026-06-${day}T10:${min}`, nick: 'git', text: 'commit ' + i });
  }
  return { entries };
}

// Distinct calendar days across a set of entries — the expected .feed-day count.
const distinctDays = (entries) => new Set(entries.map(e => e.date.slice(0, 10))).size;

const rows = () => [...document.querySelectorAll('#feed .feed-row')];
const dayHeaders = () => [...document.querySelectorAll('#feed .feed-day')];
const sentinel = () => document.querySelector('#feed .feed-top-sentinel');
let renderFeed;

beforeEach(async () => {
  vi.resetModules();
  ioInstances = [];
  globalThis.IntersectionObserver = FakeIntersectionObserver;
  globalThis.ResizeObserver = NoopResizeObserver;
  document.body.replaceChildren();
  const feed = document.createElement('div');
  feed.id = 'feed';
  document.body.appendChild(feed);
  ({ renderFeed } = await import('./feed.js'));
});

afterEach(() => {
  delete globalThis.IntersectionObserver;
  delete globalThis.ResizeObserver;
});

describe('renderFeed windowing', () => {
  it('materializes only the newest WINDOW_SIZE rows, newest last', () => {
    const data = makeData(450);
    renderFeed('activity', data, { immediate: true, navigate: () => {} });
    expect(rows().length).toBe(200);
    // Window is entries.slice(len-200) in ascending order: last row is the newest
    // entry overall, first row is entry 250 — proving we kept the tail, not the head.
    expect(rows().at(-1).dataset.raw).toBe('commit 449');
    expect(rows()[0].dataset.raw).toBe('commit 250');
  });

  it('renders a top sentinel and observes it while older entries remain', () => {
    renderFeed('activity', makeData(450), { immediate: true, navigate: () => {} });
    expect(sentinel()).toBeTruthy();
    expect(ioInstances.at(-1).targets).toContain(sentinel());
  });

  it('omits the sentinel (and never observes) when everything fits in one window', () => {
    renderFeed('activity', makeData(120), { immediate: true, navigate: () => {} });
    expect(rows().length).toBe(120);
    expect(sentinel()).toBeNull();
  });

  it('prepends the next older batch on intersection, growing the window', () => {
    renderFeed('activity', makeData(450), { immediate: true, navigate: () => {} });
    ioInstances.at(-1).fire();
    expect(rows().length).toBe(400);
    // The batch prepended above the previous window: first row is now entry 50.
    expect(rows()[0].dataset.raw).toBe('commit 50');
    expect(rows().at(-1).dataset.raw).toBe('commit 449'); // newest still anchored at the bottom
  });

  it('never duplicates a day header at the batch seam', () => {
    const data = makeData(450); // 15 days, 30/day; the 200-boundary splits day 9
    renderFeed('activity', data, { immediate: true, navigate: () => {} });
    // Newest 200 = entries 250..449.
    expect(dayHeaders().length).toBe(distinctDays(data.entries.slice(250)));
    ioInstances.at(-1).fire(); // reveal → materialized 50..449
    expect(dayHeaders().length).toBe(distinctDays(data.entries.slice(50)));
    // If the seam duplicated the shared boundary day, header count would exceed
    // the distinct-day count; asserting exact equality catches that.
  });

  it('reveals to exhaustion, then removes the sentinel and disconnects', () => {
    renderFeed('activity', makeData(450), { immediate: true, navigate: () => {} });
    const io = ioInstances.at(-1);
    io.fire(); // 200 → 400
    io.fire(); // 400 → 450 (min(600,450)) — exhausted
    expect(rows().length).toBe(450);
    expect(dayHeaders().length).toBe(distinctDays(makeData(450).entries)); // full 15 days, no dup
    expect(sentinel()).toBeNull();
    expect(io.disconnected).toBe(true);
    // A late intersection after exhaustion is a harmless no-op (sentinel gone).
    expect(() => io.fire()).not.toThrow();
    expect(rows().length).toBe(450);
  });

  it('disconnects the prior channel observer when the feed is re-rendered', () => {
    renderFeed('activity', makeData(450), { immediate: true, navigate: () => {} });
    const first = ioInstances.at(-1);
    renderFeed('activity', makeData(450), { immediate: true, navigate: () => {} });
    expect(first.disconnected).toBe(true);
  });
});
