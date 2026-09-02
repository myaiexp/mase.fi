// Pure matching logic for the smart 404 page: prefixes, junk guard, fuzzy routes
// The DOM/probe half lives in notfound-page.js; this file stays side-effect free
// so the ladder is unit-testable.

// Top-level webroot dirs that are real destinations but not showcase projects,
// so updates.json never lists them. Verify against /var/www/html when touching.
export const EXTRA_ROUTES = [
  { href: '/blog', label: 'blog', name: 'blog' },
  { href: '/demos', label: 'demos', name: 'demos' },
  { href: '/userscripts', label: 'userscripts', name: 'userscripts' },
  { href: '/chess', label: 'chess', name: 'chess' },
  { href: '/card-games', label: 'card-games', name: 'card games' },
];

const JUNK_MAX_LEN = 120;
const JUNK_PATTERNS = [/wp-/i, /\.php\b/i, /\.env\b/i, /%2f/i, /\.asp\b/i, /\.cgi\b/i];

// Longest-first parent paths deeper than root: '/a/b/c' -> ['/a/b', '/a'].
// The typed path itself is excluded (it just 404'd) and so is '/' (root always
// exists — that is the state-3 fallback, never a "confident match").
export function parentPrefixes(pathname, cap = 5) {
  const clean = String(pathname || '').split(/[?#]/)[0].replace(/\/+/g, '/').replace(/\/$/, '');
  const segs = clean.split('/').filter(Boolean);
  const out = [];
  for (let i = segs.length - 1; i >= 1 && out.length < cap; i--) {
    out.push('/' + segs.slice(0, i).join('/'));
  }
  return out;
}

// Scanner/junk traffic gets no matching effort: straight to state 3.
export function isJunkPath(pathname) {
  const p = String(pathname || '');
  if (p.length > JUNK_MAX_LEN) return true;
  return JUNK_PATTERNS.some((re) => re.test(p));
}

// Normalize updates.json projects into route entries the fuzzy rung scores.
// mase.fi-path urls become path routes; other hosts become subdomain routes
// (the "moved" case — typing the app's old mase.fi path should point at its
// new home). Bad/missing urls are skipped, never thrown on.
export function buildRoutes(updates) {
  const projects = Array.isArray(updates?.projects) ? updates.projects : [];
  const routes = [];
  for (const p of projects) {
    if (typeof p?.url !== 'string') continue;
    let u;
    try {
      u = new URL(p.url);
    } catch {
      continue;
    }
    // The trailing human label: a short desc reads better than restating the
    // route ("map explorer" vs "explorer"); long descs fall back to the name.
    const bare = (p.name || p.slug || '').toLowerCase();
    const name = (typeof p.desc === 'string' && p.desc.length > 0 && p.desc.length <= 48 ? p.desc : bare).toLowerCase();
    const keys = [p.slug, p.channel, bare].filter(Boolean).map((k) => String(k).toLowerCase());
    if (u.hostname === 'mase.fi' && u.pathname !== '/') {
      const seg = u.pathname.replace(/\/$/, '').split('/').filter(Boolean)[0];
      routes.push({ href: u.pathname, label: '/' + seg, name, keys: [...new Set([seg, ...keys])], kind: 'path' });
    } else if (u.hostname.endsWith('.mase.fi')) {
      const sub = u.hostname.slice(0, -'.mase.fi'.length);
      routes.push({ href: u.origin, label: u.hostname, name, keys: [...new Set([sub, ...keys])], kind: 'subdomain' });
    }
  }
  for (const r of EXTRA_ROUTES) {
    routes.push({ href: r.href, label: r.href, name: r.name, keys: [r.href.slice(1)], kind: 'path', extra: true });
  }
  return routes;
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Score the first typed segment against every route key. The cap scales with
// segment length — at least half the typed characters must survive — so a
// 3-char segment can be 1 off, an 8-char one up to 4.
export function fuzzyCandidates(pathname, routes) {
  const seg = String(pathname || '').split('/').filter(Boolean)[0]?.toLowerCase();
  if (!seg) return [];
  const maxD = Math.min(4, Math.floor(seg.length / 2));
  const scored = [];
  for (const r of routes) {
    let best = Infinity;
    for (const k of r.keys) best = Math.min(best, levenshtein(seg, k));
    if (best <= maxD) scored.push({ route: r, distance: best });
  }
  scored.sort((a, b) => a.distance - b.distance);
  return scored.slice(0, 3);
}

// The decision ladder. A surviving parent prefix always wins (confident, with
// diff rendering). A near-exact fuzzy hit (d ≤ 2) with a clear margin over the
// runner-up auto-redirects too; anything weaker renders as a pick-list.
export function decide({ prefixHit, candidates, path }) {
  if (prefixHit) {
    return { state: 'confident', target: prefixHit.href, targetLabel: prefixHit.label, targetName: prefixHit.name, tail: path.slice(prefixHit.href.length), diff: true };
  }
  const c = candidates || [];
  if (c.length) {
    const [best, runner] = c;
    const unique = !runner || runner.distance - best.distance >= 2;
    if (best.distance <= 2 && unique) {
      return {
        state: 'confident',
        target: best.route.href,
        targetLabel: best.route.label,
        targetName: best.route.kind === 'subdomain' ? best.route.name + ' — moved to a subdomain' : best.route.name,
        diff: false,
      };
    }
    return { state: 'fuzzy', candidates: c };
  }
  return { state: 'none' };
}

export function reasonFor(cand) {
  if (cand.route.kind === 'subdomain') return 'moved';
  if (cand.distance === 0) return 'exact';
  if (cand.distance === 1) return '1 char off';
  if (cand.distance === 2) return '2 chars off';
  return 'fuzzy';
}

// Resolve `raw` against `origin` and return pathname+search only when the
// result stays on that origin. Prefix-blacklisting `//` is not enough:
// WHATWG's relative-slash state treats `\` like `/`, so `/\evil.com` (and
// `//evil.com`, `\\evil.com`) parse as an off-origin URL. Empty/non-string
// input is rejected rather than collapsing to `/`.
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

// Navigation-sink guard for the 404 auto-redirect. Same-origin paths are
// fine; so are http(s) URLs on mase.fi / *.mase.fi (buildRoutes' "moved to
// a subdomain" targets). Everything else — scheme-relative, backslash,
// javascript:, foreign hosts, `mase.fi.evil.com` — is refused.
export function isSafeRedirect(target, origin) {
  if (typeof target !== 'string' || target.length === 0) return false;
  try {
    const base = new URL(origin);
    const u = new URL(target, origin);
    if (u.origin === base.origin) return true;
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return u.hostname === 'mase.fi' || u.hostname.endsWith('.mase.fi');
  } catch {
    return false;
  }
}
