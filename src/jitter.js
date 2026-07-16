// Modem-decode arrival animation for the last 14 feed rows
import { scramble } from './ascii.js';

const JITTER_MS = 320;
const STAGGER_MS = 38;

let timers = [];

/** Cancel all pending jitter timers (e.g. on channel switch or search). */
export function clearJitter() {
  timers.forEach(clearTimeout);
  timers = [];
}

/** Play jitter on a list of row elements. Each gets 2–3 scrambled frames before settling. */
export function playJitter(rowEls) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  rowEls.forEach(({ row }, i) => {
    const msgEl = row.querySelector('.msg');
    const nickEl = row.querySelector('.nick');
    const originalMsg = msgEl.cloneNode(true); // live DOM snapshot — no HTML parse/serialize round-trip
    const originalText = msgEl.textContent;
    const originalNick = nickEl.textContent;
    row.classList.add('jitter');
    row.classList.add('arriving');
    row.style.animationDelay = (i * STAGGER_MS) + 'ms';
    const start = i * STAGGER_MS + 40;
    const frames = 2 + Math.floor(Math.random() * 2);
    for (let f = 0; f < frames; f++) {
      const at = start + f * (JITTER_MS / (frames + 1));
      timers.push(setTimeout(() => {
        msgEl.textContent = scramble(originalText, 0.55 - f * 0.18);
        nickEl.textContent = scramble(originalNick, 0.4 - f * 0.15);
      }, at));
    }
    timers.push(setTimeout(() => {
      msgEl.replaceChildren(...originalMsg.cloneNode(true).childNodes); // restore from the live-DOM snapshot
      nickEl.textContent = originalNick;
      row.classList.remove('jitter');
    }, start + JITTER_MS));
  });
}
