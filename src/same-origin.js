// Same-origin URL check shared by project links and the 404 page

// Resolve `raw` against `origin` and return pathname+search only when the
// result stays on that origin. Prefix-blacklisting `//` is not enough:
// WHATWG's relative-slash state treats `\` like `/`, so `/\evil.com` (and
// `//evil.com`, `\\evil.com`) parse as an off-origin URL. Empty/non-string
// input is rejected rather than collapsing to `/`. Never throws.
export function sameOriginPath(raw, origin) {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  try {
    const base = new URL(origin);
    const u = new URL(raw, origin);
    if (u.origin !== base.origin) return null;
    return u.pathname + u.search;
  } catch {
    return null;
  }
}
