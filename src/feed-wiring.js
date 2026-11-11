// Per-feed-element DOM wiring (chip click delegation, resize relayout), installed once per feed node
import { relayoutAll } from './feed-layout.js';

// Per-feed-element wiring state, keyed by the $feed node rather than held in
// module-level singletons. Keeping the state on the element means a fresh feed
// element — a new render target, or a fresh DOM in a test — gets its own wiring
// instead of inheriting a stale "already wired" flag. The state lives and dies
// with the element it keys on, so no reset hook is needed between renders/tests.
/** @type {WeakSet<HTMLElement>} */
const chipNavWired = new WeakSet();
/** @type {WeakMap<HTMLElement, ResizeObserver>} */
const resizeObservers = new WeakMap();

// Click-delegate proj-pill chips that carry a data-target-channel — those are the
// chips whose slug resolves to a sidebar channel. Unmapped chips have no
// data-target-channel and fall through to no-op. One listener per feed element.
// navigate is injected by the caller (channels.js) rather than imported, so the
// feed doesn't take an import edge back into the routing orchestrator.
/**
 * @param {HTMLElement} $feed
 * @param {((id: string) => void) | undefined} navigate
 */
export function ensureChipNav($feed, navigate) {
  if (chipNavWired.has($feed)) return;
  chipNavWired.add($feed);
  $feed.addEventListener('click', (e) => {
    const chip = /** @type {HTMLElement | null} */ (
      /** @type {Element} */ (e.target).closest('.proj-pill[data-target-channel]'));
    if (!chip || !$feed.contains(chip)) return;
    e.preventDefault();
    navigate?.(/** @type {string} */ (chip.dataset.targetChannel));
  });
}

// Re-lay out feed rows when the available .msg column width changes (e.g. the
// pane reflowed on viewport resize). One observer per feed element — installed
// lazily on first render. rAF-debounced so we don't thrash during drag-resize.
// The per-observer width/rAF state lives in this closure (not module scope), so
// each feed element's observer tracks its own width independently. relayoutAll
// only touches the materialized (windowed) rows, so the cost stays bounded.
/** @param {HTMLElement} $feed */
export function ensureResizeObserver($feed) {
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
