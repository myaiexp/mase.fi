// Raw updates.json entry → UI entry shape, shared by the hot and archive loaders
import { normalizeDate } from './dates.js';

/**
 * Build the entry-slug → channel lookup. Entries reference a project by slug
 * (matched case-insensitively); channels are keyed by `channel`. A project's slug
 * defaults to its channel when not given explicitly.
 */
export function buildSlugToChannel(rawProjects) {
  const slugToChannel = new Map();
  for (const p of rawProjects || []) {
    const slug = (p.slug || p.channel || '').toLowerCase();
    if (slug) slugToChannel.set(slug, p.channel);
  }
  return slugToChannel;
}

/**
 * Pick a nick for an entry based on category.
 * - log → 'git' (commit firehose)
 * - anything else with a project → the project slug: #home reads as a
 *   per-project standup (each project "speaks" its own colour-coded line; nick
 *   colours are name-hashed), and a project channel's daily summaries and
 *   feature entries all speak as that project.
 * - project-less → 'mase'.
 */
export function pickNick(e) {
  if (e.category === 'log') return 'git';
  if (e.project) return String(e.project).toLowerCase();
  return 'mase';
}

/**
 * Normalize one raw entry into the UI shape: map category + project-slug →
 * channel (falling back to daily→home, log→activity), normalize the date, and
 * pick a nick. Returns null for an unroutable entry (no mapped project and no
 * category fallback). This is the only place the entry shape is built — the hot
 * path and the archive merge both call it, so archived rows can't drift.
 */
export function normalizeEntry(e, slugToChannel) {
  const slug = (e.project || '').toLowerCase();
  const mappedChannel = slugToChannel.get(slug);
  const ch = mappedChannel
    || (e.category === 'daily' ? 'home' : e.category === 'log' ? 'activity' : null);
  if (!ch) return null;
  return {
    ch,
    cat: e.category,
    date: normalizeDate(e.date),
    nick: pickNick(e),
    text: e.text || e.summary || '',
    project: slug || undefined,
    mappedChannel,
  };
}
