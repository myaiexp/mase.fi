// Raw updates.json entry → UI entry shape, shared by the hot and archive loaders
/** @import { Entry, Project, RawEntry, RawProject } from './types.js' */
import { normalizeDate } from './dates.js';

// Row guards for raw updates.json data: a row that fails one is skipped, so one
// bad row written by a script cannot throw inside normalization and empty the
// whole feed. An entry's project is optional but must be a string when present.
/** @param {unknown} e @returns {e is RawEntry} */
export function isRawEntry(e) {
  return !!e && typeof e === 'object' && (!('project' in e) || e.project == null || typeof e.project === 'string');
}

// A project without a string channel has nowhere to render, so it is skipped too.
/** @param {unknown} p @returns {p is RawProject} */
export function isRawProject(p) {
  return !!p && typeof p === 'object' && 'channel' in p && typeof p.channel === 'string';
}

/**
 * A project's routing slug: a non-empty string `slug`, otherwise `channel`,
 * lowercased. Entries reference a project by this value, matched
 * case-insensitively.
 * @param {Pick<RawProject, 'slug' | 'channel'>} p
 * @returns {string}
 */
export function projectSlug(p) {
  // A truthy non-string slug (1, true) must not win `||`: the typeof check
  // would then return '' and buildSlugToChannel would drop the project, so
  // its entries miss the channel and fall through to the category route.
  const slug = typeof p.slug === 'string' ? p.slug : '';
  const raw = slug || p.channel;
  return typeof raw === 'string' ? raw.toLowerCase() : '';
}

/**
 * An entry's project slug: its raw `project` string lowercased, '' when absent.
 * The entry-side half of the match projectSlug sets up — normalizeEntry and the
 * archive-count keys (commitsForProject) both resolve through it.
 * @param {string | null | undefined} project
 * @returns {string}
 */
export function entrySlug(project) {
  return (project || '').toLowerCase();
}

/** Build the entry-slug → channel lookup over (raw or normalized) projects.
 *  The slug is the primary key. When channel differs, it is a second key,
 *  unless some project's slug already owns that string — the slug owner wins
 *  and the alias is skipped rather than stealing the other channel.
 *  @param {Pick<RawProject, 'slug' | 'channel'>[] | null | undefined} projects
 *  @returns {Map<string, string>} */
export function buildSlugToChannel(projects) {
  /** @type {Map<string, string>} */
  const slugToChannel = new Map();
  const list = projects || [];
  for (const p of list) {
    const slug = projectSlug(p);
    if (slug) slugToChannel.set(slug, p.channel);
  }
  for (const p of list) {
    const channelKey = typeof p.channel === 'string' ? p.channel.toLowerCase() : '';
    if (channelKey && !slugToChannel.has(channelKey)) {
      slugToChannel.set(channelKey, p.channel);
    }
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
 * @param {string | undefined} category
 * @param {string | undefined} slug
 * @returns {string}
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
 * @param {RawEntry} e
 * @param {Map<string, string>} slugToChannel
 * @returns {Entry | null}
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
