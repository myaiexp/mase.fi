// <base-select> — custom select form control (options in select-option.js)

import { addOverlayListeners, removeOverlayListeners } from './overlay-utils.js';
import { applyMenuFlip } from './menu-flip.js';
import { wrapIndex } from './menu-nav.js';
import { selectStyles } from './select-styles.js';
import './select-option.js';

const selectTemplate = document.createElement('template');
selectTemplate.innerHTML = `${selectStyles}
<div part="trigger-wrap"></div>
<div part="menu" hidden></div>`;

class BaseSelect extends HTMLElement {
  static observedAttributes = ['value', 'placeholder', 'searchable', 'disabled', 'size'];

  #open = false;
  #highlightIdx = -1;
  #blurTimeout = null;
  #lastJumpKey = '';
  #lastJumpCycleIdx = -1;

  constructor() {
    super();
    this.attachShadow({ mode: 'open', delegatesFocus: true });
    this.shadowRoot.appendChild(selectTemplate.content.cloneNode(true));
    this._menu = this.shadowRoot.querySelector('[part="menu"]');
    this._triggerWrap = this.shadowRoot.querySelector('[part="trigger-wrap"]');
  }

  connectedCallback() {
    this._buildTrigger();
    this._buildMenu();
    this._observer = new MutationObserver(() => this._buildMenu());
    this._observer.observe(this, { childList: true, subtree: true });
  }

