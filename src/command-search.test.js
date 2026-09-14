// @vitest-environment jsdom
// applySearch on rows shaped like renderFeed's output: the real layoutRow builds
// .line spans holding .proj-pill / .star elements and bare body text nodes.
// pretext is mocked so each test chooses where the lines break.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('@chenglou/pretext/rich-inline', () => ({
  prepareRichInline: vi.fn(() => ({})),
  walkRichInlineLineRanges: vi.fn(),
  materializeRichInlineLineRange: vi.fn(),
}));

import { walkRichInlineLineRanges, materializeRichInlineLineRange } from '@chenglou/pretext/rich-inline';
import { layoutRow } from './feed-layout.js';
import { applySearch } from './command-search.js';

// One pretext fragment; itemIndex points into buildItems' list [pill?, star?, body].
const frag = (itemIndex, text, gapBefore = 0) => ({ itemIndex, text, gapBefore });

// A node's children as text, <mark> runs bracketed: ['x ', '[ab]', ' z'].
const shape = (el) => [...el.childNodes].map((n) => (n.nodeName === 'MARK' ? `[${n.textContent}]` : n.textContent));

const dimmed = (row) => row.classList.contains('search-dim');

let feed;

// A .feed-row as populateRow leaves it, laid out by layoutRow with pretext
// returning `lines` (one fragment array per line), appended to the feed.
function addRow({ raw, project = '', feature = false, lines }) {
  const row = document.createElement('div');
  row.className = `feed-row cat-${feature ? 'feature' : 'log'}`;
  row.dataset.raw = raw;
  if (project) row.dataset.project = project;
  const msg = document.createElement('div');
  msg.className = 'msg';
  row.append(msg);
  walkRichInlineLineRanges.mockImplementationOnce((prepared, width, cb) => lines.forEach((_, i) => cb(i)));
  materializeRichInlineLineRange.mockImplementation((prepared, i) => ({ fragments: lines[i] }));
  layoutRow(row, 300, '13px monospace');
  feed.append(row);
  return row;
}

beforeEach(() => {
  document.getElementById('search-dim-style')?.remove();
  document.body.replaceChildren();
  feed = document.createElement('div');
  document.body.append(feed);
});

describe('applySearch on laid-out feed rows', () => {
  it('marks a mixed-case substring in its own casing and dims rows that miss', () => {
    const hit = addRow({ raw: 'Shipped the WORLD map', lines: [[frag(0, 'Shipped the WORLD map')]] });
    const miss = addRow({ raw: 'goodbye moon', lines: [[frag(0, 'goodbye moon')]] });
    applySearch(feed, 'world');
    expect(shape(hit.querySelector('.msg > .line'))).toEqual(['Shipped the ', '[WORLD]', ' map']);
    expect(dimmed(hit)).toBe(false);
    expect(dimmed(miss)).toBe(true);
    expect(miss.querySelector('mark')).toBeNull();
  });

  it('wraps every hit in a text node, with and without text before it', () => {
    const row = addRow({ raw: 'ab x ab y ab z', lines: [[frag(0, 'ab x ab y ab z')]] });
    applySearch(feed, 'ab');
    expect(shape(row.querySelector('.line'))).toEqual(['[ab]', ' x ', '[ab]', ' y ', '[ab]', ' z']);
  });

  it('highlights inside the pill and a gap-offset body span, leaving elements intact', () => {
    const row = addRow({
      raw: 'fixed the helm tabs',
      project: 'helm',
      feature: true,
      lines: [[frag(0, '#helm'), frag(1, '★ '), frag(2, 'fixed the helm tabs', 4)]],
    });
    applySearch(feed, 'helm');
    const line = row.querySelector('.msg > .line');
    const [pill, star, body] = line.children;
    expect(line.children).toHaveLength(3);
    expect(pill.className).toBe('proj-pill');
    expect(shape(pill)).toEqual(['#', '[helm]']);
    expect(star.className).toBe('star');
    expect(shape(star)).toEqual(['★ ']);
    expect(shape(body)).toEqual(['fixed the ', '[helm]', ' tabs']);
  });

  it('leaves a match that straddles a line break unmarked but the row undimmed', () => {
    const row = addRow({ raw: 'deploy pipeline', lines: [[frag(0, 'deploy ')], [frag(0, 'pipeline')]] });
    applySearch(feed, 'y p');
    expect(row.querySelector('mark')).toBeNull();
    expect(dimmed(row)).toBe(false);
    expect([...row.querySelectorAll('.msg > .line')].map((l) => l.textContent)).toEqual(['deploy ', 'pipeline']);
  });

  it('an empty needle clears marks and dimming and re-merges each text run', () => {
    const hit = addRow({ raw: 'ab x ab', lines: [[frag(0, 'ab x ab')]] });
    const miss = addRow({ raw: 'zzz', lines: [[frag(0, 'zzz')]] });
    applySearch(feed, 'ab');
    applySearch(feed, '');
    expect(feed.querySelector('mark')).toBeNull();
    expect(dimmed(hit)).toBe(false);
    expect(dimmed(miss)).toBe(false);
    const line = hit.querySelector('.line');
    expect(line.childNodes).toHaveLength(1);
    expect(line.textContent).toBe('ab x ab');
  });

  it('a new term searches the merged text, not the previous marks', () => {
    const row = addRow({ raw: 'ab x ab', lines: [[frag(0, 'ab x ab')]] });
    applySearch(feed, 'ab');
    // "b x" spans the first mark's edge; it only matches once that mark is unwrapped.
    applySearch(feed, 'b x');
    expect(shape(row.querySelector('.line'))).toEqual(['a', '[b x]', ' ab']);
  });

  it('skips rows without a .msg and dims a row with no data-raw', () => {
    const notice = document.createElement('div');
    notice.className = 'feed-row';
    notice.textContent = 'server ab notice';
    const noRaw = document.createElement('div');
    noRaw.className = 'feed-row';
    noRaw.append(Object.assign(document.createElement('div'), { className: 'msg', textContent: 'ab' }));
    feed.append(notice, noRaw);
    applySearch(feed, 'ab');
    expect(dimmed(notice)).toBe(false);
    expect(notice.querySelector('mark')).toBeNull();
    expect(dimmed(noRaw)).toBe(true);
  });

  it('injects the dim style once', () => {
    applySearch(feed, 'a');
    applySearch(feed, 'b');
    expect(document.querySelectorAll('#search-dim-style')).toHaveLength(1);
  });
});
