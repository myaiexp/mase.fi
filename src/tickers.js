// Sidebar header uptime + ping tickers — purely cosmetic, runs once initialized.

import { fakePing, formatUptime } from './uptime.js';

/**
 * Start the 1.2s interval that updates #uptime and #ping in the sidebar header.
 * @param {number} bootTime
 */
export function initTickers(bootTime) {
  const $uptime = /** @type {HTMLElement} */ (document.getElementById('uptime'));
  const $ping   = /** @type {HTMLElement} */ (document.getElementById('ping'));

  function tick() {
    $uptime.textContent = formatUptime(Date.now() - bootTime);
    $ping.textContent = fakePing() + 'ms';
  }

  tick();
  setInterval(tick, 1200);
}