  disconnectedCallback() {
    this._removeDocListeners();
    this._observer?.disconnect();
    if (this.#blurTimeout) clearTimeout(this.#blurTimeout);
  }

  attributeChangedCallback(name) {
    if (name === 'value') this._syncTriggerText();
    if (name === 'placeholder') this._syncTriggerText();
    if (name === 'size') this._applySize();
    if (name === 'searchable') { this._buildTrigger(); this._buildMenu(); }
  }

  // --- Public API ---

  get value() { return this.getAttribute('value') ?? ''; }
  set value(v) { this.setAttribute('value', v); this._markSelected(); }

  get selectedOption() {
    const v = this.value;
    return this.querySelector(`base-option[value="${v}"]`) ?? null;
  }

  get isOpen() { return this.#open; }

  get _searchable() { return this.hasAttribute('searchable'); }

  open() {
    if (this.hasAttribute('disabled')) return;
    this.#open = true;

    applyMenuFlip(this, this._menu);

    this._menu.hidden = false;

    const opts = this._enabledOptionDivs();
    this.#highlightIdx = opts.length ? 0 : -1;
    this._applyHighlight();

    this._addDocListeners();
  }

  close() {
    this.#open = false;
    this._menu.hidden = true;
    this.#highlightIdx = -1;
    this._removeDocListeners();

    // Searchable: cancelling reverts the trigger to the selected option's label
    // AND clears the filter, so the abandoned query leaves no trace — a fresh
    // open shows every option, not the stale filtered subset (which could even
    // hide the selected option the input now displays).
    if (this._searchable) {
      this._syncTriggerText();
      this._resetFilter();
    }
  }

  // --- Trigger ---

  _buildTrigger() {
    this._triggerWrap.textContent = '';
    if (this._searchable) {
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
      input.addEventListener('input', () => this._onFilter());
      input.addEventListener('keydown', (e) => this._onKeydown(e));
      this._triggerWrap.appendChild(input);
      this._trigger = input;
    } else {
      const btn = document.createElement('button');
      btn.setAttribute('type', 'button');
      btn.setAttribute('part', 'trigger');
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.hasAttribute('disabled')) return;
        this.#open ? this.close() : this.open();
      });
      btn.addEventListener('keydown', (e) => this._onKeydown(e));
      this._triggerWrap.appendChild(btn);
      this._trigger = btn;
    }
    this._applySize();
    this._syncTriggerText();
  }

  _syncTriggerText() {
    if (!this._trigger) return;
    const sel = this.selectedOption;

    if (this._searchable) {
      this._trigger.value = sel ? sel.label : '';
      this._trigger.setAttribute('placeholder', this.getAttribute('placeholder') ?? '');
      return;
    }

    if (sel) {
      this._trigger.textContent = sel.label;
      return;
    }

    const ph = this.getAttribute('placeholder') ?? '';
    this._trigger.textContent = '';
    if (ph) this._trigger.appendChild(this._makePlaceholderSpan(ph));
  }

  _makePlaceholderSpan(text) {
    const span = document.createElement('span');
    span.className = 'placeholder';
    span.textContent = text;
    return span;
  }

  _applySize() {
    if (!this._trigger) return;
    this._trigger.classList.toggle('sm', this.getAttribute('size') === 'sm');
  }

  // --- Menu building ---

  _buildMenu() {
    this._menu.textContent = '';
    const children = this.querySelectorAll(':scope > base-option, :scope > base-option-group');
    for (const child of children) {
      if (child.tagName === 'BASE-OPTION-GROUP') {
        const header = document.createElement('div');
        header.className = 'group-header';
        header.textContent = child.label;
        header.dataset.groupFor = child.label;
        this._menu.appendChild(header);
        const groupOpts = child.querySelectorAll('base-option');
        for (const opt of groupOpts) this._menu.appendChild(this._createOptionDiv(opt, child.label));
      } else {
        this._menu.appendChild(this._createOptionDiv(child, null));
      }
    }
    const noMatch = document.createElement('div');
    noMatch.className = 'no-matches';
    noMatch.textContent = 'No matches';
    noMatch.style.display = 'none';
    this._menu.appendChild(noMatch);

    this._markSelected();
  }

  _createOptionDiv(opt, groupLabel) {
    const div = document.createElement('div');
    div.className = 'option';
    div.dataset.value = opt.value;
    // Store the clean label here: action options nest a <span> label beside an
    // action-btn whose textContent is '...', so div.textContent is unreliable.
    div.dataset.label = opt.label;
    div.setAttribute('tabindex', '-1');
    if (opt.disabled) div.classList.add('disabled');
    if (groupLabel) div.dataset.group = groupLabel;

    if (opt.action) {
      div.classList.add('has-action');
      const label = document.createElement('span');
      label.textContent = opt.label;
      div.appendChild(label);
      const btn = document.createElement('button');
      btn.className = 'action-btn';
      btn.type = 'button';
      btn.textContent = '...';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dispatchEvent(new CustomEvent('option-action', {
          bubbles: true,
          detail: { value: opt.value, label: opt.label, anchor: btn }
        }));
      });
      div.appendChild(btn);
    } else {
      div.textContent = opt.label;
    }

    div.addEventListener('click', () => this._selectOption(div));
    return div;
  }

  _markSelected() {
    const v = this.value;
    for (const div of this._menu.querySelectorAll('.option')) {
      div.classList.toggle('selected', div.dataset.value === v);
    }
  }

  // --- Selection ---

  _selectOption(div) {
    if (div.classList.contains('disabled')) return;
    const value = div.dataset.value;
    const label = div.dataset.label;
    this.setAttribute('value', value);
    this._markSelected();
    this._syncTriggerText();
    this.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value, label } }));
    this.close();
  }

  // --- Keyboard ---

  _onKeydown(e) {
    if (!this.#open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      this.open();
      return;
    }
    if (!this.#open) return;

    const opts = this._enabledOptionDivs();
    if (!opts.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.#highlightIdx = wrapIndex(this.#highlightIdx, 1, opts.length);
      this._applyHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.#highlightIdx = wrapIndex(this.#highlightIdx, -1, opts.length);
      this._applyHighlight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (this.#highlightIdx >= 0 && this.#highlightIdx < opts.length) {
        this._selectOption(opts[this.#highlightIdx]);
      }
    } else if (e.key === 'Escape') {
      // Handled by doc listener
    } else if (e.key === 'Tab') {
      this.close();
    } else if (!this._searchable && e.key.length === 1 && /[a-z]/i.test(e.key)) {
      this._letterJump(e.key, opts);
    }
  }

  _letterJump(letter, opts) {
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
    this._applyHighlight();
  }

  _enabledOptionDivs() {
    return [...this._menu.querySelectorAll('.option:not(.disabled)')].filter(
      d => d.style.display !== 'none'
    );
  }

  _applyHighlight() {
    const allOpts = [...this._menu.querySelectorAll('.option')];
    const enabled = this._enabledOptionDivs();
    for (const o of allOpts) o.classList.remove('active');
    if (this.#highlightIdx >= 0 && this.#highlightIdx < enabled.length) {
      enabled[this.#highlightIdx].classList.add('active');
    }
  }

  // --- Filter (searchable) ---

  _onFilter() {
    const query = this._trigger.value.toLowerCase();
    const opts = [...this._menu.querySelectorAll('.option')];
    const headers = [...this._menu.querySelectorAll('.group-header')];
    const noMatch = this._menu.querySelector('.no-matches');
    let anyVisible = false;

    for (const opt of opts) {
      const match = !query || opt.textContent.toLowerCase().includes(query);
      opt.style.display = match ? '' : 'none';
      if (match) anyVisible = true;
    }

    for (const header of headers) {
      const groupLabel = header.dataset.groupFor;
      const groupOpts = opts.filter(o => o.dataset.group === groupLabel);
      const hasVisible = groupOpts.some(o => o.style.display !== 'none');
      header.style.display = hasVisible ? '' : 'none';
    }

    if (noMatch) noMatch.style.display = anyVisible ? 'none' : '';

    const enabled = this._enabledOptionDivs();
    this.#highlightIdx = enabled.length ? 0 : -1;
    this._applyHighlight();
  }

  // Show every option/header and hide the no-matches row — the inverse of a
  // filter pass, used when a search is abandoned (close) rather than applied.
  _resetFilter() {
    for (const opt of this._menu.querySelectorAll('.option')) opt.style.display = '';
    for (const header of this._menu.querySelectorAll('.group-header')) header.style.display = '';
    const noMatch = this._menu.querySelector('.no-matches');
    if (noMatch) noMatch.style.display = 'none';
  }

  // --- Document listeners ---

  _addDocListeners() {
    addOverlayListeners(this, (e) => !this.contains(e.target) && !this.shadowRoot.contains(e.target));
  }

  _removeDocListeners() {
    removeOverlayListeners(this);
  }
}

customElements.define('base-select', BaseSelect);
