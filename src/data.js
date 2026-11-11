// Data adapter: fetches updates.json and normalizes it to the shape the UI expects.
/** @import { AppData, Entry, Project, RawEntry, RawProject, Stats } from './types.js' */
import { projectLink } from './project-link.js';
import { entryNow, parseEntryDate } from './dates.js';
import { fetchDemos, raceTimeout, DEMOS_GRACE_MS } from './data-demos.js';
import { buildSlugToChannel, isRawEntry, isRawProject, normalizeEntry, projectSlug } from './data-normalize.js';
import { fetchJson } from './fetch-json.js';
export { fetchDemos };
export { loadArchive } from './data-archive.js';

const SOURCE_URL = '/updates.json';
// Distinct from any array fetchDemos can return, so a timeout is not an empty manifest.
const DEMOS_UNREADY = Symbol('demos-unready');

// The manifest races the grace window. A win is the slug list. A loss keeps the
// still-running promise so the caller can apply it after first paint.
/** @param {Promise<string[]>} demosPromise @returns {Promise<{ demos: string[], pendingDemos?: Promise<string[]> }>} */
async function demosWithinGrace(demosPromise) {
  const raced = await raceTimeout(demosPromise, DEMOS_GRACE_MS, DEMOS_UNREADY);
  if (raced === DEMOS_UNREADY) return { demos: [], pendingDemos: demosPromise };
  return { demos: /** @type {string[]} */ (raced) };
}

/** @param {AppData} data @param {{ pendingDemos?: Promise<string[]> }} demoFields @returns {AppData} */
function withPendingDemos(data, demoFields) {
  if (demoFields.pendingDemos) data.pendingDemos = demoFields.pendingDemos;
  return data;
}

// The degraded shape, and the base the success path overrides — one literal so
// the two fetchData branches cannot drift apart.
/** @param {string[]} demos @returns {AppData} */
function emptyData(demos) {
  return {
    meta: { server: 'irc.mase.fi', bootTime: Date.now() },
    projects: [],
    entries: [],
    demos,
    stats: {},
    hasArchive: false,
    archiveLoaded: false,
    // loadFailed: /updates.json did not load, so the empty shape is a failure,
    // not a quiet log. archiveFailed: the last loadArchive attempt failed.
    loadFailed: false,
    archiveFailed: false,
  };
}

/**
 * Fetch + normalize the live updates.json into the canonical shape used by the UI:
 *   { meta, projects, entries, demos, stats, hasArchive, archiveLoaded, loadFailed, archiveFailed, pendingDemos? }
 *
 * pendingDemos is set only when the manifest lost DEMOS_GRACE_MS. It fulfills
 * with the slug list; demos stays [] until the caller applies it.
 *
 * The real /updates.json carries a different shape — see docs/content-pipeline.md — so we map here.
 *  - entry.category → category
 *  - entry.project → channel / projectSlug / projectChannel (a non-empty string slug, otherwise channel)
 *  - entry.text || entry.summary → text
 *  - project.heat is computed from last-30d entry count, normalized 0..1
 *  - project.links is synthesized from the raw project.url (http(s) or same-origin only)
 *  - demos: channel slugs with a published demo (from /demos/manifest.json via fetchDemos),
 *    always present (possibly []), so no consumer guards against its absence.
 *  - malformed rows (isRawEntry / isRawProject) are skipped and counted in one warning.
 * @returns {Promise<AppData>}
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
    // Untyped JSON; a null/non-object body throws below and lands in the catch.
    const raw = /** @type {{ projects?: unknown, entries?: unknown, stats?: unknown }} */ (await fetchJson(SOURCE_URL));

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

    const demoFields = await demosWithinGrace(demosPromise);
    return withPendingDemos({
      ...emptyData(demoFields.demos),
      projects,
      entries,
      stats,
      hasArchive: stats.archive === true,
    }, demoFields);
  } catch (err) {
    console.warn('fetchData: failed to load/normalize updates.json, degrading to empty state', err);
    const demoFields = await demosWithinGrace(demosPromise);
    return withPendingDemos({ ...emptyData(demoFields.demos), loadFailed: true }, demoFields);
  }
}

/** @param {unknown} raw @returns {Stats} */
function normalizeStats(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const r = /** @type {Record<string, unknown>} */ (raw);
  // No Number() coercion: it maps null, '' and false to 0, and a 0 totalCommits
  // snapshot would win over counting the logs in memory.
  const count = (/** @type {unknown} */ v) => (Number.isFinite(v) ? /** @type {number} */ (v) : undefined);
  const countMap = (/** @type {unknown} */ m) => (m && typeof m === 'object' ? /** @type {Record<string, number>} */ (m) : undefined);
  return {
    totalCommits: count(r.totalCommits),
    totalEntries: count(r.totalEntries),
    archivedLogs: count(r.archivedLogs),
    logFirst: typeof r.logFirst === 'string' ? r.logFirst : undefined,
    logLast: typeof r.logLast === 'string' ? r.logLast : undefined,
    commitsByProject: countMap(r.commitsByProject),
    archivedByProject: countMap(r.archivedByProject),
    archive: r.archive === true,
  };
}

/**
 * Aggregate per-project activity from normalized entries in a single pass:
 *  - counts:       last-30d log|feature entry count per slug (drives heat)
 *  - lastActivity: newest activity timestamp (ms) per slug (drives recency sort)
 * Only finite-dated, project-bearing log/feature entries contribute — the rows
 * the feed holds, so a feature row normalizeEntry dropped (no mapped project)
 * never sets the heat ceiling.
 * @param {Entry[]} entries
 * @returns {{ counts: Map<string, number>, lastActivity: Map<string, number> }}
 */
function aggregateActivity(entries) {
  // On the entry-date axis (entryNow), so the 30-day edge sits where the stamps do.
  const cutoff = entryNow() - 30 * 86400000;
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
 * @param {RawProject[]} rawProjects
 * @param {Map<string, number>} counts
 * @param {Map<string, number>} lastActivity
 * @returns {Project[]}
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
    /** @type {import('./types.js').ProjectLink[]} */
    const links = [];
    const link = projectLink(p.url);
    if (link) links.push(link);
    return {
      name: p.name,
      channel: p.channel,
      slug,
      description: p.desc || '',
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
 * @param {RawEntry[]} rawEntries
 * @param {Map<string, string>} slugToChannel
 * @returns {Entry[]}
 */
function normalizeEntries(rawEntries, slugToChannel) {
  return rawEntries
    .map((e) => normalizeEntry(e, slugToChannel))
    .filter((e) => e !== null)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Return entries for a given channel id, sorted ascending (oldest first).
 * - home     → daily summaries
 * - activity → all log entries across projects (firehose)
 * - <slug>   → that project channel's non-log entries (daily + feature); its
 *              logs appear only in #activity
 * @param {string} channelId
 * @param {AppData} data
 * @returns {Entry[]}
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
