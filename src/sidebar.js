// Sidebar channel list + mobile tabbar rendering, plus active-channel highlight.
import { chAccent, chHeat, CHANNELS, byId } from './channels.js';

function chanRow(c) {
  const heat = chHeat(c.id);
  const cells = 5;
  const on = Math.max(1, Math.round(heat * cells));
  const bars = Array.from({ length: cells }, (_, i) =>
    `<b class="${i < on ? 'on' : ''}"></b>`).join('');
  return `
    <div class="chan" data-ch="${c.id}" style="--ch-accent:${chAccent(c.id)}">
      <span class="hash">#</span>
      <span class="name">${c.label}</span>
      <span class="heat" title="activity">${bars}</span>
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
    <button class="tab" data-ch="${c.id}" style="--ch-accent:${chAccent(c.id)}">
      <span class="tab-hash">#</span>
      <span class="tab-name">${c.label}</span>
      <span class="tab-dot"></span>
    </button>
  `).join('');

  $chanlist.querySelectorAll('.chan').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.ch));
  });
  $tabbar.querySelectorAll('.tab').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.ch));
  });
}

/** Update the .active class on both sidebar rows and mobile tabs to match the given channel id. */
export function setActiveChannel(id) {
  document.querySelectorAll('.chan').forEach(el => {
    el.classList.toggle('active', el.dataset.ch === id);
  });
  document.querySelectorAll('.tab').forEach(el => {
    el.classList.toggle('active', el.dataset.ch === id);
  });
}
