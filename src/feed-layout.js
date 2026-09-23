// Pretext-driven feed-row line layout: fragment-based, reflow-free measurement
import {
  prepareRichInline,
  walkRichInlineLineRanges,
  materializeRichInlineLineRange,
} from '@chenglou/pretext/rich-inline';

// 4px gap after the project chip; matches `.feed-row .proj-pill { margin-right: 4px }`.
const CHIP_GAP_PX = 4;

// Build fragment items for one row from the dataset attrs we stash at render time.
function buildItems(row, font) {
  const items = [];
  const text = row.dataset.raw || '';
  const project = row.dataset.project || '';

  if (project) {
    items.push({ text: '#' + project, font, break: 'never', extraWidth: CHIP_GAP_PX });
  }
  items.push({ text, font });
  return items;
}

// Render one fragment of a laid-out line into a child span/text-node tree.
// `frag.gapBefore` carries inter-item whitespace pretext normalized out of
// item text (e.g. the space after the project chip), so we materialize it as margin-left.
function renderFragment(parent, frag, items, chipTarget) {
  const item = items[frag.itemIndex];
  let el;
  if (item.break === 'never' && item.text.startsWith('#')) {
    el = document.createElement('span');
    el.className = 'proj-pill';
    el.textContent = frag.text;
    if (chipTarget) el.dataset.target = chipTarget;
  } else if (frag.gapBefore > 0) {
    el = document.createElement('span');
    el.textContent = frag.text;
  } else {
    // Plain body fragment with no leading gap — render as a bare text node so
    // search's TreeWalker walks it without any wrapper noise.
    parent.appendChild(document.createTextNode(frag.text));
    return;
  }
  if (frag.gapBefore > 0) el.style.marginLeft = `${frag.gapBefore}px`;
  parent.appendChild(el);
}

// DOM fallback when pretext can't be invoked yet (zero width, layout failure).
function renderFallback(msg, row) {
  msg.textContent = '';
  if (row.dataset.project) {
    const pill = document.createElement('span');
    pill.className = 'proj-pill';
    pill.textContent = '#' + row.dataset.project;
    if (row.dataset.target) pill.dataset.target = row.dataset.target;
    msg.appendChild(pill);
  }
  msg.appendChild(document.createTextNode(row.dataset.raw || ''));
}

/** Lay out one row's .msg using pretext rich-inline at the given width.
 *  Re-renders into a flat list of <span class="line"> elements. */
export function layoutRow(row, msgWidth, font) {
  const msg = row.querySelector('.msg');
  if (!msg) return;
  const items = buildItems(row, font);
  if (!items.length || !items.some(i => i.text)) {
    msg.textContent = '';
    return;
  }
  if (!(msgWidth > 0)) {
    renderFallback(msg, row);
    return;
  }

  let prepared;
  try {
    prepared = prepareRichInline(items);
  } catch {
    renderFallback(msg, row);
    return;
  }

  const chipTarget = row.dataset.target || null;
  const frag = document.createDocumentFragment();
  walkRichInlineLineRanges(prepared, msgWidth, (range) => {
    const line = materializeRichInlineLineRange(prepared, range);
    const lineEl = document.createElement('span');
    lineEl.className = 'line';
    for (const f of line.fragments) renderFragment(lineEl, f, items, chipTarget);
    frag.appendChild(lineEl);
  });
  msg.replaceChildren(frag);
  delete msg.dataset.searchOn;
}

/** Compute the font CSS shorthand to feed pretext, plus the .msg column width.
 *  Both are uniform across the feed (.msg shares one grid column track). */
export function measureFeedMetrics(feedEl) {
  const probe = feedEl.querySelector('.feed-row .msg');
  if (!probe) return null;
  const cs = getComputedStyle(probe);
  return {
    font: cs.font || `${cs.fontWeight || ''} ${cs.fontSize || ''} ${cs.fontFamily || ''}`.trim(),
    msgWidth: probe.getBoundingClientRect().width,
  };
}

/** Lay out every .feed-row currently in the feed. */
export function relayoutAll(feedEl) {
  const m = measureFeedMetrics(feedEl);
  if (!m || m.msgWidth <= 0) return;
  const rows = feedEl.querySelectorAll('.feed-row');
  for (const row of rows) layoutRow(row, m.msgWidth, m.font);
}
