// Channel-switch CRT scanline transition over the feed area

// Track the in-flight run's timers so a rapid re-switch can cancel both:
//  - midTimer:   the midpoint content swap. If left to fire after we've already
//                navigated on, it renders the now-stale channel (and kicks off
//                its jitter) over the freshly-navigated one. Cancel it on re-entry.
//  - safetyTimer: the cleanup fallback. Cancel it so it can't tear down the
//                overlay we're about to rebuild.
let midTimer = 0;
let safetyTimer = 0;

/** Play the scanline transition; calls onMid at the midpoint where content should swap. */
export function playSwitchTransition(onMid) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onMid();
    return;
  }
  const $overlay = document.getElementById('feed-overlay');

  // A rapid re-switch can land mid-sweep; cancel the previous run's pending
  // midpoint swap (so it can't render the now-stale channel) and its cleanup
  // timer (so it can't tear down the overlay we're about to rebuild).
  if (midTimer) { clearTimeout(midTimer); midTimer = 0; }
  if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = 0; }

  $overlay.replaceChildren(); // safe: clearing our own controlled element
  $overlay.classList.add('active');

  const scan = document.createElement('div');
  scan.className = 'scan';
  // Sweep the full visible feed height. The overlay is inset:0 inside the
  // overflow-hidden feed-wrap, so clientHeight is the viewport height (not the
  // scroll content height). +40 overshoots so the band fully clears the bottom.
  const feedH = $overlay.clientHeight || $overlay.getBoundingClientRect().height || 0;
  scan.style.setProperty('--scan-to', (feedH + 40) + 'px');
  $overlay.appendChild(scan);

  // Derive timing from the actual animation duration so it tracks --switch-ms
  // instead of a hard-coded constant that silently drifts if the token changes.
  const durMs = parseFloat(getComputedStyle(scan).animationDuration) * 1000 || 420;

  // Swap content ~a third of the way down, under the descending band, so the
  // new feed reads as wiped in. The sweep is composited, so this synchronous
  // relayout doesn't stall it. Tracked so a rapid re-switch can cancel it.
  midTimer = setTimeout(() => { midTimer = 0; onMid(); }, durMs * 0.33);

  const done = () => {
    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = 0; }
    $overlay.classList.remove('active');
    $overlay.replaceChildren(); // safe: clearing our own controlled element
  };
  // Clean up when the sweep actually finishes — never cut a sweep short on a
  // fixed timer. animationend fires once the composited descent completes.
  scan.addEventListener('animationend', done, { once: true });
  // Safety net for the case animationend never arrives (element detached, tab
  // backgrounded mid-animation, etc.).
  safetyTimer = setTimeout(done, durMs + 200);
}
