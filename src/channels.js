// Hash-routed navigation orchestrator + registry-facade
/** @import { AppData } from './types.js' */
import { entriesFor } from './data.js';
import { getChannels, channelById, chHeat, chAccent, buildRegistry } from './registry.js';
import { renderPinned, renderHeroLine } from './pinned.js';
import { renderFeed } from './feed.js';
import { playSwitchTransition } from './transition.js';
import { setActiveChannel } from './sidebar.js';

// Re-export the registry reads as this module's routing-layer API so callers
// that already depend on the router (command.js, tests) keep one import site.
// Renderers instead read them straight from the registry.js leaf, which keeps
// the import graph acyclic: renderers → registry, orchestrator → renderers.
export { getChannels, channelById, chHeat, chAccent };

/** @type {string | null} */
let currentId = null;
/** @type {AppData | null} */
let data = null;

/** @returns {string | null} */
export function getCurrentChannelId() {
  return currentId;
}

/** @param {string} id */
function setTopicMeta(id) {
  const msgs = entriesFor(id, /** @type {AppData} */ (data)).length;
  const meta = /** @type {HTMLElement} */ (document.getElementById('topic-meta'));
  const countSpan = document.createElement('span');
  countSpan.textContent = msgs + ' msgs';
  const modeSpan = document.createElement('span');
  modeSpan.className = 'mode';
  modeSpan.textContent = 'read-only';
  while (meta.firstChild) meta.removeChild(meta.firstChild);
  meta.appendChild(countSpan);
  meta.appendChild(modeSpan);
}

// Archive rows land after navigate() wrote the topic line. feed.js dispatches
// this rather than importing the router (that import would be a cycle).
function onFeedArchive() {
  if (currentId) setTopicMeta(currentId);
}

function watchFeedArchive() {
  const feed = document.getElementById('feed');
  if (!feed) return;
  // initChannels may run again (tests, a second boot). Don't stack listeners.
  feed.removeEventListener('feed:archive', onFeedArchive);
  feed.addEventListener('feed:archive', onFeedArchive);
}

/**
 * @param {string} id
 * @param {{ fromHash?: boolean }} [opts]
 */
export function navigate(id, { fromHash = false } = {}) {
  const known = channelById(id);
  if (!known) id = 'home';
  // Repair before the same-id return: a bad hash while already on home would
  // otherwise stick, and the Home click would no-op. replaceState does not
  // re-enter through hashchange. A real channel keeps the hash the URL has.
  if (fromHash && !known) window.history.replaceState(null, '', '#/' + id);
  if (id === currentId) return;
  const prevId = currentId;
  currentId = id;
  if (!fromHash) location.hash = '#/' + id;

  /** @type {HTMLElement} */ (document.getElementById('pane')).style.setProperty('--ch-accent', chAccent(id));
  setActiveChannel(id);

  const c = /** @type {import('./types.js').Channel} */ (channelById(id));
  /** @type {HTMLElement} */ (document.getElementById('topic-hash')).textContent = '#' + c.name;
  /** @type {HTMLElement} */ (document.getElementById('topic-text')).textContent = c.topic;
  setTopicMeta(id);
  const appData = /** @type {AppData} */ (data);

  // navigate is injected into renderFeed (rather than imported by feed.js) so
  // the feed's chip-click navigation doesn't create a feed → channels back-edge.
  if (prevId == null) {
    renderHeroLine(id, appData);
    renderPinned(id, appData);
    renderFeed(id, appData, { immediate: false, navigate });
  } else {
    playSwitchTransition(() => {
      renderHeroLine(id, appData);
      renderPinned(id, appData);
      renderFeed(id, appData, { navigate });
    });
  }
}

function parseHash() {
  return (location.hash || '').replace(/^#\/?/, '') || 'home';
}

/** Build channel registry from data and wire hashchange. Caller drives the initial navigate.
 * @param {AppData} loadedData */
export function initChannels(loadedData) {
  data = loadedData;
  buildRegistry(data);
  window.addEventListener('hashchange', () => navigate(parseHash(), { fromHash: true }));
  watchFeedArchive();
}

/** Drive the initial render based on location.hash. Call after the sidebar/tabbar are in the DOM. */
export function applyInitialChannel() {
  navigate(parseHash(), { fromHash: true });
}

/**
 * A demos manifest that lost the startup grace race. Writes the list onto the
 * live data object (later navigations read it) and refreshes the open channel's
 * hero card and hero line only when that channel actually gained a chip.
 * @param {string[]} demos
 */
export function applyLateDemos(demos) {
  if (!data || !Array.isArray(demos)) return;
  data.demos = demos;
  if (!currentId || !demos.includes(currentId)) return;
  renderHeroLine(currentId, data);
  renderPinned(currentId, data);
}
