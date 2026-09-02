// Lazy-load archived log entries into an already-normalized data object
import { normalizeDate } from './dates.js';

const ARCHIVE_URL = '/updates-archive.json';
const FETCH_TIMEOUT_MS = 8000;

function slugToChannel(projects) {
  const map = new Map();
  for (const p of projects || []) {
    const slug = (p.slug || p.channel || '').toLowerCase();
    if (slug) map.set(slug, p.channel);
  }
  return map;
}

function normalizeArchivedLogs(rawEntries, map) {
  const out = [];
  for (const e of rawEntries) {
    const cat = e.category || e.cat;
    if (cat !== 'log') continue;
    const slug = (e.project || '').toLowerCase();
    const mappedChannel = map.get(slug);
    out.push({
      ch: mappedChannel || 'activity',
      cat: 'log',
      date: normalizeDate(e.date),
      nick: 'git',
      text: e.text || e.summary || '',
      project: slug || undefined,
      mappedChannel,
      sticky: !!e.sticky,
    });
  }
  return out;
}

/**
 * Fetch /updates-archive.json and merge its logs into data.entries in place.
 * No-op when there is no archive or it was already merged. On fetch failure
 * marks archiveLoaded so the sentinel does not retry forever.
 */
export async function loadArchive(data) {
  if (!data?.hasArchive || data.archiveLoaded) return data;
  data.archiveLoaded = true;
  try {
    const raw = await fetch(ARCHIVE_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }).then((r) => {
      if (!r.ok) throw new Error('updates-archive.json HTTP ' + r.status);
      return r.json();
    });
    const rawEntries = Array.isArray(raw.entries) ? raw.entries : [];
    const archived = normalizeArchivedLogs(rawEntries, slugToChannel(data.projects));
    const seen = new Set(data.entries.map((e) => `${e.date}\0${e.project || ''}\0${e.text}`));
    const extra = archived.filter((e) => !seen.has(`${e.date}\0${e.project || ''}\0${e.text}`));
    if (extra.length) {
      data.entries = data.entries.concat(extra).sort((a, b) => a.date.localeCompare(b.date));
    }
  } catch {
    // Hot feed stays; the caller drops the sentinel.
  }
  return data;
}
