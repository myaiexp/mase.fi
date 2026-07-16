// Slash-command registry — easter-egg commands surfaced in the "/" autocomplete.
import { formatUptime } from './tickers.js';

// describeAgent: terse "Browser on OS" label from a userAgent (+ platform
// fallback). Pure so it can be pinned directly; order matters (Edge/Opera
// masquerade as Chrome, so test them first).
export function describeAgent(ua = '', platform = '') {
  const browser =
    /Firefox\//.test(ua) ? 'Firefox' :
    /Edg\//.test(ua) ? 'Edge' :
    /OPR\/|Opera/.test(ua) ? 'Opera' :
    /Chrome\//.test(ua) ? 'Chrome' :
    /Safari\//.test(ua) ? 'Safari' :
    'an unknown client';
  const os =
    /Android/.test(ua) ? 'Android' :
    /iPhone|iPad|iPod/.test(ua) ? 'iOS' :
    /Linux/.test(ua) ? 'Linux' :
    /Mac OS X|Macintosh/.test(ua) ? 'macOS' :
    /Windows/.test(ua) ? 'Windows' :
    (platform || 'an unknown OS');
  return `${browser} on ${os}`;
}

// formatServerTime: terse "Wed 24 Jun 2026 · 14:32:05" — deterministic given a Date.
export function formatServerTime(d) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const mons = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const p2 = (n) => String(n).padStart(2, '0');
  return `${days[d.getDay()]} ${p2(d.getDate())} ${mons[d.getMonth()]} ${d.getFullYear()}` +
    ` \xb7 ${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}`;
}

/**
 * Build the slash-command list. `ctx` supplies the runtime hooks each command
 * needs without slash-commands.js reaching into the DOM:
 *   - data:         normalized dataset (for meta.bootTime / meta.server)
 *   - clearSearch:  reset active search highlights + input
 *   - clearNotices: remove existing server-notice lines from the feed
 * Each command's `run()` returns a string or string[] to print as notice
 * line(s), or null/undefined for side-effect-only commands.
 */
export function buildCommands({ data = {}, clearSearch = () => {}, clearNotices = () => {} } = {}) {
  const cmds = [];

  cmds.push({
    name: 'help',
    desc: 'list commands',
    // Closes over `cmds` (populated below before any run() fires).
    run: () => [
      'mase.fi \xb7 slash commands:',
      ...cmds.map((c) => `  /${c.name.padEnd(7)} ${c.desc}`),
      '  /<chan>  jump to a channel (try /home, /activity)',
    ],
  });

  cmds.push({
    name: 'whoami',
    desc: "who's asking",
    run: () => {
      const ua = (typeof navigator !== 'undefined' && navigator.userAgent) || '';
      const plat = (typeof navigator !== 'undefined' && navigator.platform) || '';
      const scr = (typeof screen !== 'undefined' && screen.width)
        ? `${screen.width}\xd7${screen.height}` : 'unknown';
      return `guest!~visitor@hidden \xb7 ${describeAgent(ua, plat)} \xb7 ${scr} \xb7 welcome, stranger`;
    },
  });

  cmds.push({
    name: 'uptime',
    desc: 'connection uptime',
    run: () => {
      const boot = data?.meta?.bootTime ?? Date.now();
      const ping = 11 + Math.floor(Math.random() * 7);
      return `${data?.meta?.server || 'irc.mase.fi'} \xb7 up ${formatUptime(Date.now() - boot)} \xb7 ping ${ping}ms`;
    },
  });

  cmds.push({
    name: 'date',
    desc: 'server time',
    run: () => `server time \xb7 ${formatServerTime(new Date())}`,
  });

  cmds.push({
    name: 'clear',
    desc: 'clear search + notices',
    run: () => { clearSearch(); clearNotices(); return null; },
  });

  return cmds;
}
