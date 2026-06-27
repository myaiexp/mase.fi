// Sidebar channel list + mobile tabbar rendering, plus active-channel highlight.
import { chAccent, chHeat, CHANNELS, byId } from './channels.js';
import { escapeHtml } from './html.js';

function chanRow(c) {
  const heat = chHeat(c.id);
  const cells = 5;
  const on = Math.max(1, Math.round(heat * cells));
  const bars = Array.from({ length: cells }, (_, i) =>
    `<b class="${i < on ? 'on' : ''}"></b>`).join('');
  // role=link + tabindex makes these div rows keyboard-operable navigation
  // targets (they change the hash route); aria-label gives a clean name since
  // the visible content is "# <label>" plus decorative heat bars.
  return `
    <div class="chan" data-ch="${escapeHtml(c.id)}" role="link" tabindex="0" aria-label="${escapeHtml(c.label)} channel" style="--ch-accent:${chAccent(c.id)}">
      <span class="hash" aria-hidden="true">#</span>
      <span class="name">${escapeHtml(c.label)}</span>
      <span class="heat" title="activity" aria-hidden="true">${bars}</span>
    </div>`;
}

/** Render the desktop sidebar (#chanlist) and the mobile tabbar (#tabbar). Wires click → navigate. */
export function renderChanlist(data, navigate) {
  const $chanlist = document.getElementById('chanlist');
  const $tabbar = document.getElementById('tabbar');

  const groups = [['system', 'server'], ['projects', 'projects']];
  const html = groups.map(([key, title]) => {
    const chans = CHANNELS.filter(c => c.group === key);
    return `<div class="chan-group">${title}</div>` +
      chans.map(c => chanRow(c)).join('');
  }).join('');
  $chanlist.innerHTML = html;

  // Mobile tabs: home + activity + first 4 projects
  const primary = [
    byId.home, byId.activity,
    ...data.projects.slice(0, 4).map(p => byId[p.channel]),
  ].filter(Boolean);
  $tabbar.innerHTML = primary.map(c => `
    <button class="tab" data-ch="${escapeHtml(c.id)}" aria-label="${escapeHtml(c.label)} channel" style="--ch-accent:${chAccent(c.id)}">
      <span class="tab-hash" aria-hidden="true">#</span>
      <span class="tab-name">${escapeHtml(c.label)}</span>
      <span class="tab-dot" aria-hidden="true"></span>
    </button>
  `).join('');

  $chanlist.querySelectorAll('.chan').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.ch));
    // role=link rows aren't natively keyboard-operable; activate on Enter/Space
    // (Space is preventDefaulted so it navigates instead of scrolling the list).
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        navigate(el.dataset.ch);
      }
    });
  });
  // .tab is a native <button> — Enter/Space activation comes for free.
  $tabbar.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.ch));
  });
}

/**
 * Highlight the active channel on both sidebar rows and mobile tabs: the .active
 * class drives the visual state, aria-current="page" exposes it to assistive tech.
 */
export function setActiveChannel(id) {
  for (const el of document.querySelectorAll('.chan, .tab')) {
    const active = el.dataset.ch === id;
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
}
