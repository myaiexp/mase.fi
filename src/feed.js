// Feed rendering — day separators, IRC-style rows, with modem-jitter arrival
import { entriesFor } from './data.js';
import { playJitter, clearJitter } from './jitter.js';
import { relayoutAll } from './feed-layout.js';

export { clearJitter };

const MAX_JITTER = 14;

// Track ResizeObserver so we only attach it once across re-renders.
let _resizeObs = null;
let _resizeRaf = 0;
let _lastMsgWidth = 0;

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

function populateRow(row, e, ch) {
  const time = e.date.slice(11, 16);
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
  if (ch === 'activity' && e.project) row.dataset.project = e.project;
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
    populateRow(row, e, id);
    frag.appendChild(row);
    rowEls.push({ row, entry: e });
  });
  $feed.replaceChildren(frag);

  // Pretext lays out each .msg into <span class="line"> children.
  // Must run after rows are in the DOM so .msg has a measurable width.
  relayoutAll($feed);
  ensureResizeObserver($feed);
  $feed.dispatchEvent(new CustomEvent('feed:relayout'));

  $feed.scrollTop = $feed.scrollHeight;

  if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const tail = rowEls.slice(-MAX_JITTER);
  playJitter(tail);
}

// Re-lay out feed rows when the available .msg column width changes (e.g. the
// pane reflowed on viewport resize). One observer per feed element — installed
// lazily on first render. rAF-debounced so we don't thrash during drag-resize.
function ensureResizeObserver($feed) {
  if (_resizeObs) return;
  // Seed with the post-initial-layout width so the observer's first auto-fire
  // doesn't trigger a redundant relayout right after renderFeed finishes.
  const seedProbe = $feed.querySelector('.feed-row .msg');
  _lastMsgWidth = seedProbe ? seedProbe.getBoundingClientRect().width : 0;
  _resizeObs = new ResizeObserver(() => {
    if (_resizeRaf) return;
    _resizeRaf = requestAnimationFrame(() => {
      _resizeRaf = 0;
      const probe = $feed.querySelector('.feed-row .msg');
      const w = probe ? probe.getBoundingClientRect().width : 0;
      if (!w || w === _lastMsgWidth) return;
      _lastMsgWidth = w;
      relayoutAll($feed);
      // Notify listeners (e.g. command.js search) so they can re-decorate.
      $feed.dispatchEvent(new CustomEvent('feed:relayout'));
    });
  });
  _resizeObs.observe($feed);
}
