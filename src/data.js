/** Data layer: project maps, channel lists, entry filtering. */

import { relativeDate } from './terminal.js';

/**
 * Build lookup: project.name (lowercase) -> project object.
 * @param {Array} projects
 * @returns {Map<string, object>}
 */
export function buildProjectMap(projects) {
  const map = new Map();
  for (const p of projects) {
    map.set(p.name.toLowerCase(), p);
  }
  return map;
}

/**
 * Get the most recent entry date for a project (by channel id).
 * Matches entry.project case-insensitively against project names.
 */
function getLastActivity(entries, project) {
  const name = project.name.toLowerCase();
  let latest = null;
  for (const e of entries) {
    if (e.project?.toLowerCase() === name) {
      if (!latest || e.date > latest) latest = e.date;
    }
  }
  return latest;
}

/**
 * Check if a project has a category=project entry within the last 14 days.
 */
function isNewProject(entries, project) {
  const name = project.name.toLowerCase();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 14);
  const cutoffISO = cutoff.toISOString().slice(0, 10);

  return entries.some(
    (e) =>
      e.category === 'project' &&
      e.project?.toLowerCase() === name &&
      e.date >= cutoffISO,
  );
}

/**
 * Get structured channel list for sidebar rendering.
 * @param {Array} entries
 * @param {Array} projects
 * @returns {Array<{group: string, channels: Array}>}
 */
export function getChannels(entries, projects) {
  const projectChannels = projects
    .map((p) => ({
      id: p.channel,
      label: `#${p.channel}`,
      lastActivity: getLastActivity(entries, p),
      isNew: isNewProject(entries, p),
    }))
    .sort((a, b) => {
      if (!a.lastActivity && !b.lastActivity) return 0;
      if (!a.lastActivity) return 1;
      if (!b.lastActivity) return -1;
      return b.lastActivity.localeCompare(a.lastActivity);
    });

  return [
    { group: 'home', channels: [{ id: 'home', label: '#home' }] },
    { group: 'projects', channels: projectChannels },
    {
      group: 'meta',
      channels: [
        { id: 'activity', label: '#activity' },
        { id: 'about', label: '#about' },
      ],
    },
  ];
}

/**
 * Get entries for a specific channel, sorted date ascending (oldest first).
 * @param {string} channelId
 * @param {Array} entries
 * @param {Array} projects
 * @returns {Array}
 */
export function getChannelEntries(channelId, entries, projects) {
  let filtered;

  if (channelId === 'home') {
    filtered = entries.filter((e) => e.category === 'daily');
  } else if (channelId === 'activity') {
    filtered = entries.filter((e) => e.category === 'log');
  } else if (channelId === 'about') {
    return [];
  } else {
    // Find the project by channel id
    const project = projects.find((p) => p.channel === channelId);
    if (!project) return [];

    const name = project.name.toLowerCase();
    filtered = entries.filter(
      (e) =>
        (e.category === 'feature' || e.category === 'project') &&
        e.project?.toLowerCase() === name,
    );
  }

  // Sort ascending (oldest first — chat order)
  return [...filtered].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Compute stats for #about channel.
 * @param {Array} entries
 * @param {Array} projects
 * @returns {{ projectCount: number, featuresThisMonth: number, lastDeploy: string }}
 */
export function getAboutStats(entries, projects) {
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const featuresThisMonth = entries.filter(
    (e) =>
      (e.category === 'feature' || e.category === 'project') &&
      e.date.startsWith(currentMonth),
  ).length;

  let latestDate = null;
  for (const e of entries) {
    if (!latestDate || e.date > latestDate) latestDate = e.date;
  }

  return {
    projectCount: projects.length,
    featuresThisMonth,
    lastDeploy: latestDate ? relativeDate(latestDate) : 'unknown',
  };
}
