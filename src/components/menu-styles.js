// Shared menu-surface CSS for overlay popups (base-select, base-dropdown, base-context-menu)

// The structural declarations every popup menu surface shares. Token properties
// (--bg-raised, --border-color) drive theming; the hex fallbacks must stay
// identical across components, so they live here once. Interpolate into each
// component's [part="menu"] rule alongside its own layout (position, width,
// max-height) — see select-styles.js, dropdown.js, context-menu.js.
export const MENU_SURFACE_CSS = `
    background: var(--bg-raised, #18181b);
    border: 1px solid var(--border-color, #27272a);
    border-radius: 0;
    padding: 4px 0;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);`;

// The base styling for a single clickable menu row, shared by base-dropdown's
// <span> and base-context-menu's .item. Both rendered identically except for a
// historical font-size drift (12 vs 13px); unifying here keeps them in lockstep.
// Interpolate after the selector — e.g. `.item {${MENU_ITEM_CSS}\n}`. Each
// component layers its own state rules (.danger, .disabled, .highlighted) on top.
export const MENU_ITEM_CSS = `
    display: block;
    padding: 4px 12px;
    font-size: 13px;
    font-family: var(--font-mono, monospace);
    color: var(--text, #fafafa);
    background: transparent;
    cursor: pointer;
    border-radius: 0;
    white-space: nowrap;
    user-select: none;`;
