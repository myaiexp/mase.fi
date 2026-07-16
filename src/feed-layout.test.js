// @vitest-environment jsdom
// Unit tests for the pretext-driven feed-row layout: layoutRow()'s normal
// (pretext-succeeds) path plus its two fallback branches — zero/negative width
// (pretext never invoked) and pretext throwing (caught -> renderFallback) — and
// the measureFeedMetrics / relayoutAll helpers. @chenglou/pretext/rich-inline is
// fully mocked so each branch (incl. the regression-prone fallbacks) is driven
// deterministically without depending on real text measurement.
import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the rich-inline subpath the module under test imports. These vi.fn()s let
// each test choose: succeed (normal path) or throw (catch -> fallback).
vi.mock('@chenglou/pretext/rich-inline', () => ({
  prepareRichInline: vi.fn(),
  walkRichInlineLineRanges: vi.fn(),
  materializeRichInlineLineRange: vi.fn(),
}));

import {
  prepareRichInline,
  walkRichInlineLineRanges,
  materializeRichInlineLineRange,
} from '@chenglou/pretext/rich-inline';
import { layoutRow, measureFeedMetrics, relayoutAll } from './feed-layout.js';

const FONT = '13px monospace';

// Build a .feed-row with a .msg child and the dataset attrs buildItems reads.
function makeRow({ raw = '', project = '', target = '', feature = false } = {}) {
  const row = document.createElement('div');
  row.className = 'feed-row';
  if (feature) row.classList.add('cat-feature');
  if (raw) row.dataset.raw = raw;
  if (project) row.dataset.project = project;
  if (target) row.dataset.target = target;
  const msg = document.createElement('span');
  msg.className = 'msg';
  row.appendChild(msg);
  return row;
}

