// Pinned hero card renderers — one per channel kind
import { LOGO, PROJECT_ART, sparkbar } from './ascii.js';
import { logStats, commitsForProject } from './data.js';
import { dayOf, timeOf } from './dates.js';
import { mountBeam, unmountBeam } from './beam.js';
import { escapeHtml } from './html.js';

// heat → status business rule. Single source for the >0.6 / >0.3 breakpoints so
// the desktop hero card and the mobile hero line can't silently diverge.
function heatStatus(heat) {
  if (heat > 0.6) return { cardBadge: '● shipping', cardLine: 'actively shipping', mobileLabel: 'shipping' };
  if (heat > 0.3) return { cardBadge: '● steady', cardLine: 'steady', mobileLabel: 'steady' };
  return { cardBadge: '○ idle', cardLine: 'maintenance only', mobileLabel: 'idle' };
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

// One {label, href} link as an anchor — the card's links row and the hero line
// both render project and home links through it.
function linkHtml(l) {
  return '<a href="' + escapeHtml(l.href) + '">' + escapeHtml(l.label) + '</a>';
}

// #home's quick links, shown on the desktop card and the mobile hero line.
const HOME_LINKS = [
  { label: 'activity', href: '#/activity' },
  { label: 'github', href: 'https://github.com/myaiexp' },
];

// The project behind a channel id, or undefined for home/activity/unknown ids.
function projectFor(id, data) {
  return data.projects.find(p => p.channel === id);
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
    ? `${escapeHtml(dayOf(last.date))} \xb7 ${escapeHtml(timeOf(last.date))} \xb7 <span class="accent">${escapeHtml(last.projectSlug || '—')}</span>`
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
      ['links', HOME_LINKS.map(linkHtml).join(''), 'links'],
    ],
  });
}

function pinnedProject(p, data) {
  const art = PROJECT_ART[p.channel] || '';
  const commits = commitsForProject(p, data);
  const status = heatStatus(p.heat);
  const demoLink = demoLinkHtml(p.channel, data.demos, { arrow: true });
  const linksHtml = demoLink + p.links.map(linkHtml).join('');
  return pinCard({
    meta: [['heat', (p.heat * 100 | 0) + '%'], ['commits', String(commits)]],
    right: status.cardBadge,
    art,
    tagline: escapeHtml(p.description),
    rows: [
      ['activity', commits + ' commits in feed \xb7 heat ' + (p.heat * 100 | 0) + '%'],
      ['status', status.cardLine, 'accent'],
      ['links', linksHtml, 'links'],
    ],
  });
}

function pinnedActivity(data) {
  // Only the categories the stream art displays; entries arrive date-sorted, so
  // the first and last log rows seen are the oldest and newest.
  const catCounts = { log: 0, feature: 0, daily: 0 };
  let firstLog = null;
  let lastLog = null;
  for (const e of data.entries) {
    if (Object.hasOwn(catCounts, e.category)) catCounts[e.category]++;
    if (e.category !== 'log') continue;
    firstLog ??= e;
    lastLog = e;
  }
  let range = '—';
  const { logFirst, logLast } = data.stats;
  if (logFirst && logLast) {
    range = escapeHtml(logFirst) + ' → ' + escapeHtml(logLast);
  } else if (firstLog) {
    range = escapeHtml(dayOf(firstLog.date)) + ' → ' + escapeHtml(dayOf(lastLog.date));
  }
  // Real recent commit rate: average log entries per ACTIVE day over the last 28
  // days (idle days excluded so the figure reflects "when I push, ~N/day" rather
  // than a calendar average diluted to near-zero). Recomputed every render — no
  // stale hardcoded constant. '—' when there's been no recent activity.
  const { buckets: recent, totalEntries } = logStats(data, 28);
  const activeDays = recent.filter(n => n > 0).length;
  const rate = activeDays
    ? '~' + Math.round(recent.reduce((a, b) => a + b, 0) / activeDays) + '/day'
    : '—';
  const artLines = [
    '  ╭─ stream ────────────────╮',
    '  │  log      ▇▇▇▇▇▇▇▇▇  ' + String(catCounts.log).padStart(2) + '  │',
    '  │  feature  ▇▇▇        ' + String(catCounts.feature).padStart(2) + '  │',
    '  │  daily    ▇▇▇▇▇      ' + String(catCounts.daily).padStart(2) + '  │',
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
  // activity and unmatched channels: empty string — CSS :empty hides the element
  document.getElementById('hero-line').innerHTML = heroLineHtml(id, data);
}

// The arrow, then the present parts joined by a · separator. '' when the channel
// has no hero line (activity, unmatched ids).
function heroLineHtml(id, data) {
  let parts;
  if (id === 'home') {
    parts = HOME_LINKS.map(linkHtml);
  } else {
    const project = projectFor(id, data);
    if (!project) return '';
    const link = project.links[0];
    parts = [
      demoLinkHtml(id, data.demos),
      link ? linkHtml(link) : '',
      '<span class="status">' + heatStatus(project.heat).mobileLabel + '</span>',
    ].filter(Boolean);
  }
  return '<span class="arr">→</span> ' + parts.join(' <span class="sep">\xb7</span> ');
}

/** Replace #pinned content with the channel-appropriate card. */
export function renderPinned(id, data) {
  let html = '';
  if (id === 'home') html = pinnedHome(data);
  else if (id === 'activity') html = pinnedActivity(data);
  else {
    const project = projectFor(id, data);
    if (project) html = pinnedProject(project, data);
  }
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
