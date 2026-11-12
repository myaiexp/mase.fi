// @vitest-environment jsdom
// renderFeed switch-time jitter: only the newest rows scramble, a search typed
// mid-jitter survives settling, and reduced-motion or an immediate render skips it.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installFeedDom, removeFeedStubs, makeData, rows } from './feed-test-helpers.js';

/** @type {typeof import('./feed.js').renderFeed} */
let renderFeed;

beforeEach(async () => {
  vi.resetModules();
  installFeedDom();
  ({ renderFeed } = await import('./feed.js'));
});

afterEach(removeFeedStubs);

// A channel switch (immediate: false) animates only the newest MAX_JITTER rows.
// playJitter owns the reduced-motion check, so this runs the real jitter.js and
// reads the `.jitter` class it tags each animating row with.
describe('renderFeed switch-time jitter', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  /** @param {boolean} matches */
  const reducedMotion = (matches) => vi.stubGlobal('matchMedia', (/** @type {string} */ query) => ({ matches, media: query }));
  const jittering = () => rows().filter((r) => r.classList.contains('jitter'));

  it('jitters exactly the newest 14 rows when motion is allowed', () => {
    reducedMotion(false);
    renderFeed('activity', makeData(30), { navigate: () => {} });
    expect(jittering()).toEqual(rows().slice(-14));
    expect(jittering().at(-1)?.dataset.raw).toBe('commit 29');
  });

  // A search typed while rows are still scrambling marks the live .msg; settling
  // has to leave those marks in place. The listener is command.js's own re-apply.
  it('a search applied mid-jitter is still highlighted once the rows settle', async () => {
    const { applySearch } = await import('./command-search.js');
    reducedMotion(false);
    const feed = /** @type {HTMLElement} */ (document.getElementById('feed'));
    let term = '';
    feed.addEventListener('feed:relayout', () => { if (term) applySearch(feed, term); });
    renderFeed('activity', makeData(30), { navigate: () => {} });

    vi.advanceTimersByTime(60); // the first rows are mid-scramble
    term = 'commit 2';
    applySearch(feed, term);
    vi.advanceTimersByTime(2000);

    expect(jittering()).toEqual([]);
    const tail = rows().slice(-14); // commit 16 … commit 29
    expect(tail.map((r) => r.querySelector('.msg')?.textContent)).toEqual(tail.map((r) => r.dataset.raw));
    const hits = tail.filter((r) => r.dataset.raw?.includes('commit 2'));
    expect(hits.map((r) => r.dataset.raw)).toEqual(Array.from({ length: 10 }, (_, i) => `commit ${20 + i}`));
    for (const r of hits) expect(r.querySelector('mark')?.textContent).toBe('commit 2');
    for (const r of tail.filter((x) => !hits.includes(x))) {
      expect(r.classList.contains('search-dim')).toBe(true);
      expect(r.querySelector('mark')).toBeNull();
    }
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
