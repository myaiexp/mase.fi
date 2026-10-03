// All-history entry and commit aggregates behind the pinned cards
import { dayOf, entryNow, parseEntryDate, utcDayStart } from './dates.js';
import { entrySlug } from './data-normalize.js';

/**
 * Single-pass aggregate for the pinned cards. Walks data.entries once:
 *   - counts:       entries per category. Non-log rows are never archived, so
 *                   the in-memory count is all of them; `log` is totalCommits
 *   - totalCommits: all-history `log` count (allHistoryLogs below)
 *   - totalEntries: the sum of counts
 *   - buckets:      last-`days` per-day log counts, oldest first (finite,
 *                   in-range dates only) — the #home heatstrip and the #activity rate
 *   - first / last: oldest / newest in-memory `log` entry by date string, or null
 *   - logRange:     all-history { from, to } log days, or null (logRange below)
 * Buckets are keyed by the entry stamp's calendar day (parseEntryDate → utcDayStart),
 * the day the feed's separators show, counted back from the writers' "today"
 * (entryNow) so an entry stamped on a Helsinki day that UTC has not reached yet
 * still lands in the last bucket. The finite-date guard is a nested branch (not
 * `continue`) so a malformed date still counts toward totalCommits and the
 * first/last comparison — only the day bucket needs a parseable date.
 */
export function logStats(data, days = 28) {
  const buckets = new Array(days).fill(0);
  const today = utcDayStart(new Date(entryNow()));
  const counts = {};
  let inMemoryLogs = 0;
  let first = null;
  let last = null;
  for (const e of data.entries) {
    if (e.category !== 'log') {
      counts[e.category] = (counts[e.category] || 0) + 1;
      continue;
    }
    inMemoryLogs++;
    const d = parseEntryDate(e.date);
    if (Number.isFinite(d.getTime())) {
      // Whole days between the entry and today; the index counts back from the
      // newest (last) bucket. Both ends snap to midnight on the UTC-labelled axis,
      // so the difference is an exact day count with no DST drift.
      const idx = days - 1 - Math.round((today - utcDayStart(d)) / 86400000);
      if (idx >= 0 && idx < days) buckets[idx]++;
    }
    if (!first || e.date < first.date) first = e;
    if (!last || e.date > last.date) last = e;
  }
  const totalCommits = allHistoryLogs(data, inMemoryLogs);
  counts.log = totalCommits;
  const totalEntries = Object.values(counts).reduce((a, b) => a + b, 0);
  return { counts, totalCommits, totalEntries, buckets, first, last, logRange: logRange(data, first, last) };
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

// All-history first → last log day. The compact-time logFirst/logLast cover the
// archive but go stale as deploys prepend logs, and memory holds only the hot
// window until the archive merges, so each end takes the wider of the two.
// YYYY-MM-DD strings order lexically.
function logRange(data, first, last) {
  const froms = [data.stats.logFirst, first && dayOf(first.date)].filter(Boolean);
  const tos = [data.stats.logLast, last && dayOf(last.date)].filter(Boolean);
  if (!froms.length || !tos.length) return null;
  return { from: froms.sort()[0], to: tos.sort().at(-1) };
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
