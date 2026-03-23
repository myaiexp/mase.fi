/**
 * Channel renderers and hash-based router.
 * Handles navigation, pinned headers, feed rendering, lazy loading.
 */

import { shortDate, createNick, createLine, typeText, appendLine } from './terminal.js';
import { getChannelEntries, getAboutStats } from './data.js';
import { isBootAnimating, setActiveChannel } from './sidebar.js';

const PAGE_SIZE = 20;
const STORAGE_KEY = 'mase-fi-channel';

// ASCII art hero for #home pinned area
const HOME_ASCII = `
 ███╗   ███╗ █████╗ ███████╗███████╗   ███████╗██╗
 ████╗ ████║██╔══██╗██╔════╝██╔════╝   ██╔════╝██║
 ██╔████╔██║███████║███████╗█████╗     █████╗  ██║
 ██║╚██╔╝██║██╔══██║╚════██║██╔══╝     ██╔══╝  ██║
 ██║ ╚═╝ ██║██║  ██║███████║███████╗   ██║     ██║
 ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝╚══════╝   ╚═╝     ╚═╝`.trimStart();

const HOME_TAGLINE = 'building apps, tools, and games for myself';

/**
 * Parse a location.hash value into a channelId.
 * Strips leading `#/` and returns lowercase id.
 * Returns null if hash is empty or not in the `#/...` format.
 * @param {string} hash - e.g. "#/explorer" or ""
 * @returns {string|null}
 */
export function parseHash(hash) {
  if (!hash || hash === '#' || hash === '#/') return null;
  if (!hash.startsWith('#/')) return null;
  const id = hash.slice(2).trim();
  return id || null;
}

/**
 * Resolve the initial channel from hash, localStorage, or default.
 * @returns {string} channelId
 */
export function resolveInitialChannel() {
  const fromHash = parseHash(location.hash);
  if (fromHash) return fromHash;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) return stored;
  return 'home';
}

/**
 * Check whether a channelId is valid given the data.
 * Valid: 'home', 'activity', 'about', or a known project channel id.
 * @param {string} channelId
 * @param {{ projects: Array }} data
 * @returns {boolean}
 */
function isValidChannel(channelId, data) {
  if (['home', 'activity', 'about'].includes(channelId)) return true;
  return data.projects.some((p) => p.channel === channelId);
}

