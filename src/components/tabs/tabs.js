// <base-tabs> + <base-tab> — accessible tab panel component with keyboard navigation
import { nextEnabledIndex } from '../shared/menu-nav.js';
import { shadowStyles } from '../shared/shadow-styles.js';
import { upgradeProperties } from '../shared/upgrade-properties.js';

const tabsStyles = shadowStyles([
  ':host { display: block; }',
  '[role="tablist"] {',
  '  display: flex;',
  '  flex-direction: row;',
  '  border-bottom: 1px solid var(--border-color, #27272a);',
  '  background: var(--bg-surface, #18181b);',
  '  margin: 0;',
  '  padding: 0;',
  '  gap: 0;',
  '}',
  'button {',
  '  background: none;',
  '  border: none;',
  '  border-bottom: 2px solid transparent;',
  '  color: var(--text-dim, #a1a1aa);',
  '  font-family: var(--font-mono, monospace);',
  '  font-size: 13px;',
  '  padding: 6px 12px;',
  '  cursor: pointer;',
  '  border-radius: 0;',
  '  outline: none;',
  '  margin-bottom: -1px;',
  '  transition: color 0.1s, border-color 0.1s;',
  '}',
  'button:hover:not(:disabled) {',
  '  color: var(--text, #fafafa);',
  '}',
  'button[aria-selected="true"] {',
  '  color: var(--accent, #e8a308);',
  '  border-bottom-color: var(--accent, #e8a308);',
  '}',
  'button:disabled {',
  '  opacity: 0.4;',
  '  cursor: not-allowed;',
  '}',
  '.panel-container {',
  '  padding: 0;',
  '}',
].join('\n'));

const tabsTemplate = document.createElement('template');
tabsTemplate.innerHTML = [
  '<div role="tablist"></div>',
  '<div class="panel-container"><slot></slot></div>',
].join('');

class BaseTabs extends HTMLElement {
  // Member convention (library-wide — see docs/base-components.md): `#member` is
  // hard-private internal state; `_member` is deliberately reachable by a friend
  // module or test. Here `_updateTabs` is reached by the sibling BaseTab class
  // (on attribute changes) and by tabs.test.js — it stays `_`; everything else
  // is #private.
  #tablist = null;
  #activeIndex = 0;
  #tabs = [];
  // Set while selectTab is moving the `active` attribute between tabs, so the
  // resulting BaseTab.attributeChangedCallback → _updateTabs re-entry is skipped:
  // selectTab already updated the buttons in place, so a full rebuild would only
  // churn DOM (and detach live button references) to reach the same state.
  #syncingActiveAttr = false;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    tabsStyles.adopt(this.shadowRoot);
    this.shadowRoot.appendChild(tabsTemplate.content.cloneNode(true));
    this.#tablist = this.shadowRoot.querySelector('[role="tablist"]');

    this.#tablist.addEventListener('keydown', (e) => this.#onKeydown(e));

    const slot = this.shadowRoot.querySelector('slot');
    if (slot) {
      slot.addEventListener('slotchange', () => this._updateTabs());
    }
  }

  connectedCallback() {
    this._updateTabs();
    // After _updateTabs: the activeIndex setter selects among the built tabs.
    upgradeProperties(this);
  }

  get activeIndex() {
    return this.#activeIndex;
  }

  set activeIndex(i) {
    this.selectTab(i);
  }

  _updateTabs() {
    // Ignore the re-entrant call selectTab provokes when it moves `active`.
    if (this.#syncingActiveAttr) return;

    const children = Array.from(this.children).filter(
      (el) => el.tagName && el.tagName.toLowerCase() === 'base-tab'
    );
    this.#tabs = children;

    // Find initial active index: honour active attribute, else use current #activeIndex
    const markedActive = children.findIndex((el) => el.hasAttribute('active'));
    const initialIndex = markedActive !== -1
      ? markedActive
      : Math.max(0, Math.min(this.#activeIndex, children.length - 1));

    // Rebuild tab buttons
    this.#tablist.innerHTML = '';
    children.forEach((tabEl, idx) => {
      const btn = document.createElement('button');
      btn.textContent = tabEl.getAttribute('label') || '';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('tabindex', '-1');
      if (tabEl.hasAttribute('disabled')) {
        btn.disabled = true;
        btn.setAttribute('aria-disabled', 'true');
      }
      btn.addEventListener('click', () => {
        if (!btn.disabled) this.selectTab(idx);
      });
      this.#tablist.appendChild(btn);
    });

    // Set active (bypassing event dispatch for initial setup)
    this.#activeIndex = initialIndex;
    this.#applyActive();
  }

  selectTab(index) {
    if (index < 0 || index >= this.#tabs.length) return;
    const tabEls = this.#tabs;
    const tabEl = tabEls[index];
    if (tabEl && tabEl.hasAttribute('disabled')) return;

    // Persist the selection onto the light DOM by moving the `active` attribute
    // to the chosen tab. _updateTabs reruns on every slotchange and on any
    // observed attribute change of any tab, and it reconstructs the active index
    // from this attribute — so without moving it, a later rebuild (e.g. a host
    // app editing another tab's label) would snap the selection back to whichever
    // tab carried the original `active`. Guarded to only mutate attributes that
    // actually change. Each mutation synchronously re-enters _updateTabs via
    // BaseTab.attributeChangedCallback; #syncingActiveAttr makes that a no-op so
    // we update the buttons in place below instead of rebuilding the tablist.
    this.#syncingActiveAttr = true;
    tabEls.forEach((el, i) => {
      if (i === index) {
        if (!el.hasAttribute('active')) el.setAttribute('active', '');
      } else if (el.hasAttribute('active')) {
        el.removeAttribute('active');
      }
    });
    this.#syncingActiveAttr = false;

    this.#activeIndex = index;
    this.#applyActive();

    this.dispatchEvent(new CustomEvent('tab-change', {
      detail: { index, label: tabEl.getAttribute('label') || '' },
      bubbles: true,
      composed: true,
    }));
  }

  #applyActive() {
    const buttons = this.#tablist.querySelectorAll('button');
    buttons.forEach((btn, idx) => {
      const isActive = idx === this.#activeIndex;
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    // Show/hide panels
    this.#tabs.forEach((tabEl, idx) => {
      tabEl.style.display = idx === this.#activeIndex ? '' : 'none';
    });
  }

  #onKeydown(e) {
    if (this.#tabs.length === 0) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this.#moveActive(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this.#moveActive(-1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.selectTab(this.#activeIndex);
    }
  }

  // Step the active tab by `direction`, wrapping and skipping disabled tabs via
  // the shared bounded-lap helper (all-disabled terminates instead of spinning).
  #moveActive(direction) {
    const idx = nextEnabledIndex(
      this.#activeIndex,
      direction,
      this.#tabs.length,
      (i) => this.#tabs[i].hasAttribute('disabled'),
    );
    if (idx !== -1) this.selectTab(idx);
  }
}

customElements.define('base-tabs', BaseTabs);

// <base-tab> is a simple container; the parent <base-tabs> owns all display
// logic (show/hide via _applyActive), so no connection-time work is needed here.
class BaseTab extends HTMLElement {
  static observedAttributes = ['label', 'active', 'disabled'];

  attributeChangedCallback() {
    // Notify parent to re-evaluate if needed
    const parent = this.closest('base-tabs');
    if (parent && typeof parent._updateTabs === 'function') {
      parent._updateTabs();
    }
  }
}

customElements.define('base-tab', BaseTab);
