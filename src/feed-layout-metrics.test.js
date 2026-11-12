// @vitest-environment jsdom
// measureFeedMetrics and relayoutAll: probe lookup, early returns, uniform-width relayout.
// @chenglou/pretext/rich-inline is mocked as in feed-layout.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@chenglou/pretext/rich-inline', () => ({
  prepareRichInline: vi.fn(),
  walkRichInlineLineRanges: vi.fn(),
  materializeRichInlineLineRange: vi.fn(),
}));

import { prepareRichInline, walkRichInlineLineRanges } from '@chenglou/pretext/rich-inline';
import { measureFeedMetrics, relayoutAll } from './feed-layout.js';
import { makeRow, setNormalPath } from './feed-layout-test-helpers.js';
import { q } from './feed-test-helpers.js';

beforeEach(() => {
  vi.clearAllMocks();
  document.body.replaceChildren();
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

    const probe = q(feed, '.feed-row .msg');
    probe.getBoundingClientRect = () => /** @type {DOMRect} */ ({ width: 250 }); // only width is read

    const m = measureFeedMetrics(feed);
    expect(m).not.toBeNull();
    expect(m?.msgWidth).toBe(250);
    expect(typeof m?.font).toBe('string');
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

    const probe = q(feed, '.feed-row .msg');
    probe.getBoundingClientRect = () => /** @type {DOMRect} */ ({ width: 0 }); // only width is read

    relayoutAll(feed);
    expect(prepareRichInline).not.toHaveBeenCalled();
  });

  it('lays out every feed row at the uniform measured width', () => {
    const feed = document.createElement('div');
    feed.appendChild(makeRow({ raw: 'first' }));
    feed.appendChild(makeRow({ raw: 'second' }));
    document.body.appendChild(feed);

    const probe = q(feed, '.feed-row .msg');
    probe.getBoundingClientRect = () => /** @type {DOMRect} */ ({ width: 300 }); // only width is read

    setNormalPath([[{ itemIndex: 0, text: 'x', gapBefore: 0 }]]);

    relayoutAll(feed);

    // one layoutRow -> one walk per row
    expect(walkRichInlineLineRanges).toHaveBeenCalledTimes(2);
    expect(vi.mocked(walkRichInlineLineRanges).mock.calls[0]?.[1]).toBe(300);
    for (const msg of feed.querySelectorAll('.feed-row .msg')) {
      expect(msg.querySelector('.line')).not.toBeNull();
    }
  });
});