// Drive the pretext mocks down the success path: prepareRichInline returns an
// opaque token, walkRichInlineLineRanges emits one range per line, and
// materializeRichInlineLineRange returns the supplied fragments for each line
// (cycling so multi-row relayout reuses the same fragment list).
function setNormalPath(fragmentsPerLine) {
  prepareRichInline.mockReturnValue({ ok: true });
  walkRichInlineLineRanges.mockImplementation((prepared, width, cb) => {
    for (let i = 0; i < fragmentsPerLine.length; i++) cb({ line: i });
  });
  let i = 0;
  materializeRichInlineLineRange.mockImplementation(() => ({
    fragments: fragmentsPerLine[i++ % fragmentsPerLine.length],
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('layoutRow — normal (pretext) path', () => {
  it('renders a flat list of .line spans with proj-pill, star, and bare-text fragments', () => {
    const row = makeRow({ raw: 'shipped a thing', project: 'explorer', target: '/explorer', feature: true });
    const msg = row.querySelector('.msg');
    msg.textContent = 'stale content'; // proves replaceChildren() wipes prior content
    msg.dataset.searchOn = '1'; // proves the searchOn flag is cleared
    document.body.appendChild(row);

    // buildItems for a feature+project row -> [ '#explorer', '★ ', body ]
    setNormalPath([[
      { itemIndex: 0, text: '#explorer', gapBefore: 0 },
      { itemIndex: 1, text: '★ ', gapBefore: 0 },
      { itemIndex: 2, text: 'shipped a thing', gapBefore: 0 },
    ]]);

    layoutRow(row, 300, FONT);

    const lines = msg.querySelectorAll('.line');
    expect(lines.length).toBe(1);

    const pill = msg.querySelector('.line .proj-pill');
    expect(pill).not.toBeNull();
    expect(pill.textContent).toBe('#explorer');
    expect(pill.dataset.target).toBe('/explorer');

    const star = msg.querySelector('.line .star');
    expect(star).not.toBeNull();
    expect(star.textContent).toBe('★ ');

    // body rendered as a bare text node inside the line (no wrapper element)
    expect(msg.textContent).toContain('shipped a thing');
    expect(msg.textContent).not.toContain('stale content');
    expect(msg.dataset.searchOn).toBeUndefined();

    // pretext fed the buildItems output at the requested width
    expect(prepareRichInline).toHaveBeenCalledTimes(1);
    const items = prepareRichInline.mock.calls[0][0];
    expect(items.map(i => i.text)).toEqual(['#explorer', '★ ', 'shipped a thing']);
    expect(walkRichInlineLineRanges.mock.calls[0][1]).toBe(300);
  });

  it('renders a gapBefore fragment as a span with margin-left', () => {
    const row = makeRow({ raw: 'body text', project: 'explorer' });
    const msg = row.querySelector('.msg');
    document.body.appendChild(row);

    // itemIndex 1 = body item: not a pill (no '#'), not a star, gapBefore>0 -> span
    setNormalPath([[{ itemIndex: 1, text: 'body', gapBefore: 6 }]]);

    layoutRow(row, 300, FONT);

    const span = msg.querySelector('.line span');
    expect(span).not.toBeNull();
    expect(span.className).toBe(''); // neither proj-pill nor star
    expect(span.textContent).toBe('body');
    expect(span.style.marginLeft).toBe('6px');
  });

  it('omits data-target on the pill when the row has no target', () => {
    const row = makeRow({ raw: 'no target', project: 'explorer' });
    const msg = row.querySelector('.msg');
    document.body.appendChild(row);

    setNormalPath([[{ itemIndex: 0, text: '#explorer', gapBefore: 0 }]]);

    layoutRow(row, 300, FONT);

    const pill = msg.querySelector('.proj-pill');
    expect(pill).not.toBeNull();
    expect(pill.dataset.target).toBeUndefined();
  });

  it('emits one .line span per range the walker yields', () => {
    const row = makeRow({ raw: 'two lines', project: 'explorer' });
    const msg = row.querySelector('.msg');
    document.body.appendChild(row);

    setNormalPath([
      [{ itemIndex: 1, text: 'two', gapBefore: 0 }],
      [{ itemIndex: 1, text: 'lines', gapBefore: 0 }],
    ]);

    layoutRow(row, 300, FONT);

    expect(msg.querySelectorAll('.line').length).toBe(2);
    expect(materializeRichInlineLineRange).toHaveBeenCalledTimes(2);
  });
});

describe('layoutRow — zero/negative-width fallback (pretext not invoked)', () => {
  for (const width of [0, -10, NaN, undefined]) {
    it(`renders plain-text fallback at width=${String(width)} without calling pretext`, () => {
      const row = makeRow({ raw: 'fallback body', project: 'explorer', target: '/explorer', feature: true });
      const msg = row.querySelector('.msg');
      document.body.appendChild(row);

      layoutRow(row, width, FONT);

      const pill = msg.querySelector('.proj-pill');
      expect(pill).not.toBeNull();
      expect(pill.textContent).toBe('#explorer');
      expect(pill.dataset.target).toBe('/explorer');

      expect(msg.querySelector('.star')).not.toBeNull();
      expect(msg.textContent).toContain('fallback body');
      expect(msg.querySelector('.line')).toBeNull(); // not the pretext path

      // pretext must never be touched on the zero-width branch
      expect(prepareRichInline).not.toHaveBeenCalled();
      expect(walkRichInlineLineRanges).not.toHaveBeenCalled();
    });
  }

  it('omits the pill and star when the row has neither project nor feature', () => {
    const row = makeRow({ raw: 'plain line' });
    const msg = row.querySelector('.msg');
    document.body.appendChild(row);

    layoutRow(row, 0, FONT);

    expect(msg.querySelector('.proj-pill')).toBeNull();
    expect(msg.querySelector('.star')).toBeNull();
    expect(msg.textContent).toBe('plain line');
  });
});

describe('layoutRow — pretext-throws fallback (caught -> renderFallback)', () => {
  it('falls back to plain text when prepareRichInline throws, without walking ranges', () => {
    prepareRichInline.mockImplementation(() => {
      throw new Error('pretext boom');
    });

    const row = makeRow({ raw: 'caught body', project: 'explorer' });
    const msg = row.querySelector('.msg');
    document.body.appendChild(row);

    expect(() => layoutRow(row, 300, FONT)).not.toThrow();

    expect(prepareRichInline).toHaveBeenCalledTimes(1);
    // the throw short-circuits before any range walking / materializing
    expect(walkRichInlineLineRanges).not.toHaveBeenCalled();
    expect(materializeRichInlineLineRange).not.toHaveBeenCalled();

    const pill = msg.querySelector('.proj-pill');
    expect(pill).not.toBeNull();
    expect(pill.textContent).toBe('#explorer');
    expect(msg.querySelector('.star')).toBeNull(); // not a feature row
    expect(msg.textContent).toContain('caught body');
    expect(msg.querySelector('.line')).toBeNull();
  });
});

describe('layoutRow — early returns', () => {
  it('does nothing (no throw) when the row has no .msg', () => {
    const row = document.createElement('div');
    row.className = 'feed-row';
    row.dataset.raw = 'orphan';
    document.body.appendChild(row);

    expect(() => layoutRow(row, 300, FONT)).not.toThrow();
    expect(prepareRichInline).not.toHaveBeenCalled();
  });

  it('clears .msg and skips pretext when there is no text to lay out', () => {
    const row = makeRow(); // no project, no raw, not a feature -> only an empty body item
    const msg = row.querySelector('.msg');
    msg.textContent = 'leftover';
    document.body.appendChild(row);

    layoutRow(row, 300, FONT);

    expect(msg.textContent).toBe('');
    expect(prepareRichInline).not.toHaveBeenCalled();
  });
});

describe('measureFeedMetrics', () => {
  it('returns null when the feed has no .feed-row .msg probe', () => {
    const feed = document.createElement('div');
    document.body.appendChild(feed);
    expect(measureFeedMetrics(feed)).toBeNull();
  });

  it('returns the probe font and measured column width', () => {
    const feed = document.createElement('div');
    feed.appendChild(makeRow({ raw: 'probe' }));
    document.body.appendChild(feed);

    const probe = feed.querySelector('.feed-row .msg');
    probe.getBoundingClientRect = () => ({ width: 250 });

    const m = measureFeedMetrics(feed);
    expect(m).not.toBeNull();
    expect(m.msgWidth).toBe(250);
    expect(typeof m.font).toBe('string');
  });
});

describe('relayoutAll', () => {
  it('returns early without laying out when there is no probe', () => {
    const feed = document.createElement('div');
    document.body.appendChild(feed);

    relayoutAll(feed);
    expect(prepareRichInline).not.toHaveBeenCalled();
  });

  it('returns early when the measured width is zero', () => {
    const feed = document.createElement('div');
    feed.appendChild(makeRow({ raw: 'a' }));
    document.body.appendChild(feed);

    const probe = feed.querySelector('.feed-row .msg');
    probe.getBoundingClientRect = () => ({ width: 0 });

    relayoutAll(feed);
    expect(prepareRichInline).not.toHaveBeenCalled();
  });

  it('lays out every feed row at the uniform measured width', () => {
    const feed = document.createElement('div');
    feed.appendChild(makeRow({ raw: 'first' }));
    feed.appendChild(makeRow({ raw: 'second' }));
    document.body.appendChild(feed);

    const probe = feed.querySelector('.feed-row .msg');
    probe.getBoundingClientRect = () => ({ width: 300 });

    setNormalPath([[{ itemIndex: 0, text: 'x', gapBefore: 0 }]]);

    relayoutAll(feed);

    // one layoutRow -> one walk per row
    expect(walkRichInlineLineRanges).toHaveBeenCalledTimes(2);
    expect(walkRichInlineLineRanges.mock.calls[0][1]).toBe(300);
    for (const msg of feed.querySelectorAll('.feed-row .msg')) {
      expect(msg.querySelector('.line')).not.toBeNull();
    }
  });
});
