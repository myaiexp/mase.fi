// Pinned hero card renderers — one per channel kind
import { LOGO, PROJECT_ART, sparkbar } from './ascii.js';
import { totalLogCount, dailyLogBuckets, lastLog } from './data.js';
import { mountBeam } from './beam.js';
// Local duplicate (avoids a util module for one tiny function)
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function cardHead(meta, right) {
  const chips = meta
    .map(([k, v]) => '<span class="ch-meta"><i>' + k + '</i><b>' + v + '</b></span>')
    .join('');
  return '<div class="card-head">' + chips +
    '<span class="spacer"></span>' +
    '<span class="right">' + (right || '') + '</span>' +
    '</div>';
}

function pinnedHome(data) {
  const totalCommits = totalLogCount(data);
  const values = dailyLogBuckets(data, 28);
  const maxV = Math.max(1, ...values);
  const spark = sparkbar(values, maxV);
  const last = lastLog(data);
  // lastStr uses escapeHtml on user data; the accent span is a static wrapper
  const lastStr = last
    ? last.date.slice(0, 10) + ' \xb7 ' + last.date.slice(11, 16) + ' \xb7 <span class="accent">' + escapeHtml(last.project || '—') + '</span>'
    : '—';
  return '<div class="card">' +
    cardHead([['modes', '+ntr'], ['users', '1'], ['since', '2018']], '● live') +
    '<div class="card-body pin-grid">' +
    '<pre class="ascii">' + escapeHtml(LOGO) + '</pre>' +
    '<div>' +
    '<p class="pin-tagline"><b>mase</b> — software, in progress. this is the always-on log: what i shipped, what i broke, what i thought was worth writing down.</p>' +
    '<dl class="pin-meta">' +
    '<dt>projects</dt><dd class="accent">' + data.projects.length + ' active</dd>' +
    '<dt>commits</dt><dd>' + totalCommits + ' in feed \xb7 ' + spark + '</dd>' +
    '<dt>last push</dt><dd>' + lastStr + '</dd>' +
    '<dt>links</dt><dd class="links">' +
    '<a href="#/activity">activity</a>' +
    '<a href="https://github.com/myaiexp">github</a>' +
    '</dd>' +
    '</dl>' +
    '</div>' +
    '</div>' +
    '</div>';
}

function pinnedProject(p, data) {
  const art = PROJECT_ART[p.channel] || '';
  const commits = data.entries.filter(e => e.ch === p.channel && e.cat === 'log').length;
  const statusLabel = p.heat > 0.6 ? '● shipping' : p.heat > 0.3 ? '● steady' : '○ idle';
  const statusText = p.heat > 0.6 ? 'actively shipping' : p.heat > 0.3 ? 'steady' : 'maintenance only';
  return '<div class="card">' +
    cardHead([['heat', (p.heat * 100 | 0) + '%'], ['commits', String(commits)]], statusLabel) +
    '<div class="card-body pin-grid">' +
    '<pre class="ascii">' + escapeHtml(art) + '</pre>' +
    '<div>' +
    '<p class="pin-tagline">' + escapeHtml(p.description) + '</p>' +
    '<dl class="pin-meta">' +
    '<dt>activity</dt><dd>' + commits + ' commits in feed \xb7 heat ' + (p.heat * 100 | 0) + '%</dd>' +
    '<dt>status</dt><dd class="accent">' + statusText + '</dd>' +
    '<dt>links</dt><dd class="links">' +
    p.links.map(l => '<a href="' + escapeHtml(l.href) + '">' + escapeHtml(l.label) + '</a>').join('') +
    '</dd>' +
    '</dl>' +
    '</div>' +
    '</div>' +
    '</div>';
}

function pinnedActivity(data) {
  const cats = { log: 0, feature: 0, daily: 0, project: 0 };
  data.entries.forEach(e => { cats[e.cat] = (cats[e.cat] || 0) + 1; });
  const logEntries = data.entries.filter(e => e.cat === 'log');
  let range = '—';
  if (logEntries.length) {
    const first = logEntries[0].date.slice(0, 10);
    const last = logEntries[logEntries.length - 1].date.slice(0, 10);
    range = first + ' → ' + last;
  }
  const artLines = [
    '  ╭─ stream ────────────────╮',
    '  │  log      ▇▇▇▇▇▇▇▇▇  ' + String(cats.log).padStart(2) + '  │',
    '  │  feature  ▇▇▇        ' + String(cats.feature).padStart(2) + '  │',
    '  │  daily    ▇▇▇▇▇      ' + String(cats.daily).padStart(2) + '  │',
    '  ╰───────────────────────╯',
  ].join('\n');
  return '<div class="card">' +
    cardHead([['modes', '+mn'], ['source', 'post-receive'], ['rate', '~12/day']], 'live tail') +
    '<div class="card-body pin-grid">' +
    '<pre class="ascii">' + escapeHtml(artLines) + '</pre>' +
    '<div>' +
    '<p class="pin-tagline">the unfiltered tail. git hooks push here directly, one line per commit, every project.</p>' +
    '<dl class="pin-meta">' +
    '<dt>total</dt><dd class="accent">' + data.entries.length + ' entries</dd>' +
    '<dt>range</dt><dd>' + range + '</dd>' +
    '<dt>source</dt><dd>post-receive hook → updates.json</dd>' +
    '</dl>' +
    '</div>' +
    '</div>' +
    '</div>';
}

/** Replace #hero-line content with a mobile-only quick-access row. */
export function renderHeroLine(id, data) {
  const project = data.projects.find(p => p.channel === id);
  let html = '';
  if (id === 'home') {
    html =
      '<span class="arr">→</span> ' +
      '<a href="#/activity">activity</a> ' +
      '<span class="sep">\xb7</span> ' +
      '<a href="https://github.com/myaiexp">github</a>';
  } else if (project) {
    const statusText = project.heat > 0.6 ? 'shipping' : project.heat > 0.3 ? 'steady' : 'idle';
    if (project.links && project.links.length > 0) {
      html =
        '<span class="arr">→</span> ' +
        '<a href="' + escapeHtml(project.links[0].href) + '">' + escapeHtml(project.links[0].label) + '</a> ' +
        '<span class="sep">\xb7</span> ' +
        '<span class="status">' + statusText + '</span>';
    } else {
      html =
        '<span class="arr">→</span> ' +
        '<span class="status">' + statusText + '</span>';
    }
  }
  // activity and unmatched channels: empty string — CSS :empty hides the element
  document.getElementById('hero-line').innerHTML = html;
}

/** Replace #pinned content with the channel-appropriate card. */
export function renderPinned(id, data) {
  const project = data.projects.find(p => p.channel === id);
  let html = '';
  if (id === 'home') html = pinnedHome(data);
  else if (id === 'activity') html = pinnedActivity(data);
  else if (project) html = pinnedProject(project, data);
  // html is built from escapeHtml-sanitized data; static markup only elsewhere
  const pinnedEl = document.getElementById('pinned');
  pinnedEl.innerHTML = html;
  // Home channel only: instrument the LOGO <pre> with the pretext-measured
  // beam destruction effect. `mountBeam` no-ops on reduced-motion / hidden hosts
  // and self-cleans the previous mount via its activeCleanup tracking.
  if (id === 'home') {
    const asciiEl = pinnedEl.querySelector('.ascii');
    if (asciiEl) mountBeam(asciiEl, LOGO);
  }
}
