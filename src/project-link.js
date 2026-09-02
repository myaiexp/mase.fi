// Turn a project.url into a single {label, href} or null (scheme-safe)

// Origin used to resolve schemeless project URLs. Browser: the page origin.
// Node tests (no `location`): mase.fi, the only origin this module ships for.
function pageOrigin() {
  return globalThis.location?.origin || 'https://mase.fi';
}

// Absolute http(s) keep their href (external GitHub / live deploys).
// `new URL()` without a base throws on schemeless paths AND on scheme-relative
// forms (`//host`, `\\host`, `/\host`); those are resolved against pageOrigin
// and kept only when the result stays on this origin. javascript:/data:/vbscript:
// parse without throwing and are dropped for not being http(s).
export function projectLink(url) {
  if (typeof url !== 'string' || url.length === 0) return null;
  try {
    const abs = new URL(url);
    if (abs.protocol === 'http:' || abs.protocol === 'https:') {
      return { label: abs.host.replace(/^www\./, ''), href: url };
    }
    return null;
  } catch {
    try {
      const origin = pageOrigin();
      const u = new URL(url, origin);
      if (u.origin !== new URL(origin).origin) return null;
      return { label: 'open', href: u.pathname + u.search };
    } catch {
      return null;
    }
  }
}
