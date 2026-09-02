// Pinned hero card renderers — one per channel kind
import { LOGO, PROJECT_ART, sparkbar } from './ascii.js';
import { logStats } from './data.js';
import { dayOf, timeOf } from './dates.js';
import { mountBeam, unmountBeam } from './beam.js';
import { escapeHtml } from './html.js';

// heat → status business rule. Single source for the >0.6 / >0.3 breakpoints so
// the desktop hero card and the mobile hero line can't silently diverge.
//   label: cardHead status dot   text: desktop status line   short: mobile status
function heatStatus(heat) {
  if (heat > 0.6) return { label: '● shipping', text: 'actively shipping', short: 'shipping' };
  if (heat > 0.3) return { label: '● steady', text: 'steady', short: 'steady' };
  return { label: '○ idle', text: 'maintenance only', short: 'idle' };
}

// "try demo" anchor when this channel has a published demo (demos/<channel>/).
// Single source for the /demos/ URL shape. `demos` is the canonical always-present
// slug list from fetchData (never undefined). Returns '' when there's no demo;
// `arrow` appends the → glyph (desktop card only).
function demoLinkHtml(channel, demos, { arrow = false } = {}) {
  if (!demos.includes(channel)) return '';
  return '<a class="demo-link" href="/demos/' + escapeHtml(channel) + '/">try demo' +
    (arrow ? ' →' : '') + '</a>';
}

export function cardHead(meta, right) {
  const chips = meta
    .map(([k, v]) => '<span class="ch-meta"><i>' + escapeHtml(k) + '</i><b>' + escapeHtml(v) + '</b></span>')
    .join('');
  return '<div class="card-head">' + chips +
    '<span class="spacer"></span>' +
    '<span class="right">' + escapeHtml(right || '') + '</span>' +
    '</div>';
}

// Shared pinned-card skeleton. `rows` are [dt, ddHtml, ddClass?] — ddHtml is
// already escaped at the call site; ddClass is required for CSS that targets
// `dd.accent` / `dd.links` (colour + flex gap), not a descendant.
function pinCard({ meta, right, art, tagline, rows }) {
  const dl = rows.map(([dt, ddHtml, ddClass]) => {
    const cls = ddClass ? ' class="' + escapeHtml(ddClass) + '"' : '';
    return '<dt>' + escapeHtml(dt) + '</dt><dd' + cls + '>' + ddHtml + '</dd>';
  }).join('');
  return '<div class="card">' +
    cardHead(meta, right) +
    '<div class="card-body pin-grid">' +
    '<pre class="ascii">' + escapeHtml(art) + '</pre>' +
    '<div>' +
    '<p class="pin-tagline">' + tagline + '</p>' +
    '<dl class="pin-meta">' + dl + '</dl>' +
    '</div></div></div>';
}

function pinnedHome(data) {
  const { totalCommits, buckets, last } = logStats(data, 28);
  const maxV = Math.max(1, ...buckets);
  const spark = sparkbar(buckets, maxV);
  // Every dynamic value (date slices + project) is escapeHtml'd; the accent span
  // is a static wrapper.
  const lastStr = last
    ? `${escapeHtml(dayOf(last.date))} \xb7 ${escapeHtml(timeOf(last.date))} \xb7 <span class="accent">${escapeHtml(last.project || '—')}</span>`
    : '—';
  return pinCard({
    meta: [['modes', '+ntr'], ['users', '1'], ['since', '2018']],
    right: '● live',
    art: LOGO,
    tagline: '<b>mase</b> — software, in progress. this is the always-on log: what i shipped, what i broke, what i thought was worth writing down.',
    rows: [
      ['projects', data.projects.length + ' active', 'accent'],
      ['commits', totalCommits + ' in feed \xb7 ' + spark],
      ['last push', lastStr],
      ['links', '<a href="#/activity">activity</a><a href="https://github.com/myaiexp">github</a>', 'links'],
    ],
  });
}

