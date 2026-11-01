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
// <span>, base-context-menu's .item and base-select's .option. Interpolate after
// the selector — e.g. `.item {${MENU_ITEM_CSS}\n}`. Each component layers its own
// state rules (.danger, .highlighted, .selected) on top.
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

// A disabled menu row, on top of MENU_ITEM_CSS. Interpolate into each component's
// disabled-row rule; hover/highlight suppression stays there because the selectors
// differ.
export const MENU_DISABLED_CSS = `
    opacity: 0.4;
    cursor: default;`;

// The <hr> between menu rows. Interpolate after the selector: `hr {${MENU_DIVIDER_CSS}\n}`.
export const MENU_DIVIDER_CSS = `
    border: none;
    border-top: 1px solid var(--border-color, #27272a);
    margin: 4px 0;`;
