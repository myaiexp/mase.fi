// Data adapter: fetches updates.json and normalizes it to the shape the UI expects.
import { projectLink } from './project-link.js';
import { parseEntryDate, utcDayStart } from './dates.js';
import { fetchDemos, raceTimeout, DEMOS_GRACE_MS } from './data-demos.js';
import { buildSlugToChannel, entrySlug, isRawEntry, isRawProject, normalizeEntry, projectSlug } from './data-normalize.js';
import { fetchJson } from './fetch-json.js';
export { fetchDemos };
export { loadArchive } from './data-archive.js';

const SOURCE_URL = '/updates.json';

// The degraded shape, and the base the success path overrides — one literal so
// the two fetchData branches cannot drift apart.
function emptyData(demos) {
  return {
    meta: { nick: 'mase', server: 'irc.mase.fi', bootTime: Date.now() },
    projects: [],
    entries: [],
    demos,
    stats: {},
    hasArchive: false,
    archiveLoaded: false,
  };
}

/**
 * Fetch + normalize the live updates.json into the canonical shape used by the UI:
 *   { meta, projects, entries, demos, stats, hasArchive, archiveLoaded }
 *
 * The real /updates.json carries a different shape — see docs/content-pipeline.md — so we map here.
 *  - entry.category → category
 *  - entry.project (slug) → channel / projectSlug / projectChannel (via project.slug or project.channel match)
 *  - entry.text || entry.summary → text
 *  - project.heat is computed from last-30d entry count, normalized 0..1
 *  - project.tag, project.links don't exist live — we synthesize: tag = "" (dropped chip), links = [project.url]
 *  - demos: channel slugs with a published demo (from /demos/manifest.json via fetchDemos),
 *    always present (possibly []), so no consumer guards against its absence.
 *  - malformed rows (isRawEntry / isRawProject) are skipped and counted in one warning.
 */
export async function fetchData() {
  // fetchDemos never rejects (it degrades to []). Started now so it overlaps the
  // updates fetch, then grace-raced below so a hung manifest cannot stall init
  // once updates.json is in.
  const demosPromise = fetchDemos();
  // One boundary for a failed fetch/parse (fetchJson rejects on a non-2xx) and
  // any bug thrown while normalizing: main.js awaits this without a catch, so an
  // escape would stall the app shell. Bad rows never reach it — they are skipped.
  try {
    const raw = await fetchJson(SOURCE_URL);

    const projectRows = Array.isArray(raw.projects) ? raw.projects : [];
    const entryRows = Array.isArray(raw.entries) ? raw.entries : [];
    const rawProjects = projectRows.filter(isRawProject);
    const rawEntries = entryRows.filter(isRawEntry);
    const skipped = projectRows.length - rawProjects.length + entryRows.length - rawEntries.length;
    if (skipped) console.warn(`fetchData: skipped ${skipped} malformed row(s) in ${SOURCE_URL}`);

    const slugToChannel = buildSlugToChannel(rawProjects);
    const entries = normalizeEntries(rawEntries, slugToChannel);
    const { counts, lastActivity } = aggregateActivity(entries);
    const projects = normalizeProjects(rawProjects, counts, lastActivity);
    const stats = normalizeStats(raw.stats);

    return {
      ...emptyData(await raceTimeout(demosPromise, DEMOS_GRACE_MS, [])),
      projects,
      entries,
      stats,
      hasArchive: stats.archive === true,
    };
  } catch (err) {
    console.warn('fetchData: failed to load/normalize updates.json, degrading to empty state', err);
    return emptyData(await raceTimeout(demosPromise, DEMOS_GRACE_MS, []));
  }
}

