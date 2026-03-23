/**
 * Boot sequence: 3-phase IRC terminal startup animation.
 * Phase 1: POST/kernel lines
 * Phase 2: Service lines (waits for data fetch)
 * Phase 3: Overlay fade + sidebar/channel animation
 */

import { animate } from 'animejs';
import { typeText, appendLine } from './terminal.js';
import { initSidebar, setBootAnimating } from './sidebar.js';
import { navigateTo, resolveInitialChannel } from './channels.js';

const STORAGE_KEY = 'mase-fi-boot-seen';
const BOOT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const FETCH_TIMEOUT_MS = 3000;

// ── Phase 1 lines ────────────────────────────────────────────────────────────

const PHASE1_LINES = [
  'BIOS POST... OK',
  'mase.fi kernel 2.0.26 loading',
  '[    0.001] mounting /dev/projects',
  '[    0.012] loading configuration',
  '[    0.034] initializing network interfaces',
  '[    0.058] mounting /dev/memory',
  '[    0.071] starting init process',
];

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Check if boot should be skipped.
 * True if: prefersReducedMotion, or localStorage boot-seen within 1 week.
 * @param {boolean} prefersReducedMotion
 * @returns {boolean}
 */
export function shouldSkipBoot(prefersReducedMotion) {
  if (prefersReducedMotion) return true;

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const ts = parseInt(stored, 10);
      if (!isNaN(ts) && Date.now() - ts < BOOT_TTL_MS) return true;
    }
  } catch {
    // localStorage unavailable — don't skip
  }

  return false;
}

/**
 * Run the full boot sequence (3 phases).
 * @param {Promise<object>} dataPromise - fetch promise for updates.json
 * @param {function} onComplete - called with resolved data when boot finishes
 */
export async function runBoot(dataPromise, onComplete) {
  const overlay = document.getElementById('boot-overlay');
  if (!overlay) return;

  const controller = new AbortController();
  const { signal } = controller;

  // Show overlay
  overlay.classList.add('active');

  // Skip handler: click or keypress aborts
  const abort = () => controller.abort();
  document.addEventListener('click', abort, { once: true });
  document.addEventListener('keydown', abort, { once: true });

  try {
    // ── Phase 1: POST/kernel lines (~1.5s) ───────────────────────────────────
    await _runPhase1(overlay, signal);

    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // ── Phase 2: Service lines (~1.5s, blocks on data) ───────────────────────
    const data = await _runPhase2(overlay, dataPromise, signal);

    if (signal.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    // ── Phase 3: Fade + animate UI ───────────────────────────────────────────
    await _runPhase3(overlay, data, false, signal);

    _markBootSeen();
    onComplete(data);
  } catch (err) {
    if (err.name === 'AbortError' || signal.aborted) {
      // Instant skip — resolve data and show UI immediately
      _doInstantBoot(dataPromise, onComplete, overlay);
    } else {
      throw err;
    }
  } finally {
    document.removeEventListener('click', abort);
    document.removeEventListener('keydown', abort);
  }
}

/**
 * Attach replay button handler.
 * @param {function} getDataPromise - returns a fresh fetch promise
 * @param {function} onComplete - same callback as runBoot
 */
export function initReplayButton(getDataPromise, onComplete) {
  const btn = document.getElementById('boot-replay');
  if (!btn) return;

  btn.addEventListener('click', (e) => {
    // Stop propagation — runBoot adds a document click listener to skip boot,
    // and this click would bubble up and immediately trigger it
    e.stopPropagation();
    const overlay = document.getElementById('boot-overlay');
    if (!overlay) return;

    // Clear overlay content using safe DOM method
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);
    overlay.classList.add('active');

    // Hide terminal content behind overlay
    const terminal = document.querySelector('.terminal__body');
    if (terminal) terminal.style.visibility = 'hidden';

    runBoot(getDataPromise(), (data) => {
      if (terminal) terminal.style.visibility = '';
      onComplete(data);
    });
  });
}

// ── Phase implementations ─────────────────────────────────────────────────────

async function _runPhase1(overlay, signal) {
  for (const text of PHASE1_LINES) {
    if (signal.aborted) return;
    appendLine(overlay, text, 'boot-line');
    await _delay(_randBetween(30, 60), signal);
  }
  // Brief pause before phase 2
  await _delay(200, signal);
}

