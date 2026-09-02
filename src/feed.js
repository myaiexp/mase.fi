// Feed rendering — day separators, IRC-style rows, windowed with lazy scroll-up
import { entriesFor } from './data.js';
import { dayOf, timeOf } from './dates.js';
import { playJitter, clearJitter } from './jitter.js';
import { relayoutAll, layoutRow, measureFeedMetrics } from './feed-layout.js';

const MAX_JITTER = 14;
// Rows materialized on first paint / revealed per scroll-up batch. Windowing
// caps the DOM build + pretext relayout to this many rows per channel switch,
// so #activity's thousands of log entries don't force a full-history layout
// pass on every switch and every resize. Older rows lazy-load when the top
// sentinel scrolls into view (see ensureWindow / revealOlder).
const WINDOW_SIZE = 200;

// Per-feed-element wiring state, keyed by the $feed node rather than held in
// module-level singletons. Keeping the state on the element means a fresh feed
// element — a new render target, or a fresh DOM in a test — gets its own wiring
// instead of inheriting a stale "already wired" flag. The state lives and dies
// with the element it keys on, so no reset hook is needed between renders/tests.
const chipNavWired = new WeakSet();
const resizeObservers = new WeakMap();
// Per-feed windowing state: the full ascending entry list for the current
// channel, how many newest rows are materialized, the channel id, and the live
// top-sentinel IntersectionObserver. Reset wholesale on every renderFeed.
const windowState = new WeakMap();

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
  const today = dayOf(new Date().toISOString());
  const yest = dayOf(new Date(Date.now() - 86400000).toISOString());
  if (d === today) return 'today \xb7 ' + d;
  if (d === yest) return 'yesterday \xb7 ' + d;
  return d;
}

