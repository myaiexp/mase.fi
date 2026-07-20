// Shadow DOM stylesheet for <base-select> — trigger, menu surface, options, groups

import { MENU_SURFACE_CSS } from '../shared/menu-styles.js';

export const selectStyles = `<style>
  /* Intrinsic width — the control sizes to its widest option, like a native
     <select>, instead of filling whatever box it lands in. A width:100% default
     is invisible inside a nowrap flex row (the item just gets squeezed) but
     claims an entire line the moment that row wraps, so every consumer had to
     pin a width by hand. Opt into filling with the "stretch" attribute, matching
     base.css's .btn-stretch idiom.
     min-width:0 + max-width:100% keep it shrinkable inside a flex row and never
     wider than its container; the trigger ellipsizes rather than overflowing. */
  :host {
    display: inline-block;
    position: relative;
    font-family: var(--font-mono, monospace);
    min-width: 0;
    max-width: 100%;
  }
  :host([stretch]) {
    display: block;
    width: 100%;
  }
  /* Trigger and sizer share one grid cell: the column takes the wider of the two,
     so the width is the widest OPTION rather than the current selection — the
     control doesn't twitch when the value changes. */
  [part="trigger-wrap"] {
    display: grid;
  }
  [part="trigger-wrap"] > * {
    grid-area: 1 / 1;
    min-width: 0;
  }
  button, input, .sizer {
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
  button, input {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Zero-height and hidden: contributes width only. box-sizing:border-box folds
     its padding and border into the 0, so it adds nothing to the row height. */
  .sizer {
    height: 0;
    visibility: hidden;
    overflow: hidden;
    pointer-events: none;
  }
  .sizer > span {
    display: block;
    white-space: nowrap;
  }
  button.sm, input.sm, .sizer.sm {
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
