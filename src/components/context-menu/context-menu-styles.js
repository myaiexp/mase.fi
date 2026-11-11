// Shadow stylesheet for <base-context-menu>

import { MENU_DISABLED_CSS, MENU_DIVIDER_CSS, MENU_ITEM_CSS, MENU_SURFACE_CSS } from '../shared/menu-styles.js';
import { shadowStyles } from '../shared/shadow-styles.js';

export const contextMenuStyles = shadowStyles(`
  :host {
    display: contents;
  }
  [part="menu"] {
    position: fixed;
    z-index: 1000;
    min-width: 140px;
    max-width: 260px;${MENU_SURFACE_CSS}
  }
  [part="menu"][hidden] {
    display: none;
  }
  .item {${MENU_ITEM_CSS}
  }
  .item.highlighted {
    background: var(--bg-hover, #27272a);
  }
  .item.disabled {
    color: var(--text-muted, #52525b);${MENU_DISABLED_CSS}
  }
  .item.disabled.highlighted {
    background: transparent;
  }
  /* A finger is not a mouse pointer: 4px rows at 13px are a target you miss. */
  @media (pointer: coarse) {
    .item {
      padding: 10px 14px;
      font-size: 15px;
    }
  }
  hr {${MENU_DIVIDER_CSS}
  }
`);
