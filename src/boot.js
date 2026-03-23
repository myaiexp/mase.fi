/**
 * Boot sequence: 3-phase IRC terminal startup animation.
 * Phase 1: POST/kernel lines
 * Phase 2: Service lines (waits for data fetch)
 * Phase 3: Overlay fade + sidebar/channel animation
 */

import { animate, stagger } from 'animejs';
import { appendLine } from './terminal.js';
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

  btn.addEventListener('click', () => {
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

  // Service lines — these play while fetch is in flight
  const serviceLines = [
    { text: '[  OK  ] Starting project registry...', cls: 'boot-line boot-line--ok' },
    { text: '[  OK  ] Connecting to github.com/myaiexp', cls: 'boot-line boot-line--ok' },
    { text: '[ .... ] Loading activity feed', cls: 'boot-line boot-line--pending', id: 'boot-feed-line' },
    { text: '[ .... ] Establishing channels', cls: 'boot-line boot-line--pending' },
  ];

  let feedLineEl = null;

  for (const svc of serviceLines) {
    if (signal.aborted) return null;
    const el = appendLine(overlay, svc.text, svc.cls);
    if (svc.id) feedLineEl = el;
    await _delay(_randBetween(100, 200), signal);
  }

  // Now block until fetch resolves (or timeout)
  try {
    data = await fetchWithTimeout;
    const count = data?.entries?.length ?? 0;
    if (feedLineEl) {
      feedLineEl.textContent = `[  OK  ] Loading activity feed (${count} entries)`;
      feedLineEl.className = 'boot-line boot-line--ok';
    }
  } catch {
    fetchOk = false;
    if (feedLineEl) {
      feedLineEl.textContent = '[FAIL  ] Loading activity feed — timeout';
      feedLineEl.className = 'boot-line boot-line--fail';
    }
    // Fallback data
    data = { entries: [], projects: [] };
  }

  if (!fetchOk) {
    appendLine(overlay, '[FAIL  ] Using fallback data', 'boot-line boot-line--fail');
  }

  await _delay(300, signal);
  return data;
}

async function _runPhase3(overlay, data, prefersReducedMotion, signal) {
  if (signal.aborted) return;

  // Render real DOM (elements hidden via setBootAnimating)
  setBootAnimating(true);
  const channelId = resolveInitialChannel();
  initSidebar(data);
  await navigateTo(channelId, data, prefersReducedMotion);

  if (signal.aborted) {
    setBootAnimating(false);
    return;
  }

  // Fade out overlay (~400ms)
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

  if (signal.aborted) {
    setBootAnimating(false);
    return;
  }

  // Animate sidebar: headers type out, channels stagger in
  const headers = document.querySelectorAll('.sidebar__group-header');
  const channels = document.querySelectorAll('.sidebar__channel');

  animate(headers, {
    opacity: [0, 1],
    duration: 200,
    delay: stagger(60),
    ease: 'outCubic',
  });

  animate(channels, {
    opacity: [0, 1],
    duration: 200,
    delay: stagger(30, { start: headers.length * 60 }),
    ease: 'outCubic',
  });

  // Wait for sidebar animation to finish
  const totalSidebarDelay = headers.length * 60 + channels.length * 30 + 200;
  await _delay(totalSidebarDelay, signal);

  if (signal.aborted) {
    setBootAnimating(false);
    return;
  }

  // Animate content: feed lines appear
  const feedLines = document.querySelectorAll('.feed-line');
  if (feedLines.length > 0) {
    animate(feedLines, {
      opacity: [0, 1],
      translateY: ['4px', '0px'],
      duration: 250,
      delay: stagger(20),
      ease: 'outCubic',
    });
    await _delay(feedLines.length * 20 + 250, signal);
  }

  setBootAnimating(false);
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
