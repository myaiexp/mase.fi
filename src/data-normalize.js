// Raw updates.json entry → UI entry shape, shared by the hot and archive loaders
import { normalizeDate } from './dates.js';

// Row guards for raw updates.json data: a row that fails one is skipped, so one
// bad row written by a script cannot throw inside normalization and empty the
// whole feed. An entry's project is optional but must be a string when present.
export function isRawEntry(e) {
  return !!e && typeof e === 'object' && (e.project == null || typeof e.project === 'string');
}

// A project without a string channel has nowhere to render, so it is skipped too.
export function isRawProject(p) {
  return !!p && typeof p === 'object' && typeof p.channel === 'string';
}

/**
 * A project's routing slug: `slug`, falling back to `channel`, lowercased.
 * Entries reference a project by this value, matched case-insensitively.
 */
export function projectSlug(p) {
  const slug = p.slug || p.channel;
  return typeof slug === 'string' ? slug.toLowerCase() : '';
}

/**
 * An entry's project slug: its raw `project` string lowercased, '' when absent.
 * The entry-side half of the match projectSlug sets up — normalizeEntry and the
 * archive-count keys (commitsForProject) both resolve through it.
 */
export function entrySlug(project) {
  return (project || '').toLowerCase();
}

/** Build the entry-slug → channel lookup over (raw or normalized) projects. */
export function buildSlugToChannel(projects) {
  const slugToChannel = new Map();
  for (const p of projects || []) {
    const slug = projectSlug(p);
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
export function pickNick(category, slug) {
  if (category === 'log') return 'git';
  return slug || 'mase';
}

/**
 * Normalize one raw entry into the UI shape:
 *   - projectSlug:    the raw `project` lowercased (a string, not a project object)
 *   - projectChannel: the sidebar channel that slug maps to, or undefined — the
 *                     target of the feed's clickable #project chip
 *   - channel:        where the row routes — projectChannel, else the category
 *                     fallback (daily→home, log→activity)
 * plus the normalized date and a nick. Returns null for an unroutable entry (no
 * mapped project and no category fallback). This is the only place the entry
 * shape is built — the hot path and the archive merge both call it, so archived
 * rows can't drift.
 */
export function normalizeEntry(e, slugToChannel) {
  const slug = entrySlug(e.project);
  const projectChannel = slugToChannel.get(slug);
  const channel = projectChannel
    || (e.category === 'daily' ? 'home' : e.category === 'log' ? 'activity' : null);
  if (!channel) return null;
  return {
    channel,
    category: e.category,
    date: normalizeDate(e.date),
    nick: pickNick(e.category, slug),
    text: e.text || e.summary || '',
    projectSlug: slug || undefined,
    projectChannel,
  };
}
