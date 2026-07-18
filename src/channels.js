// Hash-routed navigation orchestrator + registry-facade
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

let currentId = null;
let _data = null;

export function getCurrentChannelId() {
  return currentId;
}

function setTopicMeta(id) {
  const msgs = entriesFor(id, _data).length;
  const meta = document.getElementById('topic-meta');
  const countSpan = document.createElement('span');
  countSpan.textContent = msgs + ' msgs';
  const modeSpan = document.createElement('span');
  modeSpan.className = 'mode';
  modeSpan.textContent = 'read-only';
  while (meta.firstChild) meta.removeChild(meta.firstChild);
  meta.appendChild(countSpan);
  meta.appendChild(modeSpan);
}

export function navigate(id, { fromHash = false } = {}) {
  if (!channelById(id)) id = 'home';
  if (id === currentId) return;
  const prevId = currentId;
  currentId = id;
  if (!fromHash) location.hash = '#/' + id;

  document.getElementById('pane').style.setProperty('--ch-accent', chAccent(id));
  setActiveChannel(id);

  const c = channelById(id);
  document.getElementById('topic-hash').textContent = '#' + c.label;
  document.getElementById('topic-text').textContent = c.topic;
  setTopicMeta(id);

  // navigate is injected into renderFeed (rather than imported by feed.js) so
  // the feed's chip-click navigation doesn't create a feed → channels back-edge.
  if (prevId == null) {
    renderHeroLine(id, _data);
    renderPinned(id, _data);
    renderFeed(id, _data, { immediate: false, navigate });
  } else {
    playSwitchTransition(() => {
      renderHeroLine(id, _data);
      renderPinned(id, _data);
      renderFeed(id, _data, { navigate });
    });
  }
}

function parseHash() {
  return (location.hash || '').replace(/^#\/?/, '') || 'home';
}

/** Build channel registry from data and wire hashchange. Caller drives the initial navigate. */
export function initChannels(data) {
  _data = data;
  buildRegistry(data);
  window.addEventListener('hashchange', () => navigate(parseHash(), { fromHash: true }));
}

/** Drive the initial render based on location.hash. Call after the sidebar/tabbar are in the DOM. */
export function applyInitialChannel() {
  navigate(parseHash(), { fromHash: true });
}
