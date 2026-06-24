// Sidebar header uptime + ping tickers — purely cosmetic, runs once initialized.

export function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

/** Start the 1.2s interval that updates #uptime and #ping in the sidebar header. */
export function initChrome(bootTime) {
  const $uptime = document.getElementById('uptime');
  const $ping   = document.getElementById('ping');

  function tickChrome() {
    $uptime.textContent = formatUptime(Date.now() - bootTime);
    const ping = 11 + Math.floor(Math.random() * 7);
    $ping.textContent = ping + 'ms';
  }

  tickChrome();
  setInterval(tickChrome, 1200);
}
