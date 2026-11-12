// Sidebar channel list + mobile tabbar rendering, plus active-channel highlight.
import { chAccent, chHeat, getChannels, channelById } from './registry.js';
import { escapeHtml } from './html.js';
/** @import { AppData, Channel, Entry } from './types.js' */

/** @param {Channel} c */
function chanRow(c) {
  const heat = chHeat(c.id);
  const cells = 5;
  const on = Math.max(1, Math.round(heat * cells));
  const bars = Array.from({ length: cells }, (_, i) =>
    `<b class="${i < on ? 'on' : ''}"></b>`).join('');
  // role=link + tabindex makes these div rows keyboard-operable navigation
  // targets (they change the hash route); aria-label gives a clean name since
  // the visible content is "# <name>" plus decorative heat bars.
  return `
    <div class="chan" data-ch="${escapeHtml(c.id)}" role="link" tabindex="0" aria-label="${escapeHtml(c.name)} channel" style="--ch-accent:${chAccent(c.id)}">
      <span class="hash" aria-hidden="true">#</span>
      <span class="name">${escapeHtml(c.name)}</span>
      <span class="heat" title="activity" aria-hidden="true">${bars}</span>
    </div>`;
}

// A project with no loaded entry would open an empty channel, so the sidebar
// list leaves it out; the registry keeps it, so the hash and "/" still reach it.
// Hot-file entries only: a project whose only rows are archived logs stays
// hidden until a reload after it posts again, which is accepted.
/**
 * @param {Entry[] | undefined} entries
 * @returns {(c: Channel) => boolean}
 */
function projectsWithEntries(entries) {
  const keys = new Set();
  for (const e of entries || []) {
    if (e.projectChannel) keys.add('ch:' + e.projectChannel);
    if (e.projectSlug) keys.add('slug:' + e.projectSlug);
  }
  return (c) => keys.has('ch:' + c.id) || (!!c.project?.slug && keys.has('slug:' + c.project.slug));
}

/**
 * Render the desktop sidebar (#chanlist) and the mobile tabbar (#tabbar). Wires click → navigate.
 * @param {AppData} data
 * @param {(id: string) => void} navigate
 */
export function renderChanlist(data, navigate) {
  const $chanlist = /** @type {HTMLElement} */ (document.getElementById('chanlist'));
  const $tabbar = /** @type {HTMLElement} */ (document.getElementById('tabbar'));

  const groups = [['system', 'server'], ['projects', 'projects']];
  const hasEntries = projectsWithEntries(data.entries);
  const html = groups.map(([key, title]) => {
    const chans = getChannels().filter(c => c.group === key && (key !== 'projects' || hasEntries(c)));
    return `<div class="chan-group">${title}</div>` +
      chans.map(c => chanRow(c)).join('');
  }).join('');
  $chanlist.innerHTML = html;

  // Mobile tabs: home + activity + first 4 projects
  const primary = /** @type {Channel[]} */ ([
    channelById('home'), channelById('activity'),
    ...data.projects.slice(0, 4).map(p => channelById(p.channel)),
  ].filter(Boolean));
  $tabbar.innerHTML = primary.map(c => `
    <button class="tab" data-ch="${escapeHtml(c.id)}" aria-label="${escapeHtml(c.name)} channel" style="--ch-accent:${chAccent(c.id)}">
      <span class="tab-hash" aria-hidden="true">#</span>
      <span class="tab-name">${escapeHtml(c.name)}</span>
      <span class="tab-dot" aria-hidden="true"></span>
    </button>
  `).join('');

  $chanlist.querySelectorAll('.chan').forEach(node => {
    const el = /** @type {HTMLElement} */ (node);
    el.addEventListener('click', () => navigate(/** @type {string} */ (el.dataset.ch)));
    // role=link rows aren't natively keyboard-operable; activate on Enter/Space
    // (Space is preventDefaulted so it navigates instead of scrolling the list).
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate(/** @type {string} */ (el.dataset.ch));
      }
    });
  });
  // .tab is a native <button> — Enter/Space activation comes for free.
  $tabbar.querySelectorAll('.tab').forEach(node => {
    const el = /** @type {HTMLElement} */ (node);
    el.addEventListener('click', () => navigate(/** @type {string} */ (el.dataset.ch)));
  });
}

/**
 * Highlight the active channel on both sidebar rows and mobile tabs: the .active
 * class drives the visual state, aria-current="page" exposes it to assistive tech.
 * @param {string} id
 */
export function setActiveChannel(id) {
  for (const node of document.querySelectorAll('.chan, .tab')) {
    const el = /** @type {HTMLElement} */ (node);
    const active = el.dataset.ch === id;
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
}
