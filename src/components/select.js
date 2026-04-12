// <base-select>, <base-option>, <base-option-group> — custom select form control

// --- base-option ─────────────────────────────────────────────────────────────

class BaseOption extends HTMLElement {
  static observedAttributes = ['value', 'disabled', 'action'];
  get value() { return this.getAttribute('value') ?? ''; }
  get disabled() { return this.hasAttribute('disabled'); }
  get action() { return this.hasAttribute('action'); }
  get label() { return this.textContent.trim(); }
}

customElements.define('base-option', BaseOption);

// --- base-option-group ───────────────────────────────────────────────────────

class BaseOptionGroup extends HTMLElement {
  static observedAttributes = ['label'];
  get label() { return this.getAttribute('label') ?? ''; }
}

customElements.define('base-option-group', BaseOptionGroup);

// --- base-select ─────────────────────────────────────────────────────────────

const selectTemplate = document.createElement('template');
const style = document.createElement('style');
style.textContent = `
  :host {
    display: inline-block;
    position: relative;
    font-family: var(--font-mono, monospace);
    width: 100%;
  }
  button, input {
    display: block;
    width: 100%;
    box-sizing: border-box;
    padding: 6px 24px 6px 8px;
    font-size: 13px;
    font-family: var(--font-mono, monospace);
    color: var(--text, #fafafa);
    background: var(--bg-raised, #18181b);
    border: 1px solid var(--border-color, #27272a);
    border-radius: 0;
    cursor: pointer;
    text-align: left;
    outline: none;
    appearance: none;
  }
  button.sm, input.sm {
    padding: 3px 20px 3px 6px;
    font-size: 11px;
  }
  button .placeholder, input::placeholder {
    color: var(--text-muted, #71717a);
  }
  :host([disabled]) button,
  :host([disabled]) input {
    opacity: 0.4;
    cursor: default;
  }
  [part="menu"] {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 100;
    background: var(--bg-raised, #18181b);
    border: 1px solid var(--border-color, #27272a);
    border-radius: 0;
    padding: 4px 0;
    max-height: 200px;
    overflow-y: auto;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  }
  [part="menu"].flip {
    top: auto;
    bottom: 100%;
  }
  [part="menu"][hidden] {
    display: none;
  }
  .option {
    padding: 4px 12px;
    font-size: 13px;
    font-family: var(--font-mono, monospace);
    color: var(--text, #fafafa);
    cursor: pointer;
    white-space: nowrap;
    user-select: none;
  }
  .option:hover, .option.active {
    background: var(--bg-hover, #27272a);
  }
  .option.selected {
    color: var(--accent, #3b82f6);
  }
  .option.disabled {
    opacity: 0.4;
    cursor: default;
  }
  .option.disabled:hover {
    background: transparent;
  }
  .option.has-action {
    position: relative;
  }
  .option .action-btn {
    display: none;
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    width: auto;
    background: none;
    border: none;
    color: var(--text-muted, #71717a);
    cursor: pointer;
    padding: 0 4px;
    font-size: 11px;
    line-height: 1;
  }
  .option:hover .action-btn {
    display: inline-block;
  }
  .option .action-btn:hover {
    color: var(--text, #fafafa);
  }
  .group-header {
    padding: 4px 12px;
    font-size: 11px;
    font-family: var(--font-mono, monospace);
    color: var(--text-muted, #71717a);
    text-transform: uppercase;
    user-select: none;
  }
  .no-matches {
    padding: 4px 12px;
    font-size: 13px;
    font-family: var(--font-mono, monospace);
    color: var(--text-muted, #71717a);
  }
`;
const triggerWrap = document.createElement('div');
triggerWrap.setAttribute('part', 'trigger-wrap');
const menuDiv = document.createElement('div');
menuDiv.setAttribute('part', 'menu');
menuDiv.hidden = true;
selectTemplate.content.appendChild(style);
selectTemplate.content.appendChild(triggerWrap);
selectTemplate.content.appendChild(menuDiv);

const MENU_HEIGHT_ESTIMATE = 200;

class BaseSelect extends HTMLElement {
  static observedAttributes = ['value', 'placeholder', 'searchable', 'disabled', 'size'];

  #open = false;
  #highlightIdx = -1;
  #onDocClick = null;
  #onDocKeydown = null;
  #blurTimeout = null;
  #lastLetter = '';
  #lastLetterIdx = -1;

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

    const rect = this.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    this._menu.classList.toggle('flip', spaceBelow < MENU_HEIGHT_ESTIMATE);

    this._menu.hidden = false;

    // Highlight first enabled option
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

    // Restore input text for searchable
    if (this._searchable && this._trigger) {
      this._syncTriggerText();
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
    } else {
      if (sel) {
        this._trigger.textContent = sel.label;
      } else {
        const ph = this.getAttribute('placeholder') ?? '';
        if (ph) {
          const span = document.createElement('span');
          span.className = 'placeholder';
          span.textContent = ph;
          this._trigger.textContent = '';
          this._trigger.appendChild(span);
        } else {
          this._trigger.textContent = '';
        }
      }
    }
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
    // No-matches element (hidden by default)
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
    const label = div.textContent;
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
      this.#highlightIdx = this.#highlightIdx >= opts.length - 1 ? 0 : this.#highlightIdx + 1;
      this._applyHighlight();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.#highlightIdx = this.#highlightIdx <= 0 ? opts.length - 1 : this.#highlightIdx - 1;
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

    if (this.#lastLetter === lower && this.#lastLetterIdx >= 0) {
      // Same letter repeated — cycle to next match
      const nextIdx = (this.#lastLetterIdx + 1) % matches.length;
      this.#highlightIdx = matches[nextIdx];
      this.#lastLetterIdx = nextIdx;
    } else {
      // New letter — jump to first match
      this.#highlightIdx = matches[0];
      this.#lastLetter = lower;
      this.#lastLetterIdx = 0;
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

  // --- Document listeners ---

  _addDocListeners() {
    this.#onDocClick = (e) => {
      if (!this.contains(e.target) && !this.shadowRoot.contains(e.target)) this.close();
    };
    this.#onDocKeydown = (e) => {
      if (e.key === 'Escape') this.close();
    };
    document.addEventListener('click', this.#onDocClick);
    document.addEventListener('keydown', this.#onDocKeydown);
  }

  _removeDocListeners() {
    if (this.#onDocClick) {
      document.removeEventListener('click', this.#onDocClick);
      this.#onDocClick = null;
    }
    if (this.#onDocKeydown) {
      document.removeEventListener('keydown', this.#onDocKeydown);
      this.#onDocKeydown = null;
    }
  }
}

customElements.define('base-select', BaseSelect);
