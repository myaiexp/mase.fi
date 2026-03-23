/**
 * Boot sequence: 3-phase IRC terminal startup animation.
 * Phase 1: POST/kernel lines
 * Phase 2: Service lines (waits for data fetch)
 * Phase 3: Overlay fade + sidebar/channel animation
 */

import { animate } from 'animejs';
import { typeText, appendLine, createLine, relativeDate } from './terminal.js';
import { getChannels, getChannelEntries } from './data.js';
import { initSidebar, setActiveChannel } from './sidebar.js';
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

// ASCII art hero for #home
const HOME_ASCII = `
 ███╗   ███╗ █████╗ ███████╗███████╗   ███████╗██╗
 ████╗ ████║██╔══██╗██╔════╝██╔════╝   ██╔════╝██║
 ██╔████╔██║███████║███████╗█████╗     █████╗  ██║
 ██║╚██╔╝██║██╔══██║╚════██║██╔══╝     ██╔══╝  ██║
 ██║ ╚═╝ ██║██║  ██║███████║███████╗   ██║     ██║
 ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝     ╚═╝`.trimStart();

const HOME_TAGLINE = 'building apps, tools, and games for myself';

async function _runPhase3(overlay, data, _prefersReducedMotion, signal) {
  if (signal.aborted) return;

  const sidebar = document.getElementById('sidebar');
  const pinnedEl = document.getElementById('content-pinned');
  const feedEl = document.getElementById('content-feed');
  const titlebar = document.querySelector('.terminal__titlebar');
  const inputbar = document.querySelector('.terminal__inputbar');

  // Start with everything empty — we'll build it piece by piece
  if (titlebar) titlebar.style.opacity = '0';
  if (inputbar) inputbar.style.opacity = '0';

  // 1. Fade out boot overlay
  await animate(overlay, { opacity: [1, 0], duration: 400, ease: 'outCubic' });
  overlay.classList.remove('active');
  overlay.style.opacity = '';

  if (signal.aborted) return _finishBoot(data, titlebar, inputbar);

  // 2. Title bar fades in
  if (titlebar) {
    titlebar.style.opacity = '';
    animate(titlebar, { opacity: [0, 1], duration: 300, ease: 'outCubic' });
    await _delay(150, signal);
  }
  if (signal.aborted) return _finishBoot(data, titlebar, inputbar);

  // 3. Build sidebar — type headers, then add channels one by one
  const channelGroups = getChannels(data.entries, data.projects);
  for (const group of channelGroups) {
    if (signal.aborted) break;

    const groupEl = document.createElement('div');
    groupEl.className = 'sidebar__group';
    sidebar.appendChild(groupEl);

    // Type group header
    const header = document.createElement('div');
    header.className = 'sidebar__group-header';
    groupEl.appendChild(header);
    await typeText(header, `\u2500\u2500 ${group.group} \u2500\u2500`, 12, signal);
    await _delay(40, signal);

    // Add channels one by one
    for (const ch of group.channels) {
      if (signal.aborted) break;
      const link = document.createElement('a');
      link.className = 'sidebar__channel';
      link.href = `#/${ch.id}`;
      if (ch.isNew) link.classList.add('sidebar__channel--new');
      link.dataset.channelId = ch.id;

      const name = document.createElement('span');
      name.className = 'sidebar__name';
      name.textContent = `${ch.isNew ? '\u2605' : ''}${ch.label}`;
      link.appendChild(name);

      if (ch.lastActivity) {
        const indicator = document.createElement('span');
        indicator.className = 'sidebar__indicator';
        indicator.textContent = relativeDate(ch.lastActivity);
        link.appendChild(indicator);
      }

      groupEl.appendChild(link);
      animate(link, { opacity: [0, 1], translateX: ['-8px', '0px'], duration: 150, ease: 'outCubic' });
      await _delay(50, signal);
    }
  }
  if (signal.aborted) return _finishBoot(data, titlebar, inputbar);

  // 4. Type ASCII hero into pinned area
  if (pinnedEl) {
    const pre = document.createElement('pre');
    pre.className = 'pinned__ascii';
    pinnedEl.appendChild(pre);
    await typeText(pre, HOME_ASCII, 1, signal);

    if (signal.aborted) return _finishBoot(data, titlebar, inputbar);

    const tagline = document.createElement('p');
    tagline.className = 'pinned__tagline';
    pinnedEl.appendChild(tagline);
    await typeText(tagline, HOME_TAGLINE, 18, signal);
  }
  if (signal.aborted) return _finishBoot(data, titlebar, inputbar);

  // 5. Add feed lines one by one
  const entries = getChannelEntries('home', data.entries, data.projects);
  const batch = entries.slice(Math.max(0, entries.length - 20));
  if (feedEl) {
    for (const entry of batch) {
      if (signal.aborted) break;
      const text = entry.summary || entry.text || '';
      const nick = entry.project || 'mase';
      const line = createLine(entry.date, nick, text);
      feedEl.appendChild(line);
      animate(line, { opacity: [0, 1], duration: 150, ease: 'outCubic' });
      await _delay(30, signal);
    }
    feedEl.scrollTop = feedEl.scrollHeight;
  }
  if (signal.aborted) return _finishBoot(data, titlebar, inputbar);

  // 6. Input bar appears
  if (inputbar) {
    inputbar.style.opacity = '';
    animate(inputbar, { opacity: [0, 1], duration: 300, ease: 'outCubic' });
  }

  // 7. Wire up the real modules (sidebar events, router, search) without re-rendering
  setActiveChannel('home');
}

/** Abort handler: instantly render everything via normal init path */
function _finishBoot(data, titlebar, inputbar) {
  if (titlebar) titlebar.style.opacity = '';
  if (inputbar) inputbar.style.opacity = '';
  // Re-render fully via normal code path
  initSidebar(data);
  navigateTo(resolveInitialChannel(), data, true);
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
