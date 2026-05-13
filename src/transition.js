// Channel-switch CRT scanline transition over the feed area

/** Play the scanline transition; calls onMid at the midpoint where content should swap. */
export function playSwitchTransition(onMid) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    onMid();
    return;
  }
  const $overlay = document.getElementById('feed-overlay');
  $overlay.innerHTML = ''; // safe: clearing our own controlled element
  $overlay.classList.add('active');
  const scan = document.createElement('div');
  scan.className = 'scan';
  $overlay.appendChild(scan);
  setTimeout(onMid, 140);
  setTimeout(() => {
    $overlay.classList.remove('active');
    $overlay.innerHTML = ''; // safe: clearing our own controlled element
  }, 480);
}
