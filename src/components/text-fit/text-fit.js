// <base-text-fit> — pretext-based text truncation and optimal line breaking.
// Owns the custom-element lifecycle (observers, reflow, attribute handling) and
// rendering; the pure layout algorithms live in text-fit-layout.js.

import { DEFAULT_FONT, doPrepare, justifyLines, truncate, wrapOptimal } from './text-fit-layout.js';
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
  #prepared = null;
  #cachedFont = '';
  #resizeObs = null;
  #mutationObs = null;
  #textEl = null;
  #fontHandler = null;
  // The title this element last wrote itself. A title attribute that still
  // equals it is ours to refresh; any other value came from the author.
  #ownTitle = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    styles.adopt(this.shadowRoot);
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this.#textEl = this.shadowRoot.querySelector('#text');
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
    if (typeof document !== 'undefined' && document.fonts) {
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

  // Mirror the full text into the tooltip, unless the author set their own.
  #syncTitle() {
    const title = this.getAttribute('title');
    if (title === null || title === this.#ownTitle) {
      this.title = this.#fullText;
      this.#ownTitle = this.#fullText;
    }
  }

  #reflow(width) {
    if (!this.#fullText) {
      this.#textEl.textContent = '';
      return;
    }

    const cs = getComputedStyle(this);
    const font = cs.font || DEFAULT_FONT;
    if (font !== this.#cachedFont || !this.#prepared) {
      this.#cachedFont = font;
      this.#prepared = doPrepare(this.#fullText, font);
    }

    const maxWidth = width ?? this.getBoundingClientRect().width;
    if (maxWidth <= 0) {
      this.#textEl.textContent = this.#fullText;
      return;
    }

    const parsedLines = parseInt(this.getAttribute('lines'), 10);
    const lineLimit = Number.isFinite(parsedLines) ? parsedLines : 1;
    const mode = this.getAttribute('mode') || 'fit';

    if (lineLimit === 0 && mode !== 'justify') {
      this.#textEl.textContent = this.#fullText;
      return;
    }

    if (mode === 'justify') {
      this.#renderJustified(maxWidth, lineLimit);
    } else if (mode === 'wrap') {
      this.#textEl.textContent = wrapOptimal(this.#prepared, maxWidth, lineLimit);
    } else {
      this.#textEl.textContent = truncate(this.#prepared, maxWidth, lineLimit);
    }
  }

  #renderJustified(maxWidth, lineLimit) {
    const laidOut = justifyLines(this.#prepared, maxWidth, lineLimit);
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
