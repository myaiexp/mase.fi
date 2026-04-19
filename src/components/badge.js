// <base-badge> — status/tag chip per design system (Recipes A & B)

const STATUS_VARIANTS = {
  running: { color: 'var(--green)',    tint: 8 },
  idle:    { color: 'var(--text-dim)', tint: 4 },
  queued:  { color: 'var(--orange)',   tint: 8 },
  error:   { color: 'var(--red)',      tint: 8 },
};

const TAG_VARIANTS = {
  feature:  { color: 'var(--blue)',     tint: 8 },
  security: { color: 'var(--red)',      tint: 8 },
  chore:    { color: 'var(--text-dim)', tint: 4 },
};

const template = document.createElement('template');
template.innerHTML = `
<style>
  :host { display: inline-flex; vertical-align: middle; }
  span {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: 16px;
    padding: 0 6px;
    font-family: var(--font-mono, monospace);
    font-size: var(--text-sm, 11px);
    font-weight: 500;
    line-height: 1;
    color: var(--bb-color, var(--text-dim, inherit));
    background: color-mix(in srgb, var(--bb-color, transparent) var(--bb-tint, 0%), transparent);
  }
  span.sm {
    height: 14px;
    font-size: var(--text-xs, 10px);
  }
  span.dot::before {
    content: "";
    width: 6px;
    height: 6px;
    background: currentColor;
    display: inline-block;
    flex-shrink: 0;
  }
</style>
<span><slot></slot></span>
`;

class BaseBadge extends HTMLElement {
  static observedAttributes = ['type', 'variant', 'color', 'size'];

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
    const type = this.getAttribute('type') || 'tag';
    const variant = this.getAttribute('variant');
    const colorOverride = this.getAttribute('color');
    const size = this.getAttribute('size');

    let color = null;
    let tint = 8;

    if (colorOverride) {
      color = colorOverride;
    } else if (variant) {
      const map = type === 'status' ? STATUS_VARIANTS : TAG_VARIANTS;
      const entry = map[variant];
      if (entry) {
        color = entry.color;
        tint = entry.tint;
      }
    }

    if (color) {
      this.style.setProperty('--bb-color', color);
      this.style.setProperty('--bb-tint', `${tint}%`);
    } else {
      this.style.removeProperty('--bb-color');
      this.style.removeProperty('--bb-tint');
    }

    this._span.classList.toggle('dot', type === 'status');
    this._span.classList.toggle('sm', size === 'sm');
  }
}

customElements.define('base-badge', BaseBadge);
