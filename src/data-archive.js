// Lazy-load archived log entries into an already-normalized data object
import { buildSlugToChannel, normalizeEntry } from './data-normalize.js';
import { fetchJson } from './fetch-json.js';

const ARCHIVE_URL = '/updates-archive.json';

// One fetch per data object at a time: a re-render of #activity while a load is
// in flight joins it instead of starting a second fetch.
const inflight = new WeakMap();

const entryKey = (e) => `${e.date}\0${e.project || ''}\0${e.text}`;

// The archive holds only logs, but a stray non-log row must not merge — it would
// surface in #home or a project channel. Null rows are dropped so one bad row
// cannot fail the whole merge.
function normalizeArchivedLogs(rawEntries, slugToChannel) {
  return rawEntries
    .filter((e) => e && e.category === 'log')
    .map((e) => normalizeEntry(e, slugToChannel));
}

async function fetchAndMerge(data) {
  try {
    const raw = await fetchJson(ARCHIVE_URL);
    // A payload without an entries array is a failure, not an empty merge:
    // marking it loaded would drop stats.archivedLogs from the totals.
    if (!Array.isArray(raw?.entries)) throw new Error(ARCHIVE_URL + ' has no entries array');
    const archived = normalizeArchivedLogs(raw.entries, buildSlugToChannel(data.projects));
    const seen = new Set(data.entries.map(entryKey));
    const extra = archived.filter((e) => !seen.has(entryKey(e)));
    if (extra.length) {
      data.entries = data.entries.concat(extra).sort((a, b) => a.date.localeCompare(b.date));
    }
    data.archiveLoaded = true;
  } catch (err) {
    console.warn('loadArchive: failed to load ' + ARCHIVE_URL + '; totals stay on stats.archivedLogs', err);
  }
  return data;
}

/**
 * Fetch /updates-archive.json and merge its logs into data.entries in place.
 * Never rejects. data.archiveLoaded means "the archive rows are in data.entries":
 * it is set only after a successful merge, because logStats and pinnedActivity
 * read it to stop adding stats.archivedLogs to the in-memory count. A failed load
 * warns and leaves it false, so the all-history totals stay intact; whether to
 * try again is the caller's call (the feed asks once per render).
 * No-op when there is no archive or it was already merged.
 */
export function loadArchive(data) {
  if (!data?.hasArchive || data.archiveLoaded) return Promise.resolve(data);
  let pending = inflight.get(data);
  if (!pending) {
    pending = fetchAndMerge(data).finally(() => inflight.delete(data));
    inflight.set(data, pending);
  }
  return pending;
}
