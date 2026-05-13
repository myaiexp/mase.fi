// Channel registry + hash-routed navigation orchestrator
import { entriesFor } from './data.js';
import { renderPinned } from './pinned.js';
import { renderFeed } from './feed.js';
import { playSwitchTransition } from './transition.js';
import { setActiveChannel } from './sidebar.js';

export let CHANNELS = [];
export let byId = {};

export function chHeat(id) {
  const c = byId[id];
  if (c?.project) return c.project.heat;
  if (id === 'home') return 1.0;
  if (id === 'activity') return 0.85;
  return 0.5;
}

export function chAccent(id) {
  const heat = chHeat(id);
  // hot → #ffbe2a / cold → #b07a1c. base #e8a308 at heat 0.5
  const L = 0.62 + (heat - 0.5) * 0.16;
  const C = 0.14 + (heat - 0.5) * 0.05;
  const H = 78 - (heat - 0.5) * 14;
  return 'oklch(' + L.toFixed(3) + ' ' + C.toFixed(3) + ' ' + H.toFixed(1) + ')';
}

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
  if (!byId[id]) id = 'home';
  if (id === currentId) return;
  const prevId = currentId;
  currentId = id;
  if (!fromHash) location.hash = '#/' + id;

  document.getElementById('pane').style.setProperty('--ch-accent', chAccent(id));
  setActiveChannel(id);

  const c = byId[id];
  document.getElementById('topic-hash').textContent = '#' + c.label;
  document.getElementById('topic-text').textContent = c.topic;
  setTopicMeta(id);

  if (prevId == null) {
    renderPinned(id, _data);
    renderFeed(id, _data, { immediate: false });
  } else {
    playSwitchTransition(() => {
      renderPinned(id, _data);
      renderFeed(id, _data);
    });
  }
}

function parseHash() {
  return (location.hash || '').replace(/^#\/?/, '') || 'home';
}

/** Build channel registry from data and wire hashchange. Caller drives the initial navigate. */
export function initChannels(data) {
  _data = data;
  CHANNELS = [
    { id: 'home', group: 'system', label: 'home', topic: 'daily logbook \xb7 appended nightly \xb7 autoscroll on' },
    ...data.projects.map(p => ({
      id: p.channel, group: 'projects', label: p.channel, topic: p.description, project: p,
    })),
    { id: 'activity', group: 'system', label: 'activity', topic: 'raw commit stream across all projects' },
  ];
  // Rebuild byId in-place so other modules holding the exported reference see updates
  Object.keys(byId).forEach(k => delete byId[k]);
  CHANNELS.forEach(c => { byId[c.id] = c; });

  addEventListener('hashchange', () => navigate(parseHash(), { fromHash: true }));
}

/** Drive the initial render based on location.hash. Call after the sidebar/tabbar are in the DOM. */
export function applyInitialChannel() {
  navigate(parseHash(), { fromHash: true });
}
