// <base-text-fit> — pretext-based text truncation and optimal line breaking.
// Owns the custom-element lifecycle (observers, reflow, attribute handling) and
// rendering; the pure layout algorithms live in text-fit-layout.js.

/** @import { Prepared } from './text-fit-layout.js' */

import { DEFAULT_FONT, doPrepare, justifyLines, truncate, wrapOptimal } from './text-fit-layout.js';
import { mountShadow } from '../shared/mount-shadow.js';
import { shadowStyles } from '../shared/shadow-styles.js';

const styles = shadowStyles([
  '  :host { display: block; min-width: 0; max-width: 100%; overflow: hidden; }',
  '  #text { font: inherit; white-space: pre-wrap; overflow-wrap: break-word; }',
  '  :host([mode="fit"]) #text, :host(:not([mode])) #text { white-space: nowrap; }',
  '  .jl { display: block; white-space: nowrap; }',
].join('\n'));

const template = document.createElement('template');
// Template uses static literal HTML only (no user input)
template.innerHTML = '<span id="text"></span>';

let hyphenateWarned = false;

class BaseTextFit extends HTMLElement {
  static observedAttributes = ['lines', 'mode', 'hyphenate'];

  #fullText = '';
  /** @type {Prepared | null} */
  #prepared = null;
  #cachedFont = '';
  /** @type {ResizeObserver | null} */
  #resizeObs = null;
  /** @type {MutationObserver | null} */
  #mutationObs = null;
  #textEl;
  /** @type {(() => void) | null} */
  #fontHandler = null;
  // The title this element last wrote itself. A title attribute that still
  // equals it is ours to refresh; any other value came from the author.
  /** @type {string | null} */
  #ownTitle = null;

  constructor() {
    super();
    mountShadow(this, styles, template);
    this.#textEl = /** @type {HTMLElement} */ (
      /** @type {ShadowRoot} */ (this.shadowRoot).querySelector('#text'));
  }

  connectedCallback() {
    this.#fullText = this.textContent || '';
    this.#syncTitle();

    this.#resizeObs = new ResizeObserver((entries) => {
      this.#reflow(entries[0]?.contentRect?.width);
    });
    this.#resizeObs.observe(this);

    this.#mutationObs = new MutationObserver(() => {
      this.#fullText = this.textContent || '';
      this.#syncTitle();
      this.#prepared = null;
      this.#reflow();
    });
    this.#mutationObs.observe(this, { characterData: true, childList: true, subtree: true });

    this.#fontHandler = () => {
      this.#cachedFont = '';
      this.#prepared = null;
      this.#reflow();
    };
    if (document.fonts) {
      document.fonts.addEventListener('loadingdone', this.#fontHandler);
    }

    // Paint synchronously on connect so the element never shows a blank frame
    // waiting for the async ResizeObserver callback. Costs one forced layout
    // (getBoundingClientRect); if width is 0 (not yet laid out) #reflow paints
    // the full text and the RO callback corrects it once a real size arrives.
    this.#reflow();
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
    if (this.#fontHandler && document.fonts) {
      document.fonts.removeEventListener('loadingdone', this.#fontHandler);
    }
    this.#fontHandler = null;
    this.#prepared = null;
    this.#cachedFont = '';
  }

  /**
   * @param {string} name
   * @param {string | null} oldVal
   * @param {string | null} newVal
   */
  attributeChangedCallback(name, oldVal, newVal) {
    if (oldVal === newVal) return;
    if (name === 'hyphenate' && newVal !== null && !hyphenateWarned) {
      hyphenateWarned = true;
      console.warn('<base-text-fit>: hyphenate attribute is a no-op stub. Pretext handles pre-existing soft hyphens but cannot insert them.');
    }
    this.#reflow();
  }

  // Mirror the full text into the tooltip, unless the author set their own.
  #syncTitle() {
    const title = this.getAttribute('title');
    if (title === null || title === this.#ownTitle) {
      this.title = this.#fullText;
      this.#ownTitle = this.#fullText;
    }
  }

  /** @param {number} [width] */
  #reflow(width) {
    if (!this.#fullText) {
      this.#textEl.textContent = '';
      return;
    }

    const cs = getComputedStyle(this);
    const font = cs.font || DEFAULT_FONT;
    let prepared = this.#prepared;
    if (font !== this.#cachedFont || !prepared) {
      this.#cachedFont = font;
      prepared = this.#prepared = doPrepare(this.#fullText, font);
    }

    const maxWidth = width ?? this.getBoundingClientRect().width;
    if (maxWidth <= 0) {
      this.#textEl.textContent = this.#fullText;
      return;
    }

    const parsedLines = parseInt(this.getAttribute('lines') ?? '', 10);
    const lineLimit = Number.isFinite(parsedLines) ? parsedLines : 1;
    const mode = this.getAttribute('mode') || 'fit';

    if (lineLimit === 0 && mode !== 'justify') {
      this.#textEl.textContent = this.#fullText;
      return;
    }

    if (mode === 'justify') {
      this.#renderJustified(prepared, maxWidth, lineLimit);
    } else if (mode === 'wrap') {
      this.#textEl.textContent = wrapOptimal(prepared, maxWidth, lineLimit);
    } else {
      this.#textEl.textContent = truncate(prepared, maxWidth, lineLimit);
    }
  }

  /**
   * @param {Prepared} prepared
   * @param {number} maxWidth
   * @param {number} lineLimit
   */
  #renderJustified(prepared, maxWidth, lineLimit) {
    const laidOut = justifyLines(prepared, maxWidth, lineLimit);
    this.#textEl.textContent = '';
    for (const line of laidOut) {
      const span = document.createElement('span');
      span.className = 'jl';
      span.textContent = line.text;
      if (line.wordSpacing !== undefined) {
        span.style.setProperty('word-spacing', `${line.wordSpacing}px`);
      }
      this.#textEl.appendChild(span);
    }
  }
}

customElements.define('base-text-fit', BaseTextFit);