async function _runPhase2(overlay, dataPromise, signal) {
  // Kick off data fetch race with timeout (fetch already started in parallel)
  let data;
  let fetchOk = true;

  const fetchWithTimeout = Promise.race([
    dataPromise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), FETCH_TIMEOUT_MS),
    ),
  ]);

  // Service lines — first two play immediately, last two wait on fetch
  appendLine(overlay, '[  OK  ] Starting project registry...', 'boot-line boot-line--ok');
  await _delay(_randBetween(100, 200), signal);
  if (signal.aborted) return null;

  appendLine(overlay, '[  OK  ] Connecting to github.com/myaiexp', 'boot-line boot-line--ok');
  await _delay(_randBetween(100, 200), signal);
  if (signal.aborted) return null;

  const feedLineEl = appendLine(overlay, '[ .... ] Loading activity feed', 'boot-line boot-line--pending');
  await _delay(_randBetween(100, 200), signal);
  if (signal.aborted) return null;

  const channelLineEl = appendLine(overlay, '[ .... ] Establishing channels', 'boot-line boot-line--pending');
  await _delay(_randBetween(100, 200), signal);
  if (signal.aborted) return null;

  // Block until fetch resolves (or timeout)
  try {
    data = await fetchWithTimeout;
    const count = data?.entries?.length ?? 0;
    feedLineEl.textContent = `[  OK  ] Loading activity feed (${count} entries)`;
    feedLineEl.className = 'boot-line boot-line--ok';
  } catch {
    fetchOk = false;
    feedLineEl.textContent = '[FAIL  ] Loading activity feed — timeout';
    feedLineEl.className = 'boot-line boot-line--fail';
    data = { entries: [], projects: [] };
  }
  await _delay(150, signal);

  // Resolve "Establishing channels"
  if (fetchOk) {
    const channelCount = data?.projects?.length ?? 0;
    channelLineEl.textContent = `[  OK  ] Establishing channels (${channelCount} linked)`;
    channelLineEl.className = 'boot-line boot-line--ok';
  } else {
    channelLineEl.textContent = '[FAIL  ] Establishing channels';
    channelLineEl.className = 'boot-line boot-line--fail';
  }

  await _delay(400, signal);
  return data;
}

