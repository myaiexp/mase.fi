// <base-select> — custom select form control (options in select-option.js)

import { addOverlayListeners, removeOverlayListeners } from '../shared/overlay-utils.js';
import { applyMenuFlip } from '../shared/menu-flip.js';
import { wrapIndex } from '../shared/menu-nav.js';
import { selectStyles } from './select-styles.js';
import { buildMenu, markSelected, filterMenu, resetFilter } from './select-menu.js';
import './select-option.js';

const selectTemplate = document.createElement('template');
selectTemplate.innerHTML = `${selectStyles}
<div part="trigger-wrap"></div>
<div part="menu" hidden></div>`;

class BaseSelect extends HTMLElement {
  static observedAttributes = ['value', 'placeholder', 'searchable', 'disabled', 'size'];

  // Member convention (library-wide — see docs/base-components.md): `#member` is
  // hard-private internal state; `_member` is deliberately reachable by a friend
  // module or test. Here select-menu.js is a friend module that reads `_menu` and
  // calls `_selectOption` — those two stay `_`; everything else is #private.
  #open = false;
  #highlightIdx = -1;
  #blurTimeout = null;
  #lastJumpKey = '';
  #lastJumpCycleIdx = -1;
  #triggerWrap = null;
  #observer = null;
  #trigger = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open', delegatesFocus: true });
    this.shadowRoot.appendChild(selectTemplate.content.cloneNode(true));
    this._menu = this.shadowRoot.querySelector('[part="menu"]');
    this.#triggerWrap = this.shadowRoot.querySelector('[part="trigger-wrap"]');
  }

  connectedCallback() {
    this.#buildTrigger();
    buildMenu(this);
    this.#observer = new MutationObserver(() => buildMenu(this));
    this.#observer.observe(this, { childList: true, subtree: true });
  }

  disconnectedCallback() {
    removeOverlayListeners(this);
    this.#observer?.disconnect();
    if (this.#blurTimeout) clearTimeout(this.#blurTimeout);
  }

  attributeChangedCallback(name) {
    if (name === 'value') this.#syncTriggerText();
    if (name === 'placeholder') this.#syncTriggerText();
    if (name === 'size') this.#applySize();
    if (name === 'searchable') { this.#buildTrigger(); buildMenu(this); }
  }

  // --- Public API ---

  get value() { return this.getAttribute('value') ?? ''; }
  set value(v) { this.setAttribute('value', v); markSelected(this); }

  get selectedOption() {
    const v = this.value;
    return this.querySelector(`base-option[value="${v}"]`) ?? null;
  }

  get isOpen() { return this.#open; }

  get #searchable() { return this.hasAttribute('searchable'); }

  open() {
    if (this.hasAttribute('disabled')) return;
    this.#open = true;

    applyMenuFlip(this, this._menu);

    this._menu.hidden = false;

    const opts = this.#enabledOptionDivs();
    this.#highlightIdx = opts.length ? 0 : -1;
    this.#applyHighlight();

    this.#addDocListeners();
  }

  close() {
    this.#open = false;
    this._menu.hidden = true;
    this.#highlightIdx = -1;
    removeOverlayListeners(this);

    // Searchable: cancelling reverts the trigger to the selected option's label
    // AND clears the filter, so the abandoned query leaves no trace — a fresh
    // open shows every option, not the stale filtered subset (which could even
    // hide the selected option the input now displays).
    if (this.#searchable) {
      this.#syncTriggerText();
      resetFilter(this);
    }
  }

  // --- Trigger ---

  #buildTrigger() {
    this.#triggerWrap.textContent = '';
    if (this.#searchable) {
      const input = document.createElement('input');
      input.setAttribute('type', 'text');
      input.setAttribute('part', 'trigger');
      input.setAttribute('placeholder', this.getAttribute('placeholder') ?? '');
      // A filter input must never be an autofill target. Password managers
      // (Bitwarden et al.) traverse open shadow roots, attach inline-menu
      // observers to this persistent text field, and thrash field-heavy pages.
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('data-bwignore', 'true'); // Bitwarden
      input.setAttribute('data-lpignore', 'true'); // LastPass
      input.setAttribute('data-1p-ignore', ''); // 1Password
      input.setAttribute('data-form-type', 'other'); // Dashlane
      input.addEventListener('click', () => { if (!this.#open) this.open(); });
      input.addEventListener('focus', () => { if (!this.#open) this.open(); });
      input.addEventListener('input', () => this.#onFilter());
      input.addEventListener('keydown', (e) => this.#onKeydown(e));
      this.#triggerWrap.appendChild(input);
      this.#trigger = input;
    } else {
      const btn = document.createElement('button');
      btn.setAttribute('type', 'button');
      btn.setAttribute('part', 'trigger');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.hasAttribute('disabled')) return;
        this.#open ? this.close() : this.open();
      });
      btn.addEventListener('keydown', (e) => this.#onKeydown(e));
      this.#triggerWrap.appendChild(btn);
      this.#trigger = btn;
    }
    this.#applySize();
    this.#syncTriggerText();
  }

  #syncTriggerText() {
    if (!this.#trigger) return;
    const sel = this.selectedOption;

    if (this.#searchable) {
      this.#trigger.value = sel ? sel.label : '';
      this.#trigger.setAttribute('placeholder', this.getAttribute('placeholder') ?? '');
      return;
    }

    if (sel) {
      this.#trigger.textContent = sel.label;
      return;
    }

    const ph = this.getAttribute('placeholder') ?? '';
    this.#trigger.textContent = '';
    if (ph) this.#trigger.appendChild(this.#makePlaceholderSpan(ph));
  }

  #makePlaceholderSpan(text) {
    const span = document.createElement('span');
    span.className = 'placeholder';
    span.textContent = text;
    return span;
  }

  #applySize() {
    if (!this.#trigger) return;
    this.#trigger.classList.toggle('sm', this.getAttribute('size') === 'sm');
  }

  // --- Selection ---

  _selectOption(div) {
    if (div.classList.contains('disabled')) return;
    const value = div.dataset.value;
    const label = div.dataset.label;
    this.setAttribute('value', value);
    markSelected(this);
    this.#syncTriggerText();
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value, label } }));
    this.close();
  }

  // --- Keyboard ---

  #onKeydown(e) {
    if (!this.#open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      this.open();
      return;
    }
    if (!this.#open) return;

    const opts = this.#enabledOptionDivs();
    if (!opts.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.#highlightIdx = wrapIndex(this.#highlightIdx, 1, opts.length);
      this.#applyHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.#highlightIdx = wrapIndex(this.#highlightIdx, -1, opts.length);
      this.#applyHighlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.#highlightIdx >= 0 && this.#highlightIdx < opts.length) {
        this._selectOption(opts[this.#highlightIdx]);
      }
    } else if (e.key === 'Escape') {
      // Handled by doc listener
    } else if (e.key === 'Tab') {
      this.close();
    } else if (!this.#searchable && e.key.length === 1 && /[a-z]/i.test(e.key)) {
      this.#letterJump(e.key, opts);
    }
  }

  #letterJump(letter, opts) {
    const lower = letter.toLowerCase();
    const matches = [];
    for (let i = 0; i < opts.length; i++) {
      if (opts[i].textContent.toLowerCase().startsWith(lower)) matches.push(i);
    }
    if (!matches.length) return;

    if (this.#lastJumpKey === lower && this.#lastJumpCycleIdx >= 0) {
      // Same letter repeated — cycle to next match
      const nextIdx = (this.#lastJumpCycleIdx + 1) % matches.length;
      this.#highlightIdx = matches[nextIdx];
      this.#lastJumpCycleIdx = nextIdx;
    } else {
      // New letter — jump to first match
      this.#highlightIdx = matches[0];
      this.#lastJumpKey = lower;
      this.#lastJumpCycleIdx = 0;
    }
    this.#applyHighlight();
  }

  #enabledOptionDivs() {
    return [...this._menu.querySelectorAll('.option:not(.disabled)')].filter(
      d => d.style.display !== 'none'
    );
  }

  #applyHighlight() {
    const allOpts = [...this._menu.querySelectorAll('.option')];
    const enabled = this.#enabledOptionDivs();
    for (const o of allOpts) o.classList.remove('active');
    if (this.#highlightIdx >= 0 && this.#highlightIdx < enabled.length) {
      enabled[this.#highlightIdx].classList.add('active');
    }
  }

  // --- Filter (searchable) ---

  // Apply the search filter to the menu DOM, then move the highlight to the
  // first still-visible option (or clear it). The DOM filtering itself lives in
  // select-menu.js; the highlight is this component's keyboard concern.
  #onFilter() {
    filterMenu(this, this.#trigger.value.toLowerCase());
    const enabled = this.#enabledOptionDivs();
    this.#highlightIdx = enabled.length ? 0 : -1;
    this.#applyHighlight();
  }

  // --- Document listeners ---

  #addDocListeners() {
    addOverlayListeners(this, (e) => !this.contains(e.target) && !this.shadowRoot.contains(e.target));
  }
}

customElements.define('base-select', BaseSelect);
