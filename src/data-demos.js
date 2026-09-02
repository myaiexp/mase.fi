// Optional demos-manifest fetch for "try demo" chips
const DEMOS_MANIFEST_URL = '/demos/manifest.json';
const FETCH_TIMEOUT_MS = 8000;
export const DEMOS_GRACE_MS = 400;

export async function raceTimeout(promise, ms, fallback) {
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
 */
export async function fetchDemos() {
  try {
    const r = await fetch(DEMOS_MANIFEST_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!r.ok) return [];
    const list = await r.json();
    return Array.isArray(list) ? list.filter((s) => typeof s === 'string') : [];
  } catch {
    return [];
  }
}
