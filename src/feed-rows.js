// Feed row DOM: nick colours, day separators and day-separated IRC-style rows
import { dayOf, entryNow, timeOf } from './dates.js';

const NICK_COLORS = { git: '#06b6d4', mase: '#e8a308' };

export function nickColor(nick) {
  if (Object.hasOwn(NICK_COLORS, nick)) return NICK_COLORS[nick];
  const palette = ['#e8a308', '#ffbe2a', '#f59e0b', '#eab308', '#a16207', '#fcd34d', '#fbbf24'];
  let h = 0;
  for (const c of nick) h = ((h << 5) - h + c.charCodeAt(0)) | 0;
  return palette[Math.abs(h) % palette.length];
}

export function dayLabel(date) {
  const d = dayOf(date);
  // Writers' "today" (entryNow), not the viewer's UTC day — see dates.js.
  const now = entryNow();
  const today = dayOf(new Date(now).toISOString());
  const yest = dayOf(new Date(now - 86400000).toISOString());
  if (d === today) return 'today \xb7 ' + d;
  if (d === yest) return 'yesterday \xb7 ' + d;
  return d;
}

function populateRow(row, e, channelId) {
  const time = timeOf(e.date);
  const nickC = nickColor(e.nick);

  const ts = document.createElement('div');
  ts.className = 'ts';
  ts.textContent = time;

  const nick = document.createElement('div');
  nick.className = 'nick';
  nick.style.setProperty('--nick-color', nickC);
  nick.textContent = e.nick;

  const msg = document.createElement('div');
  msg.className = 'msg';

  row.replaceChildren(ts, nick, msg);
  row.dataset.raw = e.text;
  if (channelId === 'activity' && e.projectSlug) {
    row.dataset.projectSlug = e.projectSlug;
    // Mapped chips are real links into the sidebar's channel list; unmapped
    // chips (slugs without a sidebar channel) render as labels. feed-layout
    // reads this to pick the right styling and click affordance.
    if (e.projectChannel) row.dataset.targetChannel = e.projectChannel;
  }
}

// A day-separator header element for the given ISO date.
function dayHeader(date) {
  const day = document.createElement('div');
  day.className = 'feed-day';
  const ruleA = document.createElement('span'); ruleA.className = 'd-rule'; ruleA.textContent = '──';
  const lbl   = document.createElement('span'); lbl.className = 'd-label'; lbl.textContent = dayLabel(date);
  const ruleB = document.createElement('span'); ruleB.className = 'd-rule-after';
  day.appendChild(ruleA); day.appendChild(lbl); day.appendChild(ruleB);
  return day;
}

// Build day-separated feed rows for `entries` (ascending) into a fragment. A
// day header is emitted whenever the calendar day changes within the batch.
// Returns the fragment plus row descriptors (for jitter / targeted relayout).
export function buildRows(entries, channelId) {
  const frag = document.createDocumentFragment();
  const rowEls = [];
  let lastDay = null;
  for (const e of entries) {
    const d = dayOf(e.date);
    if (d !== lastDay) {
      frag.appendChild(dayHeader(e.date));
      lastDay = d;
    }
    const row = document.createElement('div');
    row.className = 'feed-row cat-' + e.category;
    populateRow(row, e, channelId);
    frag.appendChild(row);
    rowEls.push({ row, entry: e });
  }
  return { frag, rowEls };
}
