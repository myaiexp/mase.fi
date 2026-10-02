// Time-boxed fetch primitives shared by the data loaders and the 404 page

// A hung fetch with no AbortSignal stalls whatever awaits it — main.js awaits
// fetchData with no timeout of its own — so every loader goes through this cap.
export const FETCH_TIMEOUT_MS = 8000;

/**
 * fetch(url, init) aborted after `timeoutMs`. `read` runs on the Response inside
 * the time box, so a body that stalls mid-stream is cut off too; the default
 * returns the Response as-is. Rejects on network error or timeout.
 * A plain setTimeout rather than AbortSignal.timeout: the latter runs on
 * engine-internal timers that test fake timers cannot advance.
 */
export async function fetchWithTimeout(url, init = {}, timeoutMs = FETCH_TIMEOUT_MS, read = (r) => r) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(new DOMException(`${url} timed out`, 'TimeoutError')), timeoutMs);
  try {
    return await read(await fetch(url, { ...init, signal: ctl.signal }));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * GET `url` and parse the body as JSON. Rejects on network error, timeout, a
 * non-2xx status, or an unparseable body. The status check matters: a 4xx/5xx
 * with a JSON error body (e.g. from a reverse proxy) would otherwise parse as
 * data and degrade silently instead of reaching the caller's failure path.
 */
export function fetchJson(url, timeoutMs = FETCH_TIMEOUT_MS) {
  return fetchWithTimeout(url, {}, timeoutMs, (r) => {
    if (!r.ok) throw new Error(`${url} HTTP ${r.status}`);
    return r.json();
  });
}