/** Remove all children from an element (safe alternative to innerHTML = ''). */
function clearElement(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/**
 * Render pinned area for #home: ASCII art + tagline.
 * @param {HTMLElement} pinnedEl
 * @param {boolean} prefersReducedMotion
 */
async function renderHomePinned(pinnedEl, prefersReducedMotion) {
  clearElement(pinnedEl);

  const pre = document.createElement('pre');
  pre.className = 'pinned__ascii';

  const tagline = document.createElement('p');
  tagline.className = 'pinned__tagline';

  pinnedEl.appendChild(pre);
  pinnedEl.appendChild(tagline);

  if (!prefersReducedMotion && !isBootAnimating()) {
    await typeText(pre, HOME_ASCII, 2);
    await typeText(tagline, HOME_TAGLINE, 15);
  } else if (isBootAnimating()) {
    await typeText(pre, HOME_ASCII, 2);
    await typeText(tagline, HOME_TAGLINE, 15);
  } else {
    pre.textContent = HOME_ASCII;
    tagline.textContent = HOME_TAGLINE;
  }
}

/**
 * Render pinned area for a project channel.
 * @param {HTMLElement} pinnedEl
 * @param {object} project - { name, desc, url, channel, status? }
 * @param {Array} entries
 */
function renderProjectPinned(pinnedEl, project, entries) {
  clearElement(pinnedEl);

  const block = document.createElement('div');
  block.className = 'pinned__project';

  // Name line
  const nameEl = document.createElement('div');
  nameEl.className = 'pinned__project-name';
  nameEl.textContent = project.name;
  block.appendChild(nameEl);

  // Description
  if (project.desc) {
    const descEl = document.createElement('div');
    descEl.className = 'pinned__project-desc';
    descEl.textContent = project.desc;
    block.appendChild(descEl);
  }

  // URL with open link
  if (project.url) {
    const urlEl = document.createElement('div');
    urlEl.className = 'pinned__project-url';

    const arrow = document.createTextNode('\u2192 ');
    urlEl.appendChild(arrow);

    const link = document.createElement('a');
    link.href = project.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.className = 'pinned__project-link';
    link.textContent = 'Open';
    urlEl.appendChild(link);
    block.appendChild(urlEl);
  }

  // Last update — find most recent entry for this project
  const channelEntries = getChannelEntries(project.channel, entries, [project]);
  const lastEntry = channelEntries.length > 0 ? channelEntries[channelEntries.length - 1] : null;

  if (lastEntry) {
    const dateEl = document.createElement('div');
    dateEl.className = 'pinned__project-date';
    dateEl.textContent = `last update ${shortDate(lastEntry.date)}`;
    block.appendChild(dateEl);
  }

  pinnedEl.appendChild(block);
}

/**
 * Render pinned area for #about: neofetch-style block.
 * @param {HTMLElement} pinnedEl
 * @param {{ entries: Array, projects: Array }} data
 */
function renderAboutPinned(pinnedEl, data) {
  clearElement(pinnedEl);

  const stats = getAboutStats(data.entries, data.projects);
  const stack = 'JS \u00b7 Vite \u00b7 Node \u00b7 Python';

  const lines = [
    '        mase@fi',
    '        -------',
    '  OS    mase.fi v2.0',
    '  Host  Central Finland',
    '  Shell building apps, tools, and games',
    '',
    `  Stack ${stack}`,
    '  Links github.com/myaiexp',
    '',
    `  Projects  ${stats.projectCount}`,
    `  Features  ${stats.featuresThisMonth} this month`,
    `  Last deploy  ${stats.lastDeploy}`,
  ];

  const pre = document.createElement('pre');
  pre.className = 'pinned__neofetch';
  pre.textContent = lines.join('\n');
  pinnedEl.appendChild(pre);
}

/**
 * Create a feed line element for #activity (log entries, muted style).
 * @param {object} entry
 * @returns {HTMLDivElement}
 */
function createActivityLine(entry) {
  const div = document.createElement('div');
  div.className = 'feed-line feed-line--muted';

  const timeEl = document.createElement('span');
  timeEl.className = 'feed-line__time';
  timeEl.textContent = shortDate(entry.date);

  const nickEl = createNick(entry.project || 'anon');

  const textEl = document.createElement('span');
  textEl.className = 'feed-line__text';
  textEl.textContent = entry.description || entry.summary || '';

  div.append(timeEl, nickEl, textEl);
  return div;
}

/**
 * Render a batch of entries into the feed, returning the created elements.
 * For #activity: use activity line style (muted).
 * For others: use standard chat line.
 * @param {HTMLElement} feedEl
 * @param {Array} entries - entries to render
 * @param {string} channelId
 * @param {boolean} prepend - if true, prepend to top
 * @returns {HTMLDivElement[]}
 */
function renderEntryBatch(feedEl, entries, channelId, prepend = false) {
  const isActivity = channelId === 'activity';
  const fragment = document.createDocumentFragment();
  const els = [];

  for (const entry of entries) {
    let line;
    if (isActivity) {
      line = createActivityLine(entry);
    } else {
      const text = entry.summary || entry.description || '';
      const nick = entry.project || 'mase';
      line = createLine(entry.date, nick, text);
    }
    els.push(line);
    fragment.appendChild(line);
  }

  if (prepend) {
    feedEl.insertBefore(fragment, feedEl.firstChild);
  } else {
    feedEl.appendChild(fragment);
  }

  return els;
}

/**
 * Set up lazy loading via IntersectionObserver on a sentinel at top of feed.
 * When sentinel becomes visible, prepend the next older batch.
 * @param {HTMLElement} feedEl
 * @param {Array} allEntries - all entries sorted ascending (newest last)
 * @param {number} loadedCount - how many are currently rendered (from newest end)
 * @param {string} channelId
 */
function setupLazyLoad(feedEl, allEntries, loadedCount, channelId) {
  if (allEntries.length <= loadedCount) return;

  const sentinel = document.createElement('div');
  sentinel.className = 'feed__sentinel';
  feedEl.insertBefore(sentinel, feedEl.firstChild);

  let currentLoaded = loadedCount;
  let loading = false;

  const observer = new IntersectionObserver(
    (intersectionEntries) => {
      const entry = intersectionEntries[0];
      if (!entry.isIntersecting || loading) return;

      loading = true;

      // Entries are sorted ascending; we show newest-last.
      // Currently showing: allEntries[totalLen - currentLoaded .. totalLen - 1]
      // Next batch: allEntries[max(0, totalLen - currentLoaded - PAGE_SIZE) .. totalLen - currentLoaded - 1]
      const totalLen = allEntries.length;
      const end = totalLen - currentLoaded;
      const start = Math.max(0, end - PAGE_SIZE);
      const batch = allEntries.slice(start, end);

      if (batch.length === 0) {
        observer.disconnect();
        sentinel.remove();
        return;
      }

      // Save scroll offset before DOM mutation
      const prevScrollHeight = feedEl.scrollHeight;
      const prevScrollTop = feedEl.scrollTop;

      sentinel.remove();
      renderEntryBatch(feedEl, batch, channelId, true);
      currentLoaded += batch.length;

      // Restore scroll position after prepend
      feedEl.scrollTop = prevScrollTop + (feedEl.scrollHeight - prevScrollHeight);

      if (currentLoaded < totalLen) {
        feedEl.insertBefore(sentinel, feedEl.firstChild);
        loading = false;
      } else {
        observer.disconnect();
      }
    },
    { root: feedEl, threshold: 0.1 },
  );

  observer.observe(sentinel);
}

/**
 * Animate feed lines: first 3 type, rest appear instantly.
 * If boot animating: type all lines.
 * If reduced motion: skip (content already rendered).
 * @param {HTMLElement[]} lineEls
 * @param {boolean} prefersReducedMotion
 */
async function animateFeedLines(lineEls, prefersReducedMotion) {
  if (prefersReducedMotion) return;

  const bootAnimating = isBootAnimating();

  for (let i = 0; i < lineEls.length; i++) {
    const el = lineEls[i];
    const textEl = el.querySelector('.feed-line__text');
    if (!textEl) continue;

    const shouldType = bootAnimating || i < 3;

    if (shouldType) {
      const original = textEl.textContent;
      textEl.textContent = '';
      await typeText(textEl, original, 15);
    }
  }
}

/**
 * Navigate to a channel. Clears content areas, renders pinned + feed.
 * Stores the channel in localStorage.
 * @param {string} channelId
 * @param {{ entries: Array, projects: Array }} data
 * @param {boolean} prefersReducedMotion
 */
export async function navigateTo(channelId, data, prefersReducedMotion) {
  const { entries, projects } = data;

  // Validate — fall back to home for unknown channels
  if (!isValidChannel(channelId, data)) {
    return navigateTo('home', data, prefersReducedMotion);
  }

  localStorage.setItem(STORAGE_KEY, channelId);
  setActiveChannel(channelId);

  const pinnedEl = document.getElementById('content-pinned');
  const feedEl = document.getElementById('content-feed');

  if (!pinnedEl || !feedEl) return;

  clearElement(pinnedEl);
  clearElement(feedEl);

  // ── #about ─────────────────────────────────────────────────────────
  if (channelId === 'about') {
    renderAboutPinned(pinnedEl, data);
    return;
  }

  // ── #home ──────────────────────────────────────────────────────────
  if (channelId === 'home') {
    await renderHomePinned(pinnedEl, prefersReducedMotion);
  }

  // ── Project channels ───────────────────────────────────────────────
  if (channelId !== 'home' && channelId !== 'activity') {
    const project = projects.find((p) => p.channel === channelId);
    if (project) {
      renderProjectPinned(pinnedEl, project, entries);
    }
  }

  // ── Feed ───────────────────────────────────────────────────────────
  const allEntries = getChannelEntries(channelId, entries, projects);

  if (allEntries.length === 0) {
    appendLine(feedEl, 'No entries yet.', 'feed-line feed-line--empty');
    return;
  }

  const initialStart = Math.max(0, allEntries.length - PAGE_SIZE);
  const initialBatch = allEntries.slice(initialStart);
  const lineEls = renderEntryBatch(feedEl, initialBatch, channelId);

  setupLazyLoad(feedEl, allEntries, initialBatch.length, channelId);

  // Scroll to bottom (newest entries)
  feedEl.scrollTop = feedEl.scrollHeight;

  await animateFeedLines(lineEls, prefersReducedMotion);
}

/**
 * Initialize hash-based router. Listens for hashchange events and renders channels.
 * @param {{ entries: Array, projects: Array }} data
 * @param {boolean} prefersReducedMotion
 */
export function initRouter(data, prefersReducedMotion) {
  window.addEventListener('hashchange', () => {
    const channelId = parseHash(location.hash) || 'home';
    navigateTo(channelId, data, prefersReducedMotion);
  });
}