function normalizeStats(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const totalCommits = Number(raw.totalCommits);
  const totalEntries = Number(raw.totalEntries);
  const archivedLogs = Number(raw.archivedLogs);
  const countMap = (m) => (m && typeof m === 'object' ? m : undefined);
  return {
    totalCommits: Number.isFinite(totalCommits) ? totalCommits : undefined,
    totalEntries: Number.isFinite(totalEntries) ? totalEntries : undefined,
    archivedLogs: Number.isFinite(archivedLogs) ? archivedLogs : undefined,
    logFirst: typeof raw.logFirst === 'string' ? raw.logFirst : undefined,
    logLast: typeof raw.logLast === 'string' ? raw.logLast : undefined,
    commitsByProject: countMap(raw.commitsByProject),
    archivedByProject: countMap(raw.archivedByProject),
    archive: raw.archive === true,
  };
}

/**
 * Aggregate per-project activity from normalized entries in a single pass:
 *  - counts:       last-30d log|feature entry count per slug (drives heat)
 *  - lastActivity: newest activity timestamp (ms) per slug (drives recency sort)
 * Only finite-dated, project-bearing log/feature entries contribute — the rows
 * the feed holds, so a feature row normalizeEntry dropped (no mapped project)
 * never sets the heat ceiling.
 */
function aggregateActivity(entries) {
  const cutoff = Date.now() - 30 * 86400000;
  const counts = new Map();
  const lastActivity = new Map();
  for (const e of entries) {
    const slug = e.projectSlug;
    if (!slug) continue;
    if (e.category !== 'log' && e.category !== 'feature') continue;
    // Parse as UTC so heat/recency agree with the feed's day separators.
    const t = parseEntryDate(e.date).getTime();
    if (!Number.isFinite(t)) continue;
    if (t >= cutoff) counts.set(slug, (counts.get(slug) || 0) + 1);
    if (t > (lastActivity.get(slug) || 0)) lastActivity.set(slug, t);
  }
  return { counts, lastActivity };
}

/**
 * Normalize raw projects into the UI shape: synthesize http(s)-only links,
 * compute 0..1 heat from last-30d counts, and sort most-recently-active first.
 * Pure over (rawProjects, counts, lastActivity).
 */
function normalizeProjects(rawProjects, counts, lastActivity) {
  // Reduce instead of spreading into Math.max: a large map would exceed the
  // engine's argument-count limit (~65k) and throw. Floor of 1 avoids a
  // divide-by-zero on an empty map (heat = count / maxCount below).
  let maxCount = 1;
  for (const c of counts.values()) if (c > maxCount) maxCount = c;

  const projects = rawProjects.map((p) => {
    const slug = projectSlug(p);
    const heat = Math.min(1, (counts.get(slug) || 0) / maxCount);
    const links = [];
    const link = projectLink(p.url);
    if (link) links.push(link);
    return {
      name: p.name,
      channel: p.channel,
      slug,
      description: p.desc || '',
      tag: '', // not present in live data; renderers should drop the "stack" chip
      url: p.url || '',
      links,
      heat,
      lastActivity: lastActivity.get(slug) || 0,
    };
  });
  // Sort by most-recently-active first. The sidebar projects group, the
  // mobile tabbar's "first 4", and any other order-sensitive consumer all
  // see the same recency order.
  projects.sort((a, b) => b.lastActivity - a.lastActivity);
  return projects;
}

/**
 * Normalize raw entries into the UI shape (normalizeEntry per row), drop
 * unroutable entries, and sort by date ascending. Entries keep the project's
 * own `channel`; the #activity firehose re-selects all `log` entries separately in
 * entriesFor(), so there's no duplication to strip here.
 * Pure over (rawEntries, slugToChannel).
 */
