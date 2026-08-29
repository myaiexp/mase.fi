// Data adapter: fetches updates.json and normalizes it to the shape the UI expects.

const SOURCE_URL = '/updates.json';
const DEMOS_MANIFEST_URL = '/demos/manifest.json';
// A hung fetch with no AbortSignal stalls the app shell — main.js awaits
// fetchData with no timeout of its own. updates.json is required; the demos
// manifest is optional chips. Time-box both, then grace-race demos so a hung
// manifest cannot delay init after updates.json is already in.
const FETCH_TIMEOUT_MS = 8000;
const DEMOS_GRACE_MS = 400;

async function raceTimeout(promise, ms, fallback) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the list of project channels that have a published demo, from the demos
 * repo's manifest (written by its post-deploy from synced-dirs.txt). Tolerant of
 * absence (no demos dir, local dev, 404) — returns [] so callers can always
 * `.includes(channel)` without guarding. Returns a string[] of channel slugs.
 */
export async function fetchDemos() {
  try {
    const r = await fetch(DEMOS_MANIFEST_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) return [];
    const list = await r.json();
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Fetch + normalize the live updates.json into the canonical shape used by the UI:
 *   { meta:{nick,server,bootTime}, projects:[{name,channel,description,tag,links[],heat}], entries:[{ch,date,cat,nick,text,project?}], demos:[channelSlug] }
 *
 * The real /updates.json carries a different shape — see README — so we map here.
 *  - entry.category → cat
 *  - entry.project (slug) → ch (via project.slug or project.channel match)
 *  - entry.text || entry.summary → text
 *  - project.heat is computed from last-30d entry count, normalized 0..1
 *  - project.tag, project.links don't exist live — we synthesize: tag = "" (dropped chip), links = [project.url]
 *  - demos: channel slugs with a published demo (from /demos/manifest.json via fetchDemos),
 *    fetched in parallel and folded in here so the shape is complete in one place — no
 *    consumer has to staple it on or guard against its absence.
 */
export async function fetchData() {
  // Kick the demos-manifest fetch off up front so it overlaps the updates fetch.
  // fetchDemos never rejects (it degrades to [] on any failure). After updates
  // is in, grace-race demos so a hung/slow manifest cannot stall init — chips
  // degrade to [] if it isn't ready within DEMOS_GRACE_MS.
  const demosPromise = fetchDemos();
  // Single error boundary around fetch + the full normalization pipeline. A
  // network/parse failure OR a structural error while normalizing (e.g. a null
  // element in entries making e.project throw, a non-array field) both degrade to
  // the same empty fallback instead of escaping as an unhandled rejection — main.js
  // awaits this without a catch, so an escape would silently stall the app shell.
  try {
    const raw = await fetch(SOURCE_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).then((r) => {
      // Assert a 2xx before parsing: a 4xx/5xx with a JSON error body (e.g. from a
      // reverse proxy) would otherwise parse as data and degrade silently to empty
      // state. Throwing routes it to the catch below, which is the same fallback.
      if (!r.ok) throw new Error('updates.json HTTP ' + r.status);
      return r.json();
    });

    const rawProjects = Array.isArray(raw.projects) ? raw.projects : [];
    const rawEntries = Array.isArray(raw.entries) ? raw.entries : [];

    const slugToChannel = buildSlugToChannel(rawProjects);
    const { counts, lastActivity } = aggregateActivity(rawEntries);
    const projects = normalizeProjects(rawProjects, counts, lastActivity);
    const entries = normalizeEntries(rawEntries, slugToChannel);

    return {
      meta: { nick: 'mase', server: 'irc.mase.fi', bootTime: Date.now() },
      projects,
      entries,
      demos: await raceTimeout(demosPromise, DEMOS_GRACE_MS, []),
    };
  } catch (err) {
    // Deliberate degrade-to-empty so the app shell still renders, but this catch
    // also traps any programming bug thrown in the normalization pipeline — warn
    // so a real bug surfaces in the console instead of masquerading as the benign
    // "server returned no data" case.
    console.warn('fetchData: failed to load/normalize updates.json, degrading to empty state', err);
    return {
      meta: { nick: 'mase', server: 'irc.mase.fi', bootTime: Date.now() },
      projects: [],
      entries: [],
      demos: await raceTimeout(demosPromise, DEMOS_GRACE_MS, []),
    };
  }
}

/**
 * Build the entry-slug → channel lookup. Entries reference a project by slug
 * (matched case-insensitively); channels are keyed by `channel`. A project's slug
 * defaults to its channel when not given explicitly.
 */
function buildSlugToChannel(rawProjects) {
  const slugToChannel = new Map();
  for (const p of rawProjects) {
    const slug = (p.slug || p.channel || '').toLowerCase();
    if (slug) slugToChannel.set(slug, p.channel);
  }
  return slugToChannel;
}

/**
 * Aggregate per-project activity from raw entries in a single pass:
 *  - counts:       last-30d log|feature entry count per slug (drives heat)
 *  - lastActivity: newest activity timestamp (ms) per slug (drives recency sort)
 * Only finite-dated, project-bearing log/feature entries contribute.
 */
function aggregateActivity(rawEntries) {
  const cutoff = Date.now() - 30 * 86400000;
  const counts = new Map();
  const lastActivity = new Map();
  for (const e of rawEntries) {
    if (!e.project) continue;
    if (e.category !== 'log' && e.category !== 'feature') continue;
    // Parse the entry's date as UTC via parseEntryDate — the same day definition
    // the feed's separators use — so heat/recency agree with the feed. Bare
    // Date.parse reads a zone-less "YYYY-MM-DDTHH:MM" as viewer-LOCAL, so anyone
    // off UTC would count near-midnight entries into a different day than they see.
    // normalizeDate first: these are RAW entries, so shapes vary (bare date, full
    // ISO+Z); it reduces them to the zone-less form parseEntryDate expects.
    // cutoff is an absolute instant, so the 30-day window is already viewer-
    // independent — only the parse needed fixing here.
    const t = parseEntryDate(normalizeDate(e.date)).getTime();
    if (!Number.isFinite(t)) continue;
    const slug = e.project.toLowerCase();
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
    const slug = (p.slug || p.channel || '').toLowerCase();
    const heat = Math.min(1, (counts.get(slug) || 0) / maxCount);
    const links = [];
    if (p.url) {
      try {
        const u = new URL(p.url);
        // Only surface http(s) links. Non-special schemes (javascript:, data:,
        // vbscript:) parse successfully with an empty host and would otherwise
        // pass straight through to escapeHtml(), which doesn't strip protocols —
        // a protocol-based XSS vector. Drop anything that isn't http/https.
        if (u.protocol === 'http:' || u.protocol === 'https:') {
          const host = u.host.replace(/^www\./, '');
          links.push({ label: host, href: p.url });
        }
      } catch {
        // URL() throws only on schemeless/relative inputs (e.g. "/explorer"),
        // which are inherently same-origin and safe to link as-is.
        links.push({ label: 'open', href: p.url });
      }
    }
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
 * Normalize raw entries into the UI shape: map category + project-slug → channel
 * (falling back to daily→home, log→activity), drop unroutable entries, normalize
 * the date, pick a nick, and sort by date ascending. Entries keep the project's
 * own `ch`; the #activity firehose re-selects all `log` entries separately in
 * entriesFor(), so there's no duplication to strip here.
 * Pure over (rawEntries, slugToChannel).
 */
function normalizeEntries(rawEntries, slugToChannel) {
  return rawEntries
    .map((e) => {
      const slug = (e.project || '').toLowerCase();
      const mappedChannel = slugToChannel.get(slug);
      const ch = mappedChannel
        || (e.category === 'daily' ? 'home' : e.category === 'log' ? 'activity' : null);
      if (!ch) return null;
      const date = normalizeDate(e.date);
      const text = e.text || e.summary || '';
      const nick = pickNick(e);
      return {
        ch,
        cat: e.category,
        date,
        nick,
        text,
        project: slug || undefined,
        mappedChannel,
        sticky: !!e.sticky,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Parse an entry date into a Date. Entry dates are wall-clock Finnish-server
 * strings with no zone marker, so the 'Z' makes the parse explicitly UTC rather
 * than viewer-local — otherwise the same entry would land on a different day
 * depending on who's reading. The input is normalizeDate's output shape
 * ("YYYY-MM-DDTHH:MM", no zone suffix); keep the two in step if that changes.
 */
export function parseEntryDate(d) {
  return new Date(d + 'Z');
}

/** Normalize a date string to "YYYY-MM-DDTHH:MM" form used by the UI. */
function normalizeDate(s) {
  if (!s || typeof s !== 'string') return '1970-01-01T00:00';
  // Already has time component
  if (/T\d{2}:\d{2}/.test(s)) return s.slice(0, 16);
  // Bare YYYY-MM-DD → append T00:00
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T00:00';
  // Anything else is malformed: don't let unbounded/garbage strings reach e.date
  // (downstream renderers slice and inject it into innerHTML). Bound to the epoch
  // fallback so the function always returns a known, ASCII-only date string.
  return '1970-01-01T00:00';
}

/**
 * Pick a nick for an entry based on category.
 * - log → 'git' (commit firehose)
 * - daily → the project slug, so #home reads as a per-project standup: each
 *   project "speaks" its own colour-coded line (nick colours are name-hashed),
 *   which is the channel's subject identity. Project-less daily → 'mase'.
 * - feature/project → 'mase' (these live in a project channel that already
 *   names the subject, so the nick stays the author).
 */
function pickNick(e) {
  if (e.category === 'log') return 'git';
  if (e.category === 'daily' && e.project) return String(e.project).toLowerCase();
  return 'mase';
}

/**
 * Return entries for a given channel id, sorted ascending (oldest first).
 * - home     → daily summaries
 * - activity → all log entries across projects (firehose)
 * - <slug>   → entries matching that project channel (any category)
 */
export function entriesFor(channelId, data) {
  if (channelId === 'home') {
    return data.entries.filter((e) => e.cat === 'daily');
  }
  if (channelId === 'activity') {
    return data.entries.filter((e) => e.cat === 'log');
  }
  return data.entries.filter((e) => e.ch === channelId && e.cat !== 'log');
}

/**
 * UTC-midnight instant (ms) of a Date's UTC calendar day. Anchors day-bucketing
 * to the same UTC day the feed's separators use (parseEntryDate → UTC), and makes
 * day differences exact and DST-immune — every UTC day is exactly 86400000 ms.
 */
function utcDayStart(d) {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

/**
 * Single-pass log aggregate for the pinned cards. Walks data.entries once:
 *   - totalCommits: count of every `log` entry
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
  let totalCommits = 0;
  let last = null;
  for (const e of data.entries) {
    if (e.cat !== 'log') continue;
    totalCommits++;
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
  return { totalCommits, buckets, last };
}

