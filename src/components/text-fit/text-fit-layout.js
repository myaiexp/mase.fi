// Pure text-layout algorithms for <base-text-fit> — justify, truncate, and
// optimal-wrap over a pretext `prepared` object. No DOM or element state; the
// custom element in text-fit.js imports these and owns lifecycle/rendering.
// Mirrors the select-menu.js decomposition: pure logic lives here, testable
// directly, so the element file stays focused on lifecycle concerns.

import { measureLineStats, layoutNextLine, materializeLineRange, walkLineRanges, measureNaturalWidth, prepareWithSegments } from '@chenglou/pretext';

export const DEFAULT_FONT = '13px monospace';

// Prepare `text` at `font`, stashing the font on the result so downstream
// re-measurement (truncateLastLine) can reprepare slices at the same font.
export function doPrepare(text, font) {
  const result = prepareWithSegments(text, font);
  result._font = font;
  return result;
}

function getFont(prepared) {
  return prepared._font || DEFAULT_FONT;
}

// Full rendered text of a prepared object, or null when there's nothing to
// render (null prepared, no segments, or empty text). Callers map null to their
// own empty value — [] for justifyLines, '' for truncate/wrapOptimal — so the
// three empty-input guards live in one place instead of being copy-pasted.
function fullTextOf(prepared) {
  if (!prepared) return null;
  const segments = prepared.segments;
  if (!segments || segments.length === 0) return null;
  const fullText = segments.join('');
  return fullText || null;
}

// Wrap `prepared` at `width`, returning each line's text as an array. Callers
// join with '\n' (single-render) or slice before joining (overflow truncation).
function collectLines(prepared, width) {
  const lines = [];
  walkLineRanges(prepared, width, (range) => {
    lines.push(materializeLineRange(prepared, range).text);
  });
  return lines;
}

function truncateLastLine(lineText, maxWidth, ellipsis, font) {
  const ellipsisPrep = doPrepare(ellipsis, font);
  const ellipsisWidth = measureNaturalWidth(ellipsisPrep);
  const availWidth = maxWidth - ellipsisWidth;

  if (availWidth <= 0) return ellipsis;

  // width(slice(0, j).trimEnd()) is monotonic non-decreasing in j, so binary
  // search for the largest fitting prefix in O(log N) measurements. j = 0 (the
  // empty string, width 0) always fits, so `best` is never left unset.
  let lo = 0;
  let hi = lineText.length;
  let best = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    const candidate = lineText.slice(0, mid).trimEnd();
    const candidateWidth = measureNaturalWidth(doPrepare(candidate, font));
    if (candidateWidth <= availWidth) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return lineText.slice(0, best).trimEnd() + ellipsis;
}

// Break text into justified lines: non-last lines get a `wordSpacing` (px) that
// stretches them to maxWidth; the last line is left-aligned (or truncated with
// an ellipsis when the line count overflows maxLines).
export function justifyLines(prepared, maxWidth, maxLines) {
  if (fullTextOf(prepared) === null) return [];

  // One walk yields each line's text AND its paint width, avoiding a per-line
  // prepareWithSegments re-measure. The width here is identical to
  // measureNaturalWidth(doPrepare(line.text, font)) — same paint-width engine,
  // trailing whitespace excluded the same way — so reusing it is safe.
  const allLines = [];
  walkLineRanges(prepared, maxWidth, (range) => {
    const line = materializeLineRange(prepared, range);
    allLines.push({ text: line.text, width: line.width });
  });

  const linesToShow = maxLines > 0 ? allLines.slice(0, maxLines) : allLines;
  const isOverflow = maxLines > 0 && allLines.length > maxLines;
  const font = getFont(prepared);

  const result = [];
  for (let i = 0; i < linesToShow.length; i++) {
    const { text, width: naturalWidth } = linesToShow[i];
    const isLast = i === linesToShow.length - 1;

    if (isLast && isOverflow) {
      result.push({ text: truncateLastLine(text, maxWidth, '…', font) });
    } else if (isLast) {
      result.push({ text });
    } else {
      const spaceCount = (text.match(/ /g) || []).length;
      if (spaceCount > 0 && naturalWidth < maxWidth) {
        result.push({ text, wordSpacing: (maxWidth - naturalWidth) / spaceCount });
      } else {
        result.push({ text });
      }
    }
  }
  return result;
}

// Truncate to at most `maxLines` lines at `maxWidth`, appending an ellipsis to
// the last line when the text overflows.
export function truncate(prepared, maxWidth, maxLines, ellipsis = '…') {
  const fullText = fullTextOf(prepared);
  if (fullText === null) return '';

  const stats = measureLineStats(prepared, maxWidth);
  if (stats.lineCount <= maxLines) return fullText;

  // Walk lines, collecting all visible lines
  const lines = [];
  let cursor = { segmentIndex: 0, graphemeIndex: 0 };
  for (let i = 0; i < maxLines; i++) {
    const line = layoutNextLine(prepared, cursor, maxWidth);
    if (!line) break;
    if (i < maxLines - 1) {
      lines.push(line.text);
    } else {
      // Last line: truncate to fit with ellipsis
      lines.push(truncateLastLine(line.text, maxWidth, ellipsis, getFont(prepared)));
    }
    cursor = line.end;
  }

  return maxLines > 1 ? lines.join('\n') : lines.join('');
}

// Wrap text to minimize ragged width. When it fits within maxLines, binary-
// search the narrowest width that still fits (balanced lines); when it exceeds
// maxLines, wrap at maxWidth and truncate the last kept line with an ellipsis.
export function wrapOptimal(prepared, maxWidth, maxLines) {
  if (fullTextOf(prepared) === null) return '';

  const stats = measureLineStats(prepared, maxWidth);

  // If text fits within maxLines at maxWidth, do balanced-width binary search
  if (maxLines > 0 && stats.lineCount <= maxLines) {
    let lo = 1, hi = maxWidth;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const midStats = measureLineStats(prepared, mid);
      if (midStats.lineCount <= maxLines) hi = mid;
      else lo = mid + 1;
    }
    return collectLines(prepared, lo).join('\n');
  }

  // Text exceeds maxLines at maxWidth — wrap and truncate last line
  if (maxLines > 0 && stats.lineCount > maxLines) {
    const kept = collectLines(prepared, maxWidth).slice(0, maxLines);
    kept[maxLines - 1] = truncateLastLine(
      kept[maxLines - 1], maxWidth, '…', getFont(prepared)
    );
    return kept.join('\n');
  }

  // maxLines = 0 or text fits naturally
  return collectLines(prepared, maxWidth).join('\n');
}
