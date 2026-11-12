// Shared fixtures for the channels routing tests: typed data builders, DOM skeleton, initChannels capture
import { vi } from 'vitest';
/** @import { AppData, Project } from './types.js' */

/**
 * A full Project from the few fields a test cares about.
 * @param {Partial<Project> & { channel: string }} p
 * @returns {Project}
 */
export function proj(p) {
  return { name: undefined, slug: p.channel, description: '', links: [], heat: 0.5, lastActivity: 0, ...p };
}

/**
 * A full AppData around the given projects.
 * @param {Project[]} [projects]
 * @param {Partial<AppData>} [extra]
 * @returns {AppData}
 */
export function appData(projects = [], extra = {}) {
  return {
    meta: { server: 'test', bootTime: 0 },
    projects,
    entries: [],
    demos: [],
    stats: {},
    hasArchive: false,
    archiveLoaded: false,
    loadFailed: false,
    archiveFailed: false,
    ...extra,
  };
}

/** The one-project data set the navigate-direct tests rely on (home/explorer/activity). */
export const seedData = () => appData([proj({ channel: 'explorer', description: 'explorer topic', heat: 0.7 })]);

/** navigate() writes directly to these DOM nodes; recreate them each test. */
export function setupDom() {
  document.body.replaceChildren();
  for (const id of ['pane', 'topic-hash', 'topic-text', 'topic-meta']) {
    const el = document.createElement('span');
    el.id = id;
    document.body.appendChild(el);
  }
}

/**
 * Element by id; throws when missing (the test asserts it exists).
 * @param {string} id
 * @returns {HTMLElement}
 */
export function byId(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} is missing`);
  return node;
}

/**
 * Call initChannels but capture (and discard) the hashchange handler instead of
 * registering it, so no real listener leaks across tests. Returns the handler.
 * @param {typeof import('./channels.js')} channels
 * @param {AppData} data
 * @returns {(() => void) | undefined}
 */
export function initCapturing(channels, data) {
  /** @type {(() => void) | undefined} */
  let handler;
  const spy = vi.spyOn(window, 'addEventListener').mockImplementation((type, fn) => {
    if (type === 'hashchange') handler = /** @type {() => void} */ (fn);
  });
  channels.initChannels(data);
  spy.mockRestore();
  return handler;
}
