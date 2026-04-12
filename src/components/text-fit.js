// <base-text-fit> — pretext-based text truncation and optimal line breaking

import { prepareWithSegments, measureLineStats, layoutNextLine, materializeLineRange, walkLineRanges, measureNaturalWidth } from '@chenglou/pretext';

const template = document.createElement('template');
// Template uses static literal HTML only (no user input)
template.innerHTML = [
  '<style>',
  '  :host { display: block; min-width: 0; max-width: 100%; overflow: hidden; }',
  '  #text { font: inherit; white-space: pre-wrap; overflow-wrap: break-word; }',
  '  :host([mode="fit"]) #text, :host(:not([mode])) #text { white-space: nowrap; }',
  '</style>',
  '<span id="text"></span>',
].join('\n');

const DEFAULT_FONT = '13px monospace';
let hyphenateWarned = false;

function doPrepare(text, font) {
  const result = prepareWithSegments(text, font);
  result._font = font;
  return result;
}

function getFont(prepared) {
  return prepared._font || DEFAULT_FONT;
}

class BaseTextFit extends HTMLElement {
  static observedAttributes = ['lines', 'mode', 'hyphenate'];

  #fullText = '';
  #prepared = null;
  #cachedFont = '';
  #resizeObs = null;
  #mutationObs = null;
  #textEl = null;
  #fontHandler = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.#textEl = this.shadowRoot.querySelector('#text');
  }

  connectedCallback() {
    this.#fullText = this.textContent || '';
    if (!this.hasAttribute('title')) {
      this.title = this.#fullText;
    }

    this.#resizeObs = new ResizeObserver((entries) => {
      this.#reflow(entries[0]?.contentRect?.width);
    });
    this.#resizeObs.observe(this);

    this.#mutationObs = new MutationObserver(() => {
      this.#fullText = this.textContent || '';
      if (!this.hasAttribute('title')) {
        this.title = this.#fullText;
      }
      this.#prepared = null;
      this.#reflow();
    });
    this.#mutationObs.observe(this, { characterData: true, childList: true, subtree: true });

    this.#fontHandler = () => {
      this.#cachedFont = '';
      this.#prepared = null;
      this.#reflow();
    };
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.addEventListener('loadingdone', this.#fontHandler);
    }
  }

  disconnectedCallback() {
    if (this.#resizeObs) {
      this.#resizeObs.disconnect();
      this.#resizeObs = null;
    }
    if (this.#mutationObs) {
      this.#mutationObs.disconnect();
      this.#mutationObs = null;
    }
    if (this.#fontHandler && typeof document !== 'undefined' && document.fonts) {
      document.fonts.removeEventListener('loadingdone', this.#fontHandler);
    }
    this.#fontHandler = null;
    this.#prepared = null;
    this.#cachedFont = '';
  }

  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'hyphenate' && newVal !== null && !hyphenateWarned) {
      hyphenateWarned = true;
      console.warn('<base-text-fit>: hyphenate attribute is a no-op stub. Pretext handles pre-existing soft hyphens but cannot insert them.');
    }
    this.#reflow();
  }

  #reflow(width) {
    if (!this.#fullText) {
      this.#textEl.textContent = '';
      return;
    }

    const cs = getComputedStyle(this);
    const font = cs.font || DEFAULT_FONT;
    const lhRaw = parseFloat(cs.lineHeight);
    const lineHeight = Number.isFinite(lhRaw) ? lhRaw : (parseFloat(cs.fontSize) || 13) * 1.2;

    if (font !== this.#cachedFont || !this.#prepared) {
      this.#cachedFont = font;
      this.#prepared = doPrepare(this.#fullText, font);
    }

    const maxWidth = width ?? this.getBoundingClientRect().width;
    if (maxWidth <= 0) {
      this.#textEl.textContent = this.#fullText;
      return;
    }

    const maxLines = parseInt(this.getAttribute('lines'), 10);
    const lines = Number.isFinite(maxLines) ? maxLines : 1;
    const mode = this.getAttribute('mode') || 'fit';

    if (lines === 0) {
      this.#textEl.textContent = this.#fullText;
      return;
    }

    if (mode === 'wrap') {
      this.#textEl.textContent = BaseTextFit.wrapOptimal(this.#prepared, maxWidth, lines, lineHeight);
    } else {
      this.#textEl.textContent = BaseTextFit.truncate(this.#prepared, maxWidth, lines);
    }
  }

  static truncate(prepared, maxWidth, maxLines, ellipsis = '\u2026') {
    if (!prepared) return '';
    const segments = prepared.segments;
    if (!segments || segments.length === 0) return '';
    const fullText = segments.join('');
    if (!fullText) return '';

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

  static wrapOptimal(prepared, maxWidth, maxLines, lineHeight) {
    if (!prepared) return '';
    const segments = prepared.segments;
    if (!segments || segments.length === 0) return '';
    const fullText = segments.join('');
    if (!fullText) return '';

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
      return collectLines(prepared, lo);
    }

    // Text exceeds maxLines at maxWidth — wrap and truncate last line
    if (maxLines > 0 && stats.lineCount > maxLines) {
      const allLines = [];
      walkLineRanges(prepared, maxWidth, (range) => {
        allLines.push(materializeLineRange(prepared, range).text);
      });

      const kept = allLines.slice(0, maxLines);
      kept[maxLines - 1] = truncateLastLine(
        kept[maxLines - 1], maxWidth, '\u2026', getFont(prepared)
      );
      return kept.join('\n');
    }

    // maxLines = 0 or text fits naturally
    return collectLines(prepared, maxWidth);
  }
}

function collectLines(prepared, width) {
  const lines = [];
  walkLineRanges(prepared, width, (range) => {
    lines.push(materializeLineRange(prepared, range).text);
  });
  return lines.join('\n');
}

function truncateLastLine(lineText, maxWidth, ellipsis, font) {
  const ellipsisPrep = doPrepare(ellipsis, font);
  const ellipsisWidth = measureNaturalWidth(ellipsisPrep);
  const availWidth = maxWidth - ellipsisWidth;

  if (availWidth <= 0) return ellipsis;

  for (let j = lineText.length; j >= 0; j--) {
    const candidate = lineText.slice(0, j).trimEnd();
    const candidatePrep = doPrepare(candidate, font);
    const candidateWidth = measureNaturalWidth(candidatePrep);
    if (candidateWidth <= availWidth) {
      return candidate + ellipsis;
    }
  }
  return ellipsis;
}

customElements.define('base-text-fit', BaseTextFit);