async function _runPhase3(overlay, data, _prefersReducedMotion, signal) {
  if (signal.aborted) return;

  // 1. Render real DOM instantly (hidden via setBootAnimating opacity:0)
  setBootAnimating(true);
  const channelId = resolveInitialChannel();
  initSidebar(data);
  // Render content with reducedMotion=true so it appears instantly (no typing behind overlay)
  await navigateTo(channelId, data, true);

  if (signal.aborted) { setBootAnimating(false); return; }

  // 2. Hide content elements we'll animate later
  const pinnedAscii = document.querySelector('.pinned__ascii');
  const pinnedTagline = document.querySelector('.pinned__tagline');
  const feedLines = document.querySelectorAll('.feed-line');
  const titlebar = document.querySelector('.terminal__titlebar');
  const inputbar = document.querySelector('.terminal__inputbar');

  if (pinnedAscii) { pinnedAscii.style.opacity = '0'; }
  if (pinnedTagline) { pinnedTagline.style.opacity = '0'; }
  if (titlebar) { titlebar.style.opacity = '0'; }
  if (inputbar) { inputbar.style.opacity = '0'; }
  feedLines.forEach((el) => { el.style.opacity = '0'; });

  // 3. Fade out boot overlay
  await new Promise((resolve) => {
    animate(overlay, {
      opacity: [1, 0],
      duration: 400,
      ease: 'outCubic',
      onComplete: resolve,
    });
  });
  overlay.classList.remove('active');
  overlay.style.opacity = '';

  if (signal.aborted) { _showAllElements(titlebar, inputbar, pinnedAscii, pinnedTagline, feedLines); setBootAnimating(false); return; }

  // 4. Title bar fades in
  if (titlebar) {
    titlebar.style.opacity = '';
    animate(titlebar, { opacity: [0, 1], duration: 300, ease: 'outCubic' });
    await _delay(200, signal);
  }

  if (signal.aborted) { _showAllElements(titlebar, inputbar, pinnedAscii, pinnedTagline, feedLines); setBootAnimating(false); return; }

  // 5. Sidebar group headers type out one by one
  const headers = document.querySelectorAll('.sidebar__group-header');
  for (const header of headers) {
    if (signal.aborted) break;
    const text = header.textContent;
    header.textContent = '';
    header.style.opacity = '1';
    await typeText(header, text, 12, signal);
    await _delay(80, signal);
  }

  if (signal.aborted) { _showAllElements(titlebar, inputbar, pinnedAscii, pinnedTagline, feedLines); setBootAnimating(false); return; }

  // 6. Channel names appear one by one with stagger
  const channels = document.querySelectorAll('.sidebar__channel');
  for (const ch of channels) {
    if (signal.aborted) break;
    ch.style.opacity = '1';
    animate(ch, { opacity: [0, 1], translateX: ['-8px', '0px'], duration: 150, ease: 'outCubic' });
    await _delay(60, signal);
  }

  if (signal.aborted) { _showAllElements(titlebar, inputbar, pinnedAscii, pinnedTagline, feedLines); setBootAnimating(false); return; }

  // 7. ASCII hero types in
  if (pinnedAscii) {
    const asciiText = pinnedAscii.textContent;
    pinnedAscii.textContent = '';
    pinnedAscii.style.opacity = '1';
    await typeText(pinnedAscii, asciiText, 1, signal);
  }

  if (signal.aborted) { _showAllElements(titlebar, inputbar, pinnedAscii, pinnedTagline, feedLines); setBootAnimating(false); return; }

  // 8. Tagline types in
  if (pinnedTagline) {
    const tagText = pinnedTagline.textContent;
    pinnedTagline.textContent = '';
    pinnedTagline.style.opacity = '1';
    await typeText(pinnedTagline, tagText, 18, signal);
  }

  if (signal.aborted) { _showAllElements(titlebar, inputbar, pinnedAscii, pinnedTagline, feedLines); setBootAnimating(false); return; }

  // 9. Feed lines stagger in
  for (let i = 0; i < feedLines.length; i++) {
    if (signal.aborted) break;
    feedLines[i].style.opacity = '1';
    animate(feedLines[i], { opacity: [0, 1], translateY: ['4px', '0px'], duration: 200, ease: 'outCubic' });
    await _delay(40, signal);
  }

  // 10. Input bar appears
  if (inputbar) {
    inputbar.style.opacity = '1';
    animate(inputbar, { opacity: [0, 1], duration: 300, ease: 'outCubic' });
  }

  setBootAnimating(false);
}

/** Force-show all elements (used on abort during Phase 3) */
function _showAllElements(titlebar, inputbar, ascii, tagline, feedLines) {
  if (titlebar) titlebar.style.opacity = '';
  if (inputbar) inputbar.style.opacity = '';
  if (ascii) ascii.style.opacity = '';
  if (tagline) tagline.style.opacity = '';
  feedLines.forEach((el) => { el.style.opacity = ''; });
  document.querySelectorAll('.sidebar__group-header').forEach((el) => { el.style.opacity = ''; });
  document.querySelectorAll('.sidebar__channel').forEach((el) => { el.style.opacity = ''; });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function _delay(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        resolve();
      }, { once: true });
    }
  });
}

function _randBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function _markBootSeen() {
  try {
    localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage unavailable
  }
}

async function _doInstantBoot(dataPromise, onComplete, overlay) {
  // Hide overlay immediately
  overlay.classList.remove('active');

  // Ensure all sidebar/channel elements are visible
  setBootAnimating(false);

  let data = { entries: [], projects: [] };
  try {
    data = await Promise.race([
      dataPromise,
      new Promise((resolve) =>
        setTimeout(() => resolve({ entries: [], projects: [] }), FETCH_TIMEOUT_MS),
      ),
    ]);
  } catch {
    // Use fallback data
  }

  const channelId = resolveInitialChannel();
  initSidebar(data);
  await navigateTo(channelId, data, true);

  _markBootSeen();
  onComplete(data);
}
