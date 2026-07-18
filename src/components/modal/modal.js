// <base-modal> — centered overlay dialog with slots, focus trap, and Escape/backdrop dismiss

const modalTemplate = document.createElement('template');
modalTemplate.innerHTML = `
<style>
  :host {
    display: contents;
  }

  [data-backdrop] {
    display: none;
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    z-index: 1000;
    align-items: center;
    justify-content: center;
    font-family: var(--font-mono, monospace);
    font-size: 13px;
  }

  :host([open]) [data-backdrop] {
    display: flex;
  }

  [data-content] {
    position: relative;
    background: var(--bg-raised, #18181b);
    color: var(--text, #fafafa);
    border: 1px solid var(--border-color, #3f3f46);
    border-radius: 0;
    width: 100%;
    max-width: 500px;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  [data-header] {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-color, #3f3f46);
    background: var(--bg-surface, #09090b);
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  [data-body] {
    padding: 16px;
    overflow-y: auto;
    flex: 1;
  }

  [data-footer] {
    padding: 12px 16px;
    border-top: 1px solid var(--border-color, #3f3f46);
    background: var(--bg-surface, #09090b);
    flex-shrink: 0;
  }

  button[data-close] {
    background: none;
    border: none;
    color: var(--text-muted, #a1a1aa);
    cursor: pointer;
    font-family: var(--font-mono, monospace);
    font-size: 13px;
    padding: 2px 6px;
    line-height: 1;
  }

  button[data-close]:hover {
    color: var(--text, #fafafa);
  }
</style>
<div data-backdrop>
  <div data-content>
    <div data-header>
      <slot name="header"></slot>
      <button data-close aria-label="Close">[x]</button>
    </div>
    <div data-body>
      <slot></slot>
    </div>
    <div data-footer>
      <slot name="footer"></slot>
    </div>
  </div>
</div>
`;

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

// True when `el` can actually receive focus: not disabled and not hidden. The
// FOCUSABLE_SELECTORS query is a coarse first pass; this is the precise gate.
// Visibility is checked on the element itself (hidden attribute, display:none,
// visibility:hidden/collapse) — the reliable signals in a layout-less DOM. The
// browser-only "ancestor display:none / zero-size" case isn't caught here.
function isFocusable(el) {
  if (el.disabled || el.getAttribute('aria-disabled') === 'true') return false;
  if (el.hidden) return false;
  const style = getComputedStyle(el);
  if (style.display === 'none') return false;
  if (style.visibility === 'hidden' || style.visibility === 'collapse') return false;
  return true;
}

class BaseModal extends HTMLElement {
  // Member convention (library-wide — see docs/base-components.md): `#member` is
  // hard-private internal state; `_member` is deliberately reachable by a friend
  // module or test. The focus-trap internals (`_handleKeyDown`,
  // `_getFocusableElements`, `_getLightFocusables`) are exercised directly by
  // modal.test.js — those stay `_`; everything else is #private.
  #open = false;
  #onKeyDown = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(modalTemplate.content.cloneNode(true));

    // Close button inside shadow root
    this.shadowRoot.querySelector('[data-close]').addEventListener('click', () => this.close());

    // Backdrop click — but not content clicks (stop propagation from content)
    const backdrop = this.shadowRoot.querySelector('[data-backdrop]');
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        this.close();
      }
    });

    // Prevent content clicks from reaching backdrop
    this.shadowRoot.querySelector('[data-content]').addEventListener('click', (e) => {
      e.stopPropagation();
    });
  }

  get isOpen() {
    return this.#open;
  }

  open() {
    this.#open = true;
    this.setAttribute('open', '');

    // Bind and register keydown handler
    this.#onKeyDown = (e) => this._handleKeyDown(e);
    document.addEventListener('keydown', this.#onKeyDown);

    // Focus the first user-meaningful field (a slotted light-DOM control) if one
    // exists; otherwise fall back to the shadow-root close button. The trap's
    // focusable list keeps the close button first to match the flattened Tab
    // order, so focusable[0] can't be used here — a slotted form field would
    // never receive the initial focus.
    requestAnimationFrame(() => {
      const lightDom = this._getLightFocusables();
      const target = lightDom[0] ?? this.shadowRoot.querySelector('[data-close]');
      if (target) target.focus();
    });
  }

  close() {
    this.#open = false;
    this.removeAttribute('open');

    if (this.#onKeyDown) {
      document.removeEventListener('keydown', this.#onKeyDown);
      this.#onKeyDown = null;
    }

    this.dispatchEvent(new CustomEvent('close', { bubbles: true, composed: true }));
  }

  _handleKeyDown(e) {
    if (!this.#open) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      this.close();
      return;
    }

    if (e.key === 'Tab') {
      const focusable = this._getFocusableElements();
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      // When focus is inside the shadow root (the close button), document.active-
      // Element reports the <base-modal> host rather than the button — so a raw
      // activeElement check never matches the close button and Shift+Tab escapes
      // the modal. shadowRoot.activeElement resolves focus *within* the shadow
      // tree; it is null for slotted light-DOM focus (those nodes live in the
      // document), so fall back to document.activeElement in that case.
      const active = this.shadowRoot.activeElement ?? document.activeElement;

      if (e.shiftKey) {
        // Shift+Tab: if on first, wrap to last
        if (active === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        // Tab: if on last, wrap to first
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  // Focusable controls from the slotted light DOM, already gated by isFocusable.
  // The selectors only filter [disabled] on the native-control clauses, so a
  // hidden control (hidden attr / display:none / visibility:hidden) or a disabled
  // element matched solely by the [tabindex] clause still slips through; drop
  // those — the trap must never park focus on something the user can't see or use.
  _getLightFocusables() {
    return Array.from(this.querySelectorAll(FOCUSABLE_SELECTORS)).filter((el) => isFocusable(el));
  }

  _getFocusableElements() {
    // Shadow-DOM focusables (the close button) come first: in the flattened Tab
    // order the close button is rendered ahead of the slotted content (it sits in
    // the header, after the non-interactive title slot). Keeping it first makes
    // the Tab/Shift+Tab wrap boundaries in _handleKeyDown match what the browser
    // actually does.
    const shadowDom = Array.from(this.shadowRoot.querySelectorAll(FOCUSABLE_SELECTORS)).filter((el) => isFocusable(el));
    return [...shadowDom, ...this._getLightFocusables()];
  }

  disconnectedCallback() {
    if (this.#onKeyDown) {
      document.removeEventListener('keydown', this.#onKeyDown);
      this.#onKeyDown = null;
    }
  }
}

customElements.define('base-modal', BaseModal);
