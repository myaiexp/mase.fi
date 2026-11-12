// Shared fixtures for the data adapter tests: normalized entries, fetch stubs
import { vi } from 'vitest';

/** @import { AppData, Entry, Project, Stats } from './types.js' */
/** @typedef {Omit<Partial<AppData>, 'projects' | 'entries' | 'stats'> & { projects?: Partial<Project>[], entries?: Partial<Entry>[], stats?: Stats }} AppDataInit */

// A normalized entry as produced by fetchData(): { channel, category, date, nick, text, projectSlug? }.
/**
 * @param {string} category
 * @param {string} channel
 * @param {Partial<Entry>} [extra]
 * @returns {Entry}
 */
export function entry(category, channel, extra = {}) {
  return {
    channel,
    category,
    date: '2026-01-01T00:00',
    nick: category === 'log' ? 'git' : 'mase',
    text: 't',
    projectSlug: undefined,
    projectChannel: undefined,
    ...extra,
  };
}

/**
 * A full AppData with defaults, so a test names only the fields it cares about.
 * @param {AppDataInit} [init]
 * @returns {AppData}
 */
export function appData(init = {}) {
  return /** @type {AppData} */ ({
    meta: { server: 'mase.fi', bootTime: 0 },
    projects: [],
    entries: [],
    demos: [],
    stats: {},
    hasArchive: false,
    archiveLoaded: false,
    loadFailed: false,
    archiveFailed: false,
    ...init,
  });
}

/** @param {Partial<Project>} p @returns {Project} */
export function project(p) {
  return { name: undefined, channel: '', slug: '', description: '', links: [], heat: 0, lastActivity: 0, ...p };
}

/** @param {unknown} payload */
export function stubFetch(payload) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
}
