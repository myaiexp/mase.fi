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
