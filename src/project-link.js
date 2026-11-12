// Turn a project.url into a single {label, href} or null (scheme-safe)
/** @import { ProjectLink } from './types.js' */
import { sameOriginPath } from './same-origin.js';

// Origin used to resolve schemeless project URLs. Browser: the page origin.
// Node tests (no `location`): mase.fi, the only origin this module ships for.
function pageOrigin() {
  return globalThis.location?.origin || 'https://mase.fi';
}

// Hosts whose path is the page, so the hostname alone cannot tell two apps apart.
const OWN_HOSTS = new Set(['mase.fi', 'db.mase.fi']);

// A foreign host stays the hostname (www. stripped). On our own hosts the last
// path segment is the label — Forge, Pulse and Wiki all live on db.mase.fi —
// and a trailing .html is the file, not the name. No path falls back to the host.
/** @param {URL} url @returns {string} */
function linkLabel(url) {
  const host = url.host.replace(/^www\./, '');
  if (!OWN_HOSTS.has(host)) return host;
  const last = url.pathname.split('/').filter(Boolean).pop();
  if (!last) return host;
  return last.replace(/\.html$/, '');
}

// Absolute http(s) keep their href (external GitHub / live deploys).
// `new URL()` without a base throws on schemeless paths AND on scheme-relative
// forms (`//host`, `\\host`, `/\host`); those are resolved against pageOrigin
// and kept only when the result stays on this origin. javascript:/data:/vbscript:
// parse without throwing and are dropped for not being http(s).
/**
 * @param {unknown} url
 * @returns {ProjectLink | null}
 */
export function projectLink(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  try {
    const abs = new URL(url);
    if (abs.protocol === 'http:' || abs.protocol === 'https:') {
      return { label: linkLabel(abs), href: url };
    }
    return null;
  } catch {
    const href = sameOriginPath(url, pageOrigin());
    return href ? { label: 'open', href } : null;
  }
}
