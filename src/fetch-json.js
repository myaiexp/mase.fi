// Time-boxed JSON fetch that rejects on non-2xx, shared by the data loaders

// A hung fetch with no AbortSignal stalls whatever awaits it — main.js awaits
// fetchData with no timeout of its own — so every loader goes through this cap.
export const FETCH_TIMEOUT_MS = 8000;

/**
 * GET `url` and parse the body as JSON. Rejects on network error, timeout, a
 * non-2xx status, or an unparseable body. The status check matters: a 4xx/5xx
 * with a JSON error body (e.g. from a reverse proxy) would otherwise parse as
 * data and degrade silently instead of reaching the caller's failure path.
 */
export async function fetchJson(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const r = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
  return r.json();
}
