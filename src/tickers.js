// Sidebar header uptime + ping tickers — purely cosmetic, runs once initialized.

import { fakePing, formatUptime } from './uptime.js';

/** Start the 1.2s interval that updates #uptime and #ping in the sidebar header. */
export function initTickers(bootTime) {
  const $uptime = document.getElementById('uptime');
  const $ping   = document.getElementById('ping');

  function tick() {
    $uptime.textContent = formatUptime(Date.now() - bootTime);
    $ping.textContent = fakePing() + 'ms';
  }

  tick();
  setInterval(tick, 1200);
}
