// Shadow stylesheet and template for <base-tabs>

import { shadowStyles } from '../shared/shadow-styles.js';

export const tabsStyles = shadowStyles([
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

export const tabsTemplate = document.createElement('template');
tabsTemplate.innerHTML = [
  '<div role="tablist"></div>',
  '<div class="panel-container"><slot></slot></div>',
].join('');
