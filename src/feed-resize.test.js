// @vitest-environment jsdom
// Resize relayout tests for renderFeed's ResizeObserver: when the .msg column
// width changes, the materialized rows are re-laid out and 'feed:relayout' fires
// so command.js re-applies search marks. jsdom has no layout or ResizeObserver,
// so the observer callback is captured, rAF is queued and flushed by hand, and
// the .msg width comes from a getBoundingClientRect spy.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installFeedDom, removeFeedStubs, makeData } from './feed-test-helpers.js';

let renderFeed;
let relayoutAll;
let feed;
let msgWidth;
let observers;
let rafQueue;

// Runs the queued animation frames, the way the browser would on the next frame.
function flushFrames() {
  const queued = rafQueue.splice(0);
  for (const cb of queued) cb(0);
}

// Simulates a resize: the observer fires, then the next frame runs.
function resizeTo(width) {
  msgWidth = width;
  observers.at(-1).cb([]);
  flushFrames();
}

beforeEach(async () => {
  vi.resetModules();
  feed = installFeedDom();
  observers = [];
  rafQueue = [];
  msgWidth = 300;

  globalThis.ResizeObserver = class {
    constructor(cb) { this.cb = cb; this.targets = []; observers.push(this); }
    observe(el) { this.targets.push(el); }
    unobserve() {}
    disconnect() {}
  };
  vi.stubGlobal('requestAnimationFrame', (cb) => rafQueue.push(cb));
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockImplementation(() => ({ width: msgWidth, height: 0, top: 0, left: 0, right: msgWidth, bottom: 0 }));

  relayoutAll = vi.fn();
  vi.doMock('./feed-layout.js', () => ({
    relayoutAll,
    measureFeedMetrics: () => ({ msgWidth, font: '13px monospace' }),
    layoutRow: () => {},
  }));
  ({ renderFeed } = await import('./feed.js'));
});

afterEach(() => {
  vi.doUnmock('./feed-layout.js');
  removeFeedStubs();
});

// Renders at the current msgWidth and returns a counter of later relayout events;
// the render's own relayoutAll + event are cleared so only resize effects count.
function renderAndWatch() {
  renderFeed('activity', makeData(20), { immediate: true, navigate: () => {} });
  relayoutAll.mockClear();
  const events = vi.fn();
  feed.addEventListener('feed:relayout', events);
  return events;
}

describe('renderFeed resize relayout', () => {
  it('observes the feed element once, across re-renders', () => {
    renderFeed('activity', makeData(20), { immediate: true, navigate: () => {} });
    renderFeed('activity', makeData(20), { immediate: true, navigate: () => {} });
    expect(observers).toHaveLength(1);
    expect(observers[0].targets).toEqual([feed]);
  });

  it('relays out and fires feed:relayout once when the .msg width changes', () => {
    const events = renderAndWatch();
    resizeTo(500);
    expect(relayoutAll).toHaveBeenCalledOnce();
    expect(relayoutAll).toHaveBeenCalledWith(feed);
    expect(events).toHaveBeenCalledOnce();
  });

  it('does nothing when the width matches the width seeded at render', () => {
    const events = renderAndWatch();
    resizeTo(300);
    expect(relayoutAll).not.toHaveBeenCalled();
    expect(events).not.toHaveBeenCalled();
  });

  it('tracks the last width, so a repeat of the new width is a no-op', () => {
    const events = renderAndWatch();
    resizeTo(500);
    resizeTo(500);
    expect(relayoutAll).toHaveBeenCalledOnce();
    expect(events).toHaveBeenCalledOnce();
  });

  it('skips a zero width (feed hidden or detached)', () => {
    const events = renderAndWatch();
    resizeTo(0);
    expect(relayoutAll).not.toHaveBeenCalled();
    expect(events).not.toHaveBeenCalled();
  });

  it('coalesces observer callbacks within one frame into a single relayout', () => {
    const events = renderAndWatch();
    msgWidth = 400;
    observers[0].cb([]);
    observers[0].cb([]);
    observers[0].cb([]);
    expect(rafQueue).toHaveLength(1);
    flushFrames();
    expect(relayoutAll).toHaveBeenCalledOnce();
    expect(events).toHaveBeenCalledOnce();
    // The frame cleared the debounce, so the next resize schedules again.
    resizeTo(600);
    expect(relayoutAll).toHaveBeenCalledTimes(2);
  });
});
