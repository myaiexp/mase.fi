// Optional demos-manifest fetch for "try demo" chips
import { fetchJson } from './fetch-json.js';

const DEMOS_MANIFEST_URL = '/demos/manifest.json';
export const DEMOS_GRACE_MS = 400;

/**
 * @template T, F
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {F} fallback
 * @returns {Promise<T | F>}
 */
export async function raceTimeout(promise, ms, fallback) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch the list of project channels that have a published demo, from the demos
 * repo's manifest (written by its post-deploy from synced-dirs.txt). Tolerant of
 * absence (no demos dir, local dev, 404) — returns [] so callers can always
 * `.includes(channel)` without guarding. Returns a string[] of channel slugs.
 * @returns {Promise<string[]>}
 */
export async function fetchDemos() {
  try {
    const list = await fetchJson(DEMOS_MANIFEST_URL);
    return Array.isArray(list) ? list.filter((/** @type {unknown} */ s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
