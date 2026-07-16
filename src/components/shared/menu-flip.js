// Shared viewport-flip detection for menu overlays (<base-select>, <base-dropdown>)

// Estimated menu height in px. Used to decide, at open time, whether a menu
// opening downward would overflow the viewport bottom and should instead flip
// to open upward (the `.flip` class sets bottom: 100% / top: auto in each
// component's shadow stylesheet).
export const MENU_HEIGHT_ESTIMATE = 200;

// Toggle the `flip` class on `menu` when there isn't room for an estimated
// MENU_HEIGHT_ESTIMATE-tall menu below `host`. `host` supplies trigger geometry
// via getBoundingClientRect(); `menu` is the menu element being positioned.
export function applyMenuFlip(host, menu) {
  const rect = host.getBoundingClientRect();
  const spaceBelow = window.innerHeight - rect.bottom;
  menu.classList.toggle('flip', spaceBelow < MENU_HEIGHT_ESTIMATE);
}