function normalizeEntries(rawEntries, slugToChannel) {
  return rawEntries
    .map((e) => normalizeEntry(e, slugToChannel))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Return entries for a given channel id, sorted ascending (oldest first).
 * - home     → daily summaries
 * - activity → all log entries across projects (firehose)
 * - <slug>   → entries matching that project channel (any category)
 */
export function entriesFor(channelId, data) {
  if (channelId === 'home') {
    return data.entries.filter((e) => e.category === 'daily');
  }
  if (channelId === 'activity') {
    return data.entries.filter((e) => e.category === 'log');
  }
  return data.entries.filter((e) => e.channel === channelId && e.category !== 'log');
}

/**
 * Single-pass log aggregate for the pinned cards. Walks data.entries once:
 *   - totalCommits: all-history `log` count (allHistoryLogs below)
 *   - totalEntries: all-history entry count — the non-log rows (never archived,
 *                   so all of them are in memory) plus totalCommits
 *   - buckets:      last-`days` per-day counts, oldest first (finite, in-range
 *                   dates only) — the #home heatstrip and the #activity rate
 *   - last:         newest `log` entry by date string, or null
 * Buckets are keyed by UTC calendar day (parseEntryDate → utcDayStart), the same
 * day definition the feed's separators use, so a viewer off UTC sees a heatstrip
 * aligned with the feed instead of a locally-shifted one. The finite-date guard
 * is a nested branch (not `continue`) so a malformed date still counts toward
 * totalCommits and the newest-entry comparison — only the day bucket needs a
 * parseable date.
 */
export function logStats(data, days = 28) {
  const buckets = new Array(days).fill(0);
  const todayUTC = utcDayStart(new Date());
  let inMemoryLogs = 0;
  let nonLogEntries = 0;
  let last = null;
  for (const e of data.entries) {
    if (e.category !== 'log') {
      nonLogEntries++;
      continue;
    }
    inMemoryLogs++;
    const d = parseEntryDate(e.date);
    const t = d.getTime();
    if (Number.isFinite(t)) {
      // Whole UTC days between the entry and today; the index counts back from the
      // newest (last) bucket. Both ends snap to UTC midnight, so the difference is
      // an exact day count — no raw-ms flooring that drifts an hour across a DST edge.
      const idx = days - 1 - Math.round((todayUTC - utcDayStart(d)) / 86400000);
      if (idx >= 0 && idx < days) buckets[idx]++;
    }
    if (!last || e.date > last.date) last = e;
  }
  const totalCommits = allHistoryLogs(data, inMemoryLogs);
  return { totalCommits, totalEntries: nonLogEntries + totalCommits, buckets, last };
}

// All-history log count. The one home of the archive-cut rule; both pinned
// cards read it through logStats.
//   - archive merged: every log row is in memory, so inMemoryLogs is the total
//   - archivedLogs present: the compact's archived count plus the hot rows, which
//     stays live while deploys prepend logs between nightly compacts
//   - neither: a compact from before archivedLogs existed, so its totalCommits
//     snapshot; else inMemoryLogs (an uncompacted file holds every row)
function allHistoryLogs(data, inMemoryLogs) {
  if (data.archiveLoaded) return inMemoryLogs;
  if (Number.isFinite(data.stats.archivedLogs)) return data.stats.archivedLogs + inMemoryLogs;
  if (Number.isFinite(data.stats.totalCommits)) return data.stats.totalCommits;
  return inMemoryLogs;
}

/**
 * All-history commit count for one project channel, by the same cut rule as
 * allHistoryLogs: the channel's log rows in memory, plus archivedByProject's
 * compact-time count of archived rows when the archive is not merged. Archive
 * keys are raw entry.project strings, slugged by entrySlug and matched against
 * the normalized project's routing slug (project.slug) the way normalizeEntry
 * routes rows. A compact from before archivedByProject existed falls back to
 * its commitsByProject snapshot, keyed by slug, then by channel.
 */
export function commitsForProject(project, data) {
  const inMemory = data.entries.filter((e) => e.channel === project.channel && e.category === 'log').length;
  if (data.archiveLoaded) return inMemory;
  const archived = data.stats.archivedByProject;
  if (archived) {
    let total = inMemory;
    for (const [key, n] of Object.entries(archived)) {
      if (entrySlug(key) === project.slug && Number.isFinite(n)) total += n;
    }
    return total;
  }
  const byProject = data.stats.commitsByProject;
  if (Number.isFinite(byProject?.[project.slug])) return byProject[project.slug];
  if (Number.isFinite(byProject?.[project.channel])) return byProject[project.channel];
  return inMemory;
}
