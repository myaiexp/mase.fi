// Feed rendering — day separators, IRC-style rows, with modem-jitter arrival
import { entriesFor } from './data.js';
import { playJitter, clearJitter } from './jitter.js';

export { clearJitter };

const MAX_JITTER = 14;

// Local duplicate (avoids a util module for one tiny function)
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function nickColor(nick) {
  const palette = ['#e8a308', '#ffbe2a', '#f59e0b', '#eab308', '#a16207', '#fcd34d', '#fbbf24'];
  let h = 0;
  for (const c of nick) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  if (nick === 'git') return '#06b6d4';
  if (nick === 'mase') return '#e8a308';
  return palette[Math.abs(h) % palette.length];
}

function dayLabel(date) {
  const d = new Date(date + 'Z').toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  if (d === today) return 'today \xb7 ' + d;
  if (d === yest) return 'yesterday \xb7 ' + d;
  return d;
}

function feedRowHTML(e, ch) {
  const time = e.date.slice(11, 16);
  const nickC = nickColor(e.nick);
  const projPill = ch === 'activity' && e.project
    ? '<span class="proj-pill">#' + e.project + '</span>'
    : '';
  return '<div class="ts">' + time + '</div>' +
    '<div class="nick" style="--nick-color:' + nickC + '">' + e.nick + '</div>' +
    '<div class="msg">' + projPill + escapeHtml(e.text) + '</div>';
}

/** Render the feed for the given channel. Replaces #feed content. */
export function renderFeed(id, data, { immediate = false } = {}) {
  clearJitter();
  const entries = entriesFor(id, data);
  const $feed = document.getElementById('feed');
  const frag = document.createDocumentFragment();
  let lastDay = null;
  const rowEls = [];
  entries.forEach(e => {
    const d = e.date.slice(0, 10);
    if (d !== lastDay) {
      const day = document.createElement('div');
      day.className = 'feed-day';
      const ruleA = document.createElement('span'); ruleA.className = 'd-rule'; ruleA.textContent = '──';
      const lbl   = document.createElement('span'); lbl.className = 'd-label'; lbl.textContent = dayLabel(e.date);
      const ruleB = document.createElement('span'); ruleB.className = 'd-rule-after';
      day.appendChild(ruleA); day.appendChild(lbl); day.appendChild(ruleB);
      frag.appendChild(day);
      lastDay = d;
    }
    const row = document.createElement('div');
    row.className = 'feed-row cat-' + e.cat;
    // feedRowHTML returns HTML with user text escaped via escapeHtml
    row.innerHTML = feedRowHTML(e, id);
    frag.appendChild(row);
    rowEls.push({ row, entry: e });
  });
  $feed.innerHTML = '';
  $feed.appendChild(frag);
  $feed.scrollTop = $feed.scrollHeight;

  if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const tail = rowEls.slice(-MAX_JITTER);
  playJitter(tail);
}
