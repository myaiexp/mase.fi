// <base-tabs> + <base-tab> — accessible tab panel component with keyboard navigation
import { wrapIndex } from '../shared/menu-nav.js';

const tabsTemplate = document.createElement('template');
tabsTemplate.innerHTML = [
  '<style>',
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
  '</style>',
  '<div role="tablist"></div>',
  '<div class="panel-container"><slot></slot></div>',
].join('');

class BaseTabs extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(tabsTemplate.content.cloneNode(true));
    this._tablist = this.shadowRoot.querySelector('[role="tablist"]');
    this._activeIndex = 0;
    this._tabs = [];

    this._tablist.addEventListener('keydown', (e) => this._onKeydown(e));

    const slot = this.shadowRoot.querySelector('slot');
    if (slot) {
      slot.addEventListener('slotchange', () => this._updateTabs());
    }
  }

  connectedCallback() {
    this._updateTabs();
  }

  get activeIndex() {
    return this._activeIndex;
  }

  set activeIndex(i) {
    this.selectTab(i);
  }

  _updateTabs() {
    const children = Array.from(this.children).filter(
      (el) => el.tagName && el.tagName.toLowerCase() === 'base-tab'
    );
    this._tabs = children;

    // Find initial active index: honour active attribute, else use current _activeIndex
    const markedActive = children.findIndex((el) => el.hasAttribute('active'));
    const initialIndex = markedActive !== -1
      ? markedActive
      : Math.max(0, Math.min(this._activeIndex, children.length - 1));

    // Rebuild tab buttons
    this._tablist.innerHTML = '';
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
      this._tablist.appendChild(btn);
    });

    // Set active (bypassing event dispatch for initial setup)
    this._activeIndex = initialIndex;
    this._applyActive();
  }

  selectTab(index) {
    if (index < 0 || index >= this._tabs.length) return;
    const tabEl = this._tabs[index];
    if (tabEl && tabEl.hasAttribute('disabled')) return;

    this._activeIndex = index;
    this._applyActive();

    this.dispatchEvent(new CustomEvent('tab-change', {
      detail: { index, label: tabEl.getAttribute('label') || '' },
      bubbles: true,
      composed: true,
    }));
  }

  _applyActive() {
    const buttons = this._tablist.querySelectorAll('button');
    buttons.forEach((btn, idx) => {
      const isActive = idx === this._activeIndex;
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      btn.setAttribute('tabindex', isActive ? '0' : '-1');
    });

    // Show/hide panels
    this._tabs.forEach((tabEl, idx) => {
      tabEl.style.display = idx === this._activeIndex ? '' : 'none';
    });
  }

  _onKeydown(e) {
    if (this._tabs.length === 0) return;

    if (e.key === 'ArrowRight') {
      e.preventDefault();
      this._moveActive(1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      this._moveActive(-1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.selectTab(this._activeIndex);
    }
  }

  // Step the active tab by `direction`, wrapping and skipping disabled tabs.
  // Bounded to one lap so an all-disabled tablist terminates instead of spinning.
  _moveActive(direction) {
    const len = this._tabs.length;
    let idx = this._activeIndex;

    for (let step = 0; step < len; step++) {
      idx = wrapIndex(idx, direction, len);
      if (!this._tabs[idx].hasAttribute('disabled')) {
        this.selectTab(idx);
        return;
      }
    }
  }
}

customElements.define('base-tabs', BaseTabs);

// <base-tab> is a simple container; display logic controlled by parent <base-tabs>
class BaseTab extends HTMLElement {
  static observedAttributes = ['label', 'active', 'disabled'];

  connectedCallback() {
    // Initial hide; parent will set visibility via _applyActive
    // No action needed here — parent manages display
  }

  attributeChangedCallback() {
    // Notify parent to re-evaluate if needed
    const parent = this.closest('base-tabs');
    if (parent && typeof parent._updateTabs === 'function') {
      parent._updateTabs();
    }
  }
}

customElements.define('base-tab', BaseTab);