function pinnedProject(p, data) {
  const art = PROJECT_ART[p.channel] || '';
  const commits = Number.isFinite(data.stats?.commitsByProject?.[p.slug])
    ? data.stats.commitsByProject[p.slug]
    : Number.isFinite(data.stats?.commitsByProject?.[p.channel])
      ? data.stats.commitsByProject[p.channel]
      : data.entries.filter(e => e.ch === p.channel && e.cat === 'log').length;
  const status = heatStatus(p.heat);
  const demoLink = demoLinkHtml(p.channel, data.demos, { arrow: true });
  const linksHtml = demoLink +
    p.links.map(l => '<a href="' + escapeHtml(l.href) + '">' + escapeHtml(l.label) + '</a>').join('');
  return pinCard({
    meta: [['heat', (p.heat * 100 | 0) + '%'], ['commits', String(commits)]],
    right: status.label,
    art,
    tagline: escapeHtml(p.description),
    rows: [
      ['activity', commits + ' commits in feed \xb7 heat ' + (p.heat * 100 | 0) + '%'],
      ['status', status.text, 'accent'],
      ['links', linksHtml, 'links'],
    ],
  });
}

function pinnedActivity(data) {
  const cats = { log: 0, feature: 0, daily: 0, project: 0 };
  data.entries.forEach(e => { cats[e.cat] = (cats[e.cat] || 0) + 1; });
  const logEntries = data.entries.filter(e => e.cat === 'log');
  let range = '—';
  const statsFirst = typeof data.stats?.logFirst === 'string' ? data.stats.logFirst : '';
  const statsLast = typeof data.stats?.logLast === 'string' ? data.stats.logLast : '';
  if (statsFirst && statsLast) {
    range = escapeHtml(statsFirst) + ' → ' + escapeHtml(statsLast);
  } else if (logEntries.length) {
    range = escapeHtml(dayOf(logEntries[0].date)) + ' → ' +
      escapeHtml(dayOf(logEntries[logEntries.length - 1].date));
  }
  // Real recent commit rate: average log entries per ACTIVE day over the last 28
  // days (idle days excluded so the figure reflects "when I push, ~N/day" rather
  // than a calendar average diluted to near-zero). Recomputed every render — no
  // stale hardcoded constant. '—' when there's been no recent activity.
  const { buckets: recent, totalCommits } = logStats(data, 28);
  const totalEntries = data.archiveLoaded
    ? data.entries.length
    : data.entries.filter((e) => e.cat !== 'log').length + totalCommits;
  const activeDays = recent.filter(n => n > 0).length;
  const rate = activeDays
    ? '~' + Math.round(recent.reduce((a, b) => a + b, 0) / activeDays) + '/day'
    : '—';
  const artLines = [
    '  ╭─ stream ────────────────╮',
    '  │  log      ▇▇▇▇▇▇▇▇▇  ' + String(cats.log).padStart(2) + '  │',
    '  │  feature  ▇▇▇        ' + String(cats.feature).padStart(2) + '  │',
    '  │  daily    ▇▇▇▇▇      ' + String(cats.daily).padStart(2) + '  │',
    '  ╰───────────────────────╯',
  ].join('\n');
  return pinCard({
    meta: [['modes', '+mn'], ['source', 'post-receive'], ['rate', rate]],
    right: 'live tail',
    art: artLines,
    tagline: 'the unfiltered tail. git hooks push here directly, one line per commit, every project.',
    rows: [
      ['total', totalEntries + ' entries', 'accent'],
      ['range', range],
      ['source', 'post-receive hook → updates.json'],
    ],
  });
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
    const status = heatStatus(project.heat);
    const demo = demoLinkHtml(id, data.demos);
    const demoLink = demo ? demo + ' <span class="sep">\xb7</span> ' : '';
    if (project.links && project.links.length > 0) {
      html =
        '<span class="arr">→</span> ' + demoLink +
        '<a href="' + escapeHtml(project.links[0].href) + '">' + escapeHtml(project.links[0].label) + '</a> ' +
        '<span class="sep">\xb7</span> ' +
        '<span class="status">' + status.short + '</span>';
    } else {
      html =
        '<span class="arr">→</span> ' + demoLink +
        '<span class="status">' + status.short + '</span>';
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
  // Tear down the home-channel beam *before* replacing markup — mountBeam only
  // runs its previous cleanup on the next mount, which never happens if we
  // leave #home. Home remounts immediately after this.
  unmountBeam();
  pinnedEl.innerHTML = html;
  // Home channel only: instrument the LOGO <pre> with the pretext-measured
  // beam destruction effect. `mountBeam` no-ops on reduced-motion / hidden hosts
  // and self-cleans the previous mount via its activeCleanup tracking.
  if (id === 'home') {
    const asciiEl = pinnedEl.querySelector('.ascii');
    if (asciiEl) mountBeam(asciiEl, LOGO);
  }
}
