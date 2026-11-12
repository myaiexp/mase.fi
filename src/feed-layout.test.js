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
import { layoutRow } from './feed-layout.js';
import { makeRow, setNormalPath } from './feed-layout-test-helpers.js';
import { q } from './feed-test-helpers.js';

const FONT = '13px monospace';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
});

describe('layoutRow — normal (pretext) path', () => {
  it('renders a flat list of .line spans with proj-pill and bare-text fragments, no star on feature rows', () => {
    const row = makeRow({ raw: 'shipped a thing', project: 'explorer', target: '/explorer', feature: true });
    const msg = q(row, '.msg');
    msg.textContent = 'stale content'; // proves replaceChildren() wipes prior content
    document.body.appendChild(row);

    // buildItems for a feature+project row -> [ '#explorer', body ]
    setNormalPath([[
      { itemIndex: 0, text: '#explorer', gapBefore: 0 },
      { itemIndex: 1, text: 'shipped a thing', gapBefore: 0 },
    ]]);

    layoutRow(row, 300, FONT);

    const lines = msg.querySelectorAll('.line');
    expect(lines.length).toBe(1);

    const pill = q(msg, '.line .proj-pill');
    expect(pill).not.toBeNull();
    expect(pill.textContent).toBe('#explorer');
    expect(pill.dataset.targetChannel).toBe('/explorer');

    expect(msg.textContent).not.toContain('★');

    // body rendered as a bare text node inside the line (no wrapper element)
    expect(msg.textContent).toContain('shipped a thing');
    expect(msg.textContent).not.toContain('stale content');

    // pretext fed the buildItems output at the requested width
    expect(prepareRichInline).toHaveBeenCalledTimes(1);
    const items = vi.mocked(prepareRichInline).mock.calls[0]?.[0];
    expect(items?.map(i => i.text)).toEqual(['#explorer', 'shipped a thing']);
    expect(vi.mocked(walkRichInlineLineRanges).mock.calls[0]?.[1]).toBe(300);
  });

  it('renders a gapBefore fragment as a span with margin-left', () => {
    const row = makeRow({ raw: 'body text', project: 'explorer' });
    const msg = q(row, '.msg');
    document.body.appendChild(row);

    // itemIndex 1 = body item: not a pill (no '#'), gapBefore>0 -> span
    setNormalPath([[{ itemIndex: 1, text: 'body', gapBefore: 6 }]]);

    layoutRow(row, 300, FONT);

    const span = q(msg, '.line span');
    expect(span).not.toBeNull();
    expect(span.className).toBe(''); // not a proj-pill
    expect(span.textContent).toBe('body');
    expect(span.style.marginLeft).toBe('6px');
  });

  it('omits data-target-channel on the pill when the row has no target', () => {
    const row = makeRow({ raw: 'no target', project: 'explorer' });
    const msg = q(row, '.msg');
    document.body.appendChild(row);

    setNormalPath([[{ itemIndex: 0, text: '#explorer', gapBefore: 0 }]]);

    layoutRow(row, 300, FONT);

    const pill = q(msg, '.proj-pill');
    expect(pill).not.toBeNull();
    expect(pill.dataset.targetChannel).toBeUndefined();
  });

  it('emits one .line span per range the walker yields', () => {
    const row = makeRow({ raw: 'two lines', project: 'explorer' });
    const msg = q(row, '.msg');
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
      const msg = q(row, '.msg');
      document.body.appendChild(row);

      layoutRow(row, /** @type {number} */ (width), FONT); // undefined width on purpose

      const pill = q(msg, '.proj-pill');
      expect(pill).not.toBeNull();
      expect(pill.textContent).toBe('#explorer');
      expect(pill.dataset.targetChannel).toBe('/explorer');

      expect(msg.textContent).toBe('#explorerfallback body');
      expect(msg.querySelector('.line')).toBeNull(); // not the pretext path

      // pretext must never be touched on the zero-width branch
      expect(prepareRichInline).not.toHaveBeenCalled();
      expect(walkRichInlineLineRanges).not.toHaveBeenCalled();
    });
  }

  it('omits the pill when the row has no project', () => {
    const row = makeRow({ raw: 'plain line' });
    const msg = q(row, '.msg');
    document.body.appendChild(row);

    layoutRow(row, 0, FONT);

    expect(msg.querySelector('.proj-pill')).toBeNull();
    expect(msg.textContent).toBe('plain line');
  });
});

describe('layoutRow — pretext-throws fallback (caught -> renderFallback)', () => {
  it('falls back to plain text when prepareRichInline throws, without walking ranges', () => {
    vi.mocked(prepareRichInline).mockImplementation(() => {
      throw new Error('pretext boom');
    });

    const row = makeRow({ raw: 'caught body', project: 'explorer' });
    const msg = q(row, '.msg');
    document.body.appendChild(row);

    expect(() => layoutRow(row, 300, FONT)).not.toThrow();

    expect(prepareRichInline).toHaveBeenCalledTimes(1);
    // the throw short-circuits before any range walking / materializing
    expect(walkRichInlineLineRanges).not.toHaveBeenCalled();
    expect(materializeRichInlineLineRange).not.toHaveBeenCalled();

    const pill = q(msg, '.proj-pill');
    expect(pill).not.toBeNull();
    expect(pill.textContent).toBe('#explorer');
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
    const row = makeRow(); // no project, no raw -> only an empty body item
    const msg = q(row, '.msg');
    msg.textContent = 'leftover';
    document.body.appendChild(row);

    layoutRow(row, 300, FONT);

    expect(msg.textContent).toBe('');
    expect(prepareRichInline).not.toHaveBeenCalled();
  });
});
