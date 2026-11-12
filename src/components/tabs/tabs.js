// <base-tabs> + <base-tab> — accessible tab panel component with keyboard navigation
import { nextEnabledIndex } from '../shared/menu-nav.js';
import { mountShadow } from '../shared/mount-shadow.js';
import { tabsStyles, tabsTemplate } from './tabs-styles.js';
import { upgradeProperties } from '../shared/upgrade-properties.js';

// Panels need a stable id for aria-controls. An author-set id wins; otherwise
// one is assigned once and kept, so a tablist rebuild does not retarget AT.
let tabPanelSeq = 0;
/** @param {HTMLElement} tabEl */
function ensurePanelId(tabEl) {
  if (!tabEl.id) {
    tabPanelSeq += 1;
    tabEl.id = `base-tab-panel-${tabPanelSeq}`;
  }
  return tabEl.id;
}

class BaseTabs extends HTMLElement {
  // Member convention (library-wide — see docs/base-components.md): `#member` is
  // hard-private internal state; `_member` is deliberately reachable by a friend
  // module or test. Here `_updateTabs` is reached by the sibling BaseTab class
  // (on attribute changes) and by tabs.test.js — it stays `_`; everything else
  // is #private.
  /** @type {HTMLElement} */
  #tablist;
  #activeIndex = 0;
  /** @type {HTMLElement[]} */
  #tabs = [];
  // Set while selectTab is moving the `active` attribute between tabs, so the
  // resulting BaseTab.attributeChangedCallback → _updateTabs re-entry is skipped:
  // selectTab already updated the buttons in place, so a full rebuild would only
  // churn DOM (and detach live button references) to reach the same state.
  #syncingActiveAttr = false;

  constructor() {
    super();
    mountShadow(this, tabsStyles, tabsTemplate);
    const root = /** @type {ShadowRoot} */ (this.shadowRoot);
    this.#tablist = /** @type {HTMLElement} */ (root.querySelector('[role="tablist"]'));

    this.#tablist.addEventListener('keydown', (e) => this.#onKeydown(/** @type {KeyboardEvent} */ (e)));

    const slot = root.querySelector('slot');
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

  /** @param {number} i */
  set activeIndex(i) {
    this.selectTab(i);
  }

  _updateTabs() {
    // Ignore the re-entrant call selectTab provokes when it moves `active`.
    if (this.#syncingActiveAttr) return;

    const children = /** @type {HTMLElement[]} */ (Array.from(this.children)).filter(
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
      const panelId = ensurePanelId(tabEl);
      const btn = document.createElement('button');
      btn.id = `${panelId}-tab`;
      btn.textContent = tabEl.getAttribute('label') || '';
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', 'false');
      btn.setAttribute('aria-controls', panelId);
      btn.setAttribute('tabindex', '-1');
      tabEl.setAttribute('role', 'tabpanel');
      tabEl.setAttribute('aria-labelledby', btn.id);
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

  /** @param {number} index */
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
    const buttons = /** @type {NodeListOf<HTMLButtonElement>} */ (this.#tablist.querySelectorAll('button'));
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

  /** @param {KeyboardEvent} e */
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
  /** @param {number} direction */
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
    const parent = /** @type {BaseTabs | null} */ (this.closest('base-tabs'));
    if (parent && typeof parent._updateTabs === 'function') {
      parent._updateTabs();
    }
  }
}

customElements.define('base-tab', BaseTab);
