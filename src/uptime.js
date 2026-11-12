// Cosmetic "server" readouts shared by the sidebar tickers and the /uptime command

/** @param {number} ms @returns {string} */
export function formatUptime(ms) {
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${d}d ${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m`;
}

/** A made-up round-trip time in ms, 11–17. Nothing is measured. */
export function fakePing() {
  return 11 + Math.floor(Math.random() * 7);
}
