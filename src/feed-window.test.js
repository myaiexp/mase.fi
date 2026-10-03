// @vitest-environment jsdom
// renderFeed tests: newest-WINDOW_SIZE windowing and scroll-up lazy reveal (with
// day-separator seam dedup), proj-pill chip navigation, layout-before-scroll-
// compensation ordering, and switch-time jitter. jsdom has no
// IntersectionObserver/ResizeObserver and no layout, so the observers are stubbed
// (feed-test-helpers.js; the IO stub is hand-fired to simulate scroll-up). Archive
// lazy-load lives in feed-archive.test.js.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ioInstances, installFeedDom, removeFeedStubs, makeData, distinctDays, rows, dayHeaders, sentinel,
} from './feed-test-helpers.js';

let renderFeed;

beforeEach(async () => {
  vi.resetModules();
  installFeedDom();
  ({ renderFeed } = await import('./feed.js'));
});

afterEach(removeFeedStubs);

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

// ---- project-chip click navigation (ensureChipNav) ------------------------

describe('renderFeed chip navigation', () => {
  let layoutRow;

  function chipEntry({ projectSlug, projectChannel, text = 'commit' }) {
    return {
      channel: 'activity',
      category: 'log',
      date: '2026-06-01T10:00',
      nick: 'git',
      text,
      projectSlug,
      projectChannel,
    };
  }

  // jsdom reports 0 width, so relayoutAll no-ops and pills never materialize.
  // layoutRow(0) takes the fallback path and copies row.dataset.targetChannel onto
  // the .proj-pill — the same DOM the click delegate consumes.
  function materializePills() {
    for (const row of document.querySelectorAll('#feed .feed-row')) {
      layoutRow(row, 0, '13px monospace');
    }
  }

  beforeEach(async () => {
    ({ layoutRow } = await import('./feed-layout.js'));
  });

  it('navigates to the mapped channel when a data-target-channel chip is clicked', () => {
    const navigate = vi.fn();
    renderFeed('activity', {
      entries: [chipEntry({ projectSlug: 'explorer', projectChannel: 'explorer' })],
    }, { immediate: true, navigate });
    materializePills();

    const pill = document.querySelector('.proj-pill[data-target-channel]');
    expect(pill).toBeTruthy();
    expect(pill.dataset.targetChannel).toBe('explorer');
    pill.click();
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('explorer');
  });

  it('does not navigate when an unmapped pill (no data-target-channel) is clicked', () => {
    const navigate = vi.fn();
    renderFeed('activity', {
      entries: [chipEntry({ projectSlug: 'secret-tool' })],
    }, { immediate: true, navigate });
    materializePills();

    const pill = document.querySelector('.proj-pill');
    expect(pill).toBeTruthy();
    expect(pill.dataset.targetChannel).toBeUndefined();
    pill.click();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not stack click listeners across re-renders of the same feed', () => {
    const navigate = vi.fn();
    const data = {
      entries: [chipEntry({ projectSlug: 'explorer', projectChannel: 'explorer' })],
    };
    renderFeed('activity', data, { immediate: true, navigate });
    materializePills();
    renderFeed('activity', data, { immediate: true, navigate });
    materializePills();

    document.querySelector('.proj-pill[data-target-channel]').click();
    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith('explorer');
  });
});

// jsdom has no layout, so we cannot assert pixel heights. We CAN pin the
// call order that makes those heights correct: layoutRow must run on the
// prepended rows before revealOlder reads scrollHeight for compensation.
describe('revealOlder lays out before scroll compensation', () => {
  let order;
  let localRender;

  beforeEach(async () => {
    vi.resetModules();
    order = [];
    const feed = installFeedDom();

    vi.doMock('./feed-layout.js', () => ({
      relayoutAll: () => { order.push('relayoutAll'); },
      measureFeedMetrics: () => {
        order.push('measure');
        return { msgWidth: 80, font: '13px monospace' };
      },
      layoutRow: () => { order.push('layout'); },
    }));

    ({ renderFeed: localRender } = await import('./feed.js'));

    let scrollTop = 0;
    Object.defineProperty(feed, 'scrollTop', {
      configurable: true,
      get: () => scrollTop,
      set: (v) => { order.push('scroll'); scrollTop = v; },
    });
    Object.defineProperty(feed, 'scrollHeight', {
      configurable: true,
      get: () => 1000,
    });
  });

  afterEach(() => {
    vi.doUnmock('./feed-layout.js');
  });

  it('calls layoutRow on prepended rows before adjusting scrollTop', () => {
    localRender('activity', makeData(450), { immediate: true, navigate: () => {} });
    const start = order.length;
    ioInstances.at(-1).fire();
    const reveal = order.slice(start);
    const firstLayout = reveal.indexOf('layout');
    const firstScroll = reveal.indexOf('scroll');
    expect(firstLayout).toBeGreaterThanOrEqual(0);
    expect(firstScroll).toBeGreaterThanOrEqual(0);
    expect(firstLayout).toBeLessThan(firstScroll);
  });
});

// A channel switch (immediate: false) animates only the newest MAX_JITTER rows.
// playJitter owns the reduced-motion check, so this runs the real jitter.js and
// reads the `.jitter` class it tags each animating row with.
describe('renderFeed switch-time jitter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  const reducedMotion = (matches) => vi.stubGlobal('matchMedia', (query) => ({ matches, media: query }));
  const jittering = () => rows().filter((r) => r.classList.contains('jitter'));

  it('jitters exactly the newest 14 rows when motion is allowed', () => {
    reducedMotion(false);
    renderFeed('activity', makeData(30), { navigate: () => {} });
    expect(jittering()).toEqual(rows().slice(-14));
    expect(jittering().at(-1).dataset.raw).toBe('commit 29');
  });

  it('jitters nothing under prefers-reduced-motion', () => {
    reducedMotion(true);
    renderFeed('activity', makeData(30), { navigate: () => {} });
    expect(rows().length).toBe(30);
    expect(jittering()).toEqual([]);
  });

  it('jitters nothing on an immediate render', () => {
    reducedMotion(false);
    renderFeed('activity', makeData(30), { immediate: true, navigate: () => {} });
    expect(jittering()).toEqual([]);
  });
});
