// Shadow DOM stylesheet for <base-select> — trigger, menu surface, options, groups

import { MENU_SURFACE_CSS } from '../shared/menu-styles.js';

export const selectStyles = `<style>
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
    max-height: 200px;
    overflow-y: auto;${MENU_SURFACE_CSS}
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
</style>`;
