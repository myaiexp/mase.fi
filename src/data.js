// Data adapter: fetches updates.json and normalizes it to the shape the UI expects.

const SOURCE_URL = '/updates.json';
const DEMOS_MANIFEST_URL = '/demos/manifest.json';

/**
 * Fetch the list of project channels that have a published demo, from the demos
 * repo's manifest (written by its post-deploy from synced-dirs.txt). Tolerant of
 * absence (no demos dir, local dev, 404) — returns [] so callers can always
 * `.includes(channel)` without guarding. Returns a string[] of channel slugs.
 */
export async function fetchDemos() {
  try {
    const r = await fetch(DEMOS_MANIFEST_URL);
    if (!r.ok) return [];
    const list = await r.json();
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Fetch + normalize the live updates.json into the canonical shape used by the UI:
 *   { meta:{nick,server,bootTime}, projects:[{name,channel,description,tag,links[],heat}], entries:[{ch,date,cat,nick,text,project?}] }
 *
 * The real /updates.json carries a different shape — see README — so we map here.
 *  - entry.category → cat
 *  - entry.project (slug) → ch (via project.slug or project.channel match)
 *  - entry.text || entry.summary → text
 *  - project.heat is computed from last-30d entry count, normalized 0..1
 *  - project.tag, project.links don't exist live — we synthesize: tag = "" (dropped chip), links = [project.url]
 */
export async function fetchData() {
  // Single error boundary around fetch + the full normalization pipeline. A
  // network/parse failure OR a structural error while normalizing (e.g. a null
  // element in entries making e.project throw, a non-array field) both degrade to
  // the same empty fallback instead of escaping as an unhandled rejection — main.js
  // awaits this without a catch, so an escape would silently stall the app shell.
  try {
    const raw = await fetch(SOURCE_URL).then((r) => r.json());

    const rawProjects = Array.isArray(raw.projects) ? raw.projects : [];
    const rawEntries = Array.isArray(raw.entries) ? raw.entries : [];

    // slug → channel lookup (entries reference by slug, channels are by `channel`)
    const slugToChannel = new Map();
    for (const p of rawProjects) {
      const slug = (p.slug || p.channel || '').toLowerCase();
      if (slug) slugToChannel.set(slug, p.channel);
    }

    // last-30d counts for heat, and per-project most-recent activity timestamp
    // for the sidebar's recency sort.
    const now = Date.now();
    const cutoff = now - 30 * 86400000;
    const counts = new Map();
    const lastActivity = new Map();
    for (const e of rawEntries) {
      if (!e.project) continue;
      if (e.category !== 'log' && e.category !== 'feature') continue;
      const t = Date.parse(e.date);
      if (!Number.isFinite(t)) continue;
      const slug = e.project.toLowerCase();
      if (t >= cutoff) counts.set(slug, (counts.get(slug) || 0) + 1);
      if (t > (lastActivity.get(slug) || 0)) lastActivity.set(slug, t);
    }
    // Reduce instead of spreading into Math.max: a large map would exceed the
    // engine's argument-count limit (~65k) and throw. Floor of 1 matches the
    // prior Math.max(1, …), which also yielded 1 for an empty map.
    let maxCount = 1;
    for (const c of counts.values()) if (c > maxCount) maxCount = c;

    const projects = rawProjects.map((p) => {
      const slug = (p.slug || p.channel || '').toLowerCase();
      const heat = Math.min(1, (counts.get(slug) || 0) / maxCount);
      const links = [];
      if (p.url) {
        try {
          const host = new URL(p.url).host.replace(/^www\./, '');
          links.push({ label: host, href: p.url });
        } catch {
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

    const entries = rawEntries
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

    // #activity gets *all* log entries (cross-project firehose), regardless of channel routing above.
    // To avoid duplicating, we mark entries with `ch` of the project, then the activity feed pulls
    // separately. See entriesFor() below.

    return {
      meta: {
        nick: 'mase',
        server: 'irc.mase.fi',
        bootTime: Date.now(),
      },
      projects,
      entries,
    };
  } catch {
    return {
      meta: { nick: 'mase', server: 'irc.mase.fi', bootTime: Date.now() },
      projects: [],
      entries: [],
    };
  }
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

/** Pick a nick for an entry based on category — daily/feature = mase, log = git. */
function pickNick(e) {
  if (e.category === 'log') return 'git';
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
 * Total commit count across the dataset (used in #home pinned stats).
 */
export function totalLogCount(data) {
  return data.entries.filter((e) => e.cat === 'log').length;
}

/**
 * Last-N-day commit buckets for the #home heatstrip.
 * Returns an array of N integers (oldest first), one per day, counting `log` entries.
 */
export function dailyLogBuckets(data, days = 28) {
  const out = new Array(days).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = today.getTime() - (days - 1) * 86400000;
  for (const e of data.entries) {
    if (e.cat !== 'log') continue;
    const t = Date.parse(e.date);
    if (!Number.isFinite(t)) continue;
    const idx = Math.floor((t - start) / 86400000);
    if (idx >= 0 && idx < days) out[idx]++;
  }
  return out;
}

/**
 * Last commit info — returns { date, project } of the newest log entry, or null.
 */
export function lastLog(data) {
  let best = null;
  for (const e of data.entries) {
    if (e.cat !== 'log') continue;
    if (!best || e.date > best.date) best = e;
  }
  return best;
}

/**
 * Single-pass log aggregate for the #home pinned card. Walks data.entries once
 * and returns everything totalLogCount + dailyLogBuckets + lastLog produced
 * separately, byte-for-byte identical to calling all three:
 *   - totalCommits: count of every `log` entry
 *   - buckets:      last-`days` per-day counts (finite, in-range dates only)
 *   - last:         newest `log` entry by date string, or null
 * The finite-date guard is a nested branch (not `continue`) so a malformed date
 * still counts toward totalCommits and the lastLog comparison.
 */
export function homeLogStats(data, days = 28) {
  const buckets = new Array(days).fill(0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = today.getTime() - (days - 1) * 86400000;
  let totalCommits = 0;
  let last = null;
  for (const e of data.entries) {
    if (e.cat !== 'log') continue;
    totalCommits++;
    const t = Date.parse(e.date);
    if (Number.isFinite(t)) {
      const idx = Math.floor((t - start) / 86400000);
      if (idx >= 0 && idx < days) buckets[idx]++;
    }
    if (!last || e.date > last.date) last = e;
  }
  return { totalCommits, buckets, last };
}

