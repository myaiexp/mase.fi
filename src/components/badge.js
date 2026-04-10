// <base-badge> — inline label with variant/color/size support
const VARIANT_COLORS = {
  success: 'var(--green)',
  danger: 'var(--red)',
  info: 'var(--blue)',
  warning: 'var(--orange)',
  neutral: 'var(--text-muted)',
};

const template = document.createElement('template');
template.innerHTML = `
<style>
  span {
    display: inline-flex;
    align-items: center;
    padding: 1px 6px;
    font-size: 11px;
    font-family: var(--font-mono, monospace);
    line-height: 1.4;
    border-radius: 0;
    background: var(--bg-surface);
    color: var(--text, #fafafa);
  }
  span.sm {
    font-size: 10px;
    padding: 0 4px;
  }
</style>
<span><slot></slot></span>
`;

class BaseBadge extends HTMLElement {
  static observedAttributes = ['variant', 'color', 'size'];

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
    this._span = this.shadowRoot.querySelector('span');
  }

  attributeChangedCallback() {
    this._update();
  }

  _update() {
    const variant = this.getAttribute('variant');
    const color = this.getAttribute('color');
    const size = this.getAttribute('size');

    // Clear variant classes
    for (const v of Object.keys(VARIANT_COLORS)) {
      this._span.classList.remove(v);
    }

    if (variant && VARIANT_COLORS[variant]) {
      this._span.classList.add(variant);
      this._span.style.backgroundColor = color || VARIANT_COLORS[variant];
    } else {
      this._span.style.backgroundColor = color || '';
    }

    this._span.classList.toggle('sm', size === 'sm');
  }
}

customElements.define('base-badge', BaseBadge);
