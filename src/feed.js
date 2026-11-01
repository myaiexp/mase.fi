// Feed rendering — day separators, IRC-style rows, windowed with lazy scroll-up
import { entriesFor, loadArchive } from './data.js';
import { dayOf } from './dates.js';
import { playJitter, clearJitter } from './jitter.js';
import { relayoutAll, relayoutRow, layoutRow, measureFeedMetrics } from './feed-layout.js';
import { buildRows } from './feed-rows.js';

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
// channel, how many newest rows are materialized (always the last `shown` of
// that list, which onWindowExhausted restores after a merge), the channel id, the
// live top-sentinel IntersectionObserver, and whether this render's archive load
// is in flight / settled. Reset wholesale on every renderFeed.
const windowState = new WeakMap();

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

  const needsArchive = id === 'activity' && data.hasArchive && !data.archiveLoaded;
  const state = { entries, shown, channelId: id, io: null, data, loadingArchive: false, archiveSettled: false };
  windowState.set($feed, state);
  if (shown < entries.length || needsArchive) ensureWindow($feed, state, sentinel);
  else sentinel.remove();

  // playJitter applies the reduced-motion policy itself.
  if (immediate) return;
  const tail = rowEls.slice(-MAX_JITTER);
  // Each row is laid out again from dataset.raw at the width it has when its
  // scramble ends, then announced like any other relayout so an active search
  // (command.js) re-marks it.
  playJitter(tail, (row) => {
    relayoutRow($feed, row);
    $feed.dispatchEvent(new CustomEvent('feed:relayout'));
  });
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
  if (shown >= entries.length) {
    onWindowExhausted($feed, state, sentinel);
    return;
  }

  const nextShown = Math.min(shown + WINDOW_SIZE, entries.length);
  const older = entries.slice(entries.length - nextShown, entries.length - shown);
  // The day the current window opens on, and its (now-leading) day header — used
  // to dedup the seam when the older batch ends on that same calendar day. An
  // empty window (#activity with every log archived) has no seam.
  const seamDay = shown > 0 ? dayOf(entries[entries.length - shown].date) : null;
  const seamHeader = $feed.querySelector('.feed-day');

  const { frag, rowEls } = buildRows(older, channelId);

  const prevHeight = $feed.scrollHeight;
  $feed.insertBefore(frag, sentinel.nextSibling);
  // Seam dedup: if the older batch's newest entry shares the window's opening day,
  // that day's header now appears twice — drop the window's (now mid-day) one.
  if (seamDay !== null && dayOf(older[older.length - 1].date) === seamDay) seamHeader?.remove();

  // populateRow leaves .msg empty; wrapping grows the rows. Lay them out
  // before reading the new scrollHeight, otherwise the compensation under-shoots.
  const m = measureFeedMetrics($feed);
  if (m && m.msgWidth > 0) for (const { row } of rowEls) layoutRow(row, m.msgWidth, m.font);
  $feed.scrollTop += $feed.scrollHeight - prevHeight;
  $feed.dispatchEvent(new CustomEvent('feed:relayout'));

  state.shown = nextShown;
  // That was the last in-memory batch: start the archive fetch (or retire the
  // sentinel) now instead of waiting for another intersection.
  if (nextShown >= entries.length) onWindowExhausted($feed, state, sentinel);
}

// Every in-memory entry is on screen. #activity asks for the archive once per
// render; any other channel has nothing older, so the sentinel is retired.
function onWindowExhausted($feed, state, sentinel) {
  const { channelId, data } = state;
  if (channelId !== 'activity' || !data.hasArchive || state.archiveSettled) {
    dropSentinel(state, sentinel);
    return;
  }
  if (state.loadingArchive) return;
  state.loadingArchive = true;
  // Going through loadArchive even when data.archiveLoaded is already true
  // refreshes state.entries for a render that started while another render's
  // fetch was still in flight. loadArchive never rejects: a failure leaves
  // data.archiveLoaded false and the entry list unchanged, so the sentinel
  // drops here — never a fetch per intersection. A later render may retry.
  loadArchive(data).then(() => {
    if (windowState.get($feed) !== state) return;
    state.loadingArchive = false;
    state.archiveSettled = true;
    const previous = state.entries;
    const before = previous.length;
    state.entries = entriesFor(channelId, data);
    if (!sameTail(previous, state.entries, state.shown)) rebuildWindow($feed, state, sentinel);
    if (state.shown < state.entries.length) revealOlder($feed, state, sentinel);
    else dropSentinel(state, sentinel);
    // navigate() already wrote the topic count from the hot window. The feed
    // can't import channels.js, so announce a merge that actually added rows.
    if (state.entries.length > before) $feed.dispatchEvent(new CustomEvent('feed:archive'));
  }).catch((err) => {
    // A render bug past the merge: retire the sentinel so every later
    // intersection does not rethrow, and leave a trace.
    console.warn('renderFeed: failed to reveal archived rows', err);
    dropSentinel(state, sentinel);
  });
}

// Whether the newest `shown` rows of two ascending lists are the same objects.
// entriesFor and the archive merge keep entry identity, so a difference means an
// archived row sorted among the materialized rows (an EPOCH-dated hot row, or a
// commit with an old date in the hot file).
function sameTail(a, b, shown) {
  for (let i = 1; i <= shown; i++) if (a[a.length - i] !== b[b.length - i]) return false;
  return true;
}

// Rebuild the materialized rows as the newest state.shown entries, so revealOlder's
// index math holds again. A row this pushes out of the window returns in its sorted
// place on a later reveal. Bottom-anchored because the newest rows stay put; server
// notices are not rows and stay at the end of the feed.
function rebuildWindow($feed, state, sentinel) {
  clearJitter();
  const fromBottom = $feed.scrollHeight - $feed.scrollTop;
  const { entries, shown, channelId } = state;
  const { frag } = buildRows(entries.slice(entries.length - shown), channelId);
  $feed.querySelectorAll('.feed-row, .feed-day').forEach((el) => el.remove());
  $feed.insertBefore(frag, sentinel.nextSibling);
  relayoutAll($feed);
  $feed.scrollTop = $feed.scrollHeight - fromBottom;
  $feed.dispatchEvent(new CustomEvent('feed:relayout'));
}

// No older rows can appear: stop observing the top sentinel and remove it.
function dropSentinel(state, sentinel) {
  state.io?.disconnect();
  sentinel.remove();
}

// Click-delegate proj-pill chips that carry a data-target-channel — those are the
// chips whose slug resolves to a sidebar channel. Unmapped chips have no
// data-target-channel and fall through to no-op. One listener per feed element.
// navigate is injected by the caller (channels.js) rather than imported, so the
// feed doesn't take an import edge back into the routing orchestrator.
function ensureChipNav($feed, navigate) {
  if (chipNavWired.has($feed)) return;
  chipNavWired.add($feed);
  $feed.addEventListener('click', (e) => {
    const chip = e.target.closest('.proj-pill[data-target-channel]');
    if (!chip || !$feed.contains(chip)) return;
    e.preventDefault();
    navigate?.(chip.dataset.targetChannel);
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
