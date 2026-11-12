// Row and pretext-mock builders shared by the feed-layout tests (the test files vi.mock the module)
import { vi } from 'vitest';
import { prepareRichInline, walkRichInlineLineRanges, materializeRichInlineLineRange } from '@chenglou/pretext/rich-inline';

// Build a .feed-row with a .msg child and the dataset attrs buildItems reads.
/**
 * @param {{ raw?: string, project?: string, target?: string, feature?: boolean }} [opts]
 * @returns {HTMLElement}
 */
export function makeRow({ raw = '', project = '', target = '', feature = false } = {}) {
  const row = document.createElement('div');
  row.className = 'feed-row';
  if (feature) row.classList.add('cat-feature');
  if (raw) row.dataset.raw = raw;
  if (project) row.dataset.projectSlug = project;
  if (target) row.dataset.targetChannel = target;
  const msg = document.createElement('span');
  msg.className = 'msg';
  row.appendChild(msg);
  return row;
}

// Drive the pretext mocks down the success path: prepareRichInline returns an
// opaque token, walkRichInlineLineRanges emits one range per line, and
// materializeRichInlineLineRange returns the supplied fragments for each line
// (cycling so multi-row relayout reuses the same fragment list).
/** @param {{ itemIndex: number, text: string, gapBefore: number }[][]} fragmentsPerLine */
export function setNormalPath(fragmentsPerLine) {
  vi.mocked(prepareRichInline).mockReturnValue(/** @type {never} */ ({ ok: true })); // opaque token
  vi.mocked(walkRichInlineLineRanges).mockImplementation((_prepared, _width, cb) => {
    for (let i = 0; i < fragmentsPerLine.length; i++) cb(/** @type {never} */ ({ line: i })); // opaque range token, only handed back to materialize
    return fragmentsPerLine.length;
  });
  let i = 0;
  vi.mocked(materializeRichInlineLineRange).mockImplementation(() => /** @type {never} */ ({
    fragments: fragmentsPerLine[i++ % fragmentsPerLine.length],
  }));
}