function populateRow(row, e, ch) {
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
  if (ch === 'activity' && e.project) {
    row.dataset.project = e.project;
    // Mapped chips are real links into the sidebar's channel list; unmapped
    // chips (slugs without a sidebar channel) render as labels. feed-layout
    // reads this to pick the right styling and click affordance.
    if (e.mappedChannel) row.dataset.target = e.mappedChannel;
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
function buildRows(entries, channelId) {
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
    row.className = 'feed-row cat-' + e.cat;
    populateRow(row, e, channelId);
    frag.appendChild(row);
    rowEls.push({ row, entry: e });
  }
  return { frag, rowEls };
}

/** Render the feed for the given channel. Replaces #feed content. */
export function renderFeed(id, data, { immediate = false, navigate } = {}) {
  clearJitter();
  const entries = entriesFor(id, data);
  const $feed = document.getElementById('feed');

  // Drop the previous channel's lazy-load observer before rebuilding, so a rapid
  // switch can't leak observers or fire a reveal against the new channel's rows.
  windowState.get($feed)?.io?.disconnect();

  // Render only the newest WINDOW_SIZE entries; older ones lazy-load on scroll-up.
  const shown = Math.min(WINDOW_SIZE, entries.length);
  const { frag, rowEls } = buildRows(entries.slice(entries.length - shown), id);

  // The top sentinel precedes the rows and is watched by the IntersectionObserver
  // to materialize the next older batch. It exists only when older entries remain.
  const sentinel = document.createElement('div');
  sentinel.className = 'feed-top-sentinel';
  sentinel.setAttribute('aria-hidden', 'true');
  $feed.replaceChildren(sentinel, frag);

  // Pretext lays out each .msg into <span class="line"> children.
  // Must run after rows are in the DOM so .msg has a measurable width.
  relayoutAll($feed);
  ensureResizeObserver($feed);
  ensureChipNav($feed, navigate);
  $feed.dispatchEvent(new CustomEvent('feed:relayout'));

  $feed.scrollTop = $feed.scrollHeight;

  const state = { entries, shown, channelId: id, io: null };
  windowState.set($feed, state);
  if (shown < entries.length) ensureWindow($feed, state, sentinel);
  else sentinel.remove();

  if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const tail = rowEls.slice(-MAX_JITTER);
  playJitter(tail);
}

// Watch the top sentinel; when it nears the top of the scroll viewport and older
// entries remain, prepend the next older batch. rootMargin prefetches a batch
// before the user hits the very top so the reveal feels seamless.
function ensureWindow($feed, state, sentinel) {
  const io = new IntersectionObserver((records) => {
    if (records.some(r => r.isIntersecting)) revealOlder($feed, state, sentinel);
  }, { root: $feed, rootMargin: '300px 0px 0px 0px' });
  state.io = io;
  io.observe(sentinel);
}

// Prepend the WINDOW_SIZE entries just older than the current window, anchoring
// scroll so the viewport stays put as content grows above it. Only the newly
// added rows are laid out, so a reveal costs one batch, not the full history.
function revealOlder($feed, state, sentinel) {
  const { entries, shown, channelId } = state;
  if (shown >= entries.length) { state.io?.disconnect(); sentinel.remove(); return; }

  const nextShown = Math.min(shown + WINDOW_SIZE, entries.length);
  const older = entries.slice(entries.length - nextShown, entries.length - shown);
  // The day the current window opens on, and its (now-leading) day header — used
  // to dedup the seam when the older batch ends on that same calendar day.
  const seamDay = dayOf(entries[entries.length - shown].date);
  const seamHeader = $feed.querySelector('.feed-day');

  const { frag, rowEls } = buildRows(older, channelId);

  const prevHeight = $feed.scrollHeight;
  $feed.insertBefore(frag, sentinel.nextSibling);
  // Seam dedup: if the older batch's newest entry shares the window's opening day,
  // that day's header now appears twice — drop the window's (now mid-day) one.
  if (dayOf(older[older.length - 1].date) === seamDay) seamHeader?.remove();

  // populateRow leaves .msg empty; wrapping grows the rows. Lay them out
  // before reading the new scrollHeight, otherwise the compensation under-shoots.
  const m = measureFeedMetrics($feed);
  if (m && m.msgWidth > 0) for (const { row } of rowEls) layoutRow(row, m.msgWidth, m.font);
  $feed.scrollTop += $feed.scrollHeight - prevHeight;
  $feed.dispatchEvent(new CustomEvent('feed:relayout'));

  state.shown = nextShown;
  if (nextShown >= entries.length) { state.io?.disconnect(); sentinel.remove(); }
}

// Click-delegate proj-pill chips that carry a data-target — those are the
// chips whose slug resolves to a sidebar channel. Unmapped chips have no
// data-target and fall through to no-op. One listener per feed element.
// navigate is injected by the caller (channels.js) rather than imported, so the
// feed doesn't take an import edge back into the routing orchestrator.
function ensureChipNav($feed, navigate) {
  if (chipNavWired.has($feed)) return;
  chipNavWired.add($feed);
  $feed.addEventListener('click', (e) => {
    const chip = e.target.closest('.proj-pill[data-target]');
    if (!chip || !$feed.contains(chip)) return;
    e.preventDefault();
    navigate?.(chip.dataset.target);
  });
}

// Re-lay out feed rows when the available .msg column width changes (e.g. the
// pane reflowed on viewport resize). One observer per feed element — installed
// lazily on first render. rAF-debounced so we don't thrash during drag-resize.
// The per-observer width/rAF state lives in this closure (not module scope), so
// each feed element's observer tracks its own width independently. relayoutAll
// only touches the materialized (windowed) rows, so the cost stays bounded.
function ensureResizeObserver($feed) {
  if (resizeObservers.has($feed)) return;
  // Seed with the post-initial-layout width so the observer's first auto-fire
  // doesn't trigger a redundant relayout right after renderFeed finishes.
  const seedProbe = $feed.querySelector('.feed-row .msg');
  let lastMsgWidth = seedProbe ? seedProbe.getBoundingClientRect().width : 0;
  let resizeRaf = 0;
  const obs = new ResizeObserver(() => {
    if (resizeRaf) return;
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      const probe = $feed.querySelector('.feed-row .msg');
      const w = probe ? probe.getBoundingClientRect().width : 0;
      if (!w || w === lastMsgWidth) return;
      lastMsgWidth = w;
      relayoutAll($feed);
      // Notify listeners (e.g. command.js search) so they can re-decorate.
      $feed.dispatchEvent(new CustomEvent('feed:relayout'));
    });
  });
  resizeObservers.set($feed, obs);
  obs.observe($feed);
}
