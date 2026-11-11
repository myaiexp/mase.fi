// Shadow stylesheet and template for <base-modal>

import { shadowStyles } from '../shared/shadow-styles.js';

export const modalStyles = shadowStyles(`
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
`);

export const modalTemplate = document.createElement('template');
modalTemplate.innerHTML = `
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
