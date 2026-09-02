// Tests for the smart-404 matching ladder (notfound.js)
import { describe, it, expect } from 'vitest';
import {
  parentPrefixes, isJunkPath, buildRoutes, levenshtein,
  fuzzyCandidates, decide, reasonFor, EXTRA_ROUTES,
  sameOriginPath, isSafeRedirect,
} from './notfound.js';

// Shape mirrors the live /updates.json .projects entries.
const UPDATES = {
  projects: [
    { name: 'Explorer', slug: 'explorer', channel: 'explorer', url: 'https://mase.fi/explorer', desc: 'map explorer' },
    { name: 'Tulkkaus', slug: 'tulkki', channel: 'tulkkaussovellus', url: 'https://mase.fi/tulkki', desc: 'interpretation booking' },
    { name: 'Games', slug: 'games', channel: 'games', url: 'https://mase.fi/games', desc: 'browser games' },
    { name: 'Ruoka', slug: 'diet-app', channel: 'diet-app', url: 'https://diet.mase.fi', desc: 'meal planning' },
    { name: 'Central Hub', slug: 'central-hub', channel: 'central-hub', url: 'https://db.mase.fi', desc: 'app shell' },
    { name: 'Broken', slug: 'broken', channel: 'broken', url: 'not a url' },
    { name: 'NoUrl', slug: 'nourl', channel: 'nourl' },
  ],
};

describe('parentPrefixes', () => {
  it('yields parents longest-first, excluding the path itself and root', () => {
    expect(parentPrefixes('/explorer/operator')).toEqual(['/explorer']);
    expect(parentPrefixes('/a/b/c')).toEqual(['/a/b', '/a']);
  });
  it('handles trailing slashes, duplicate slashes and query strings', () => {
    expect(parentPrefixes('/a//b/')).toEqual(['/a']);
    expect(parentPrefixes('/a/b?x=1')).toEqual(['/a']);
  });
  it('returns nothing for root-level paths', () => {
    expect(parentPrefixes('/nonsense')).toEqual([]);
    expect(parentPrefixes('/')).toEqual([]);
    expect(parentPrefixes('')).toEqual([]);
  });
  it('caps the number of probes', () => {
    expect(parentPrefixes('/a/b/c/d/e/f/g/h', 3)).toHaveLength(3);
  });
});

describe('isJunkPath', () => {
  it('flags scanner patterns and oversized paths', () => {
    expect(isJunkPath('/wp-admin/setup.php')).toBe(true);
    expect(isJunkPath('/.env')).toBe(true);
    expect(isJunkPath('/x' + 'a'.repeat(130))).toBe(true);
    expect(isJunkPath('/a%2Fb')).toBe(true);
  });
  it('passes ordinary wrong paths', () => {
    expect(isJunkPath('/explorer/operator')).toBe(false);
    expect(isJunkPath('/exploer')).toBe(false);
  });
});

describe('buildRoutes', () => {
  const routes = buildRoutes(UPDATES);
  it('turns mase.fi urls into path routes and subdomains into moved routes', () => {
    const explorer = routes.find((r) => r.href === '/explorer');
    expect(explorer).toMatchObject({ label: '/explorer', kind: 'path' });
    const diet = routes.find((r) => r.label === 'diet.mase.fi');
    expect(diet).toMatchObject({ href: 'https://diet.mase.fi', kind: 'subdomain' });
    expect(diet.keys).toContain('diet');
  });
  it('skips entries with missing or unparsable urls', () => {
    expect(routes.some((r) => r.name === 'broken' || r.name === 'nourl')).toBe(false);
  });
  it('appends the extra webroot routes and survives junk input', () => {
    expect(routes.some((r) => r.href === '/blog')).toBe(true);
    expect(buildRoutes(null)).toEqual(EXTRA_ROUTES.map((r) => expect.objectContaining({ href: r.href })));
  });
});

describe('levenshtein', () => {
  it('measures edit distance', () => {
    expect(levenshtein('exploer', 'explorer')).toBe(1);
    expect(levenshtein('tulki', 'tulkki')).toBe(1);
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('same', 'same')).toBe(0);
  });
});

describe('fuzzyCandidates', () => {
  const routes = buildRoutes(UPDATES);
  it('finds close typos', () => {
    const c = fuzzyCandidates('/exploer', routes);
    expect(c[0].route.href).toBe('/explorer');
    expect(c[0].distance).toBe(1);
  });
  it('matches moved apps by subdomain label', () => {
    const c = fuzzyCandidates('/diet', routes);
    expect(c[0].route.kind).toBe('subdomain');
    expect(c[0].distance).toBe(0);
  });
  it('scales the distance cap with segment length', () => {
    expect(fuzzyCandidates('/x', routes)).toEqual([]);
    expect(fuzzyCandidates('/zzzzzz', routes)).toEqual([]);
  });
  it('caps at three candidates', () => {
    expect(fuzzyCandidates('/games', routes).length).toBeLessThanOrEqual(3);
  });
});

describe('decide', () => {
  const routes = buildRoutes(UPDATES);
  it('prefix hit wins and renders as a diff', () => {
    const d = decide({
      prefixHit: { href: '/explorer', label: '/explorer', name: 'explorer' },
      candidates: [],
      path: '/explorer/operator',
    });
    expect(d).toMatchObject({ state: 'confident', target: '/explorer', tail: '/operator', diff: true });
  });
  it('near-exact unique fuzzy hit is confident without a diff', () => {
    const d = decide({ prefixHit: null, candidates: fuzzyCandidates('/exploer', routes), path: '/exploer' });
    expect(d).toMatchObject({ state: 'confident', target: '/explorer', diff: false });
  });
  it('moved app resolves confidently to its subdomain', () => {
    const d = decide({ prefixHit: null, candidates: fuzzyCandidates('/diet', routes), path: '/diet' });
    expect(d.state).toBe('confident');
    expect(d.target).toBe('https://diet.mase.fi');
    expect(d.targetName).toMatch(/moved/);
  });
  it('ambiguous candidates render as a pick-list', () => {
    const close = [
      { route: { href: '/a', label: '/a', name: 'a', kind: 'path' }, distance: 2 },
      { route: { href: '/b', label: '/b', name: 'b', kind: 'path' }, distance: 2 },
    ];
    expect(decide({ prefixHit: null, candidates: close, path: '/ab' }).state).toBe('fuzzy');
  });
  it('weak matches render as a pick-list, no auto-redirect', () => {
    const weak = [{ route: { href: '/a', label: '/a', name: 'a', kind: 'path' }, distance: 3 }];
    expect(decide({ prefixHit: null, candidates: weak, path: '/abcdefgh' }).state).toBe('fuzzy');
  });
  it('nothing matches -> state none', () => {
    expect(decide({ prefixHit: null, candidates: [], path: '/qqq' }).state).toBe('none');
  });
});

describe('reasonFor', () => {
  it('labels candidates for the pick-list', () => {
    expect(reasonFor({ route: { kind: 'subdomain' }, distance: 0 })).toBe('moved');
    expect(reasonFor({ route: { kind: 'path' }, distance: 1 })).toBe('1 char off');
    expect(reasonFor({ route: { kind: 'path' }, distance: 3 })).toBe('fuzzy');
  });
});

// Origin check for the 404 preview `?p=` parameter and the auto-redirect sink.
// Prefix-blacklisting `//` is not enough: WHATWG treats `\` like `/` in the
// relative-slash state, so `/\evil.com` resolves off-origin.
const ORIGIN = 'https://mase.fi';

describe('sameOriginPath', () => {
  it('keeps a same-origin path (and its query)', () => {
    expect(sameOriginPath('/explorer', ORIGIN)).toBe('/explorer');
    expect(sameOriginPath('/explorer?x=1', ORIGIN)).toBe('/explorer?x=1');
    expect(sameOriginPath('/', ORIGIN)).toBe('/');
  });
  it('rejects scheme-relative and backslash forms that leave the origin', () => {
    expect(sameOriginPath('//evil.com', ORIGIN)).toBeNull();
    expect(sameOriginPath('//evil.com/x', ORIGIN)).toBeNull();
    expect(sameOriginPath('/\\evil.com', ORIGIN)).toBeNull();
    expect(sameOriginPath('/\\evil.com/x', ORIGIN)).toBeNull();
    expect(sameOriginPath('\\\\evil.com', ORIGIN)).toBeNull();
  });
  it('rejects absolute off-origin URLs and empty/non-string input', () => {
    expect(sameOriginPath('https://evil.com/x', ORIGIN)).toBeNull();
    expect(sameOriginPath('javascript:alert(1)', ORIGIN)).toBeNull();
    expect(sameOriginPath('', ORIGIN)).toBeNull();
    expect(sameOriginPath(null, ORIGIN)).toBeNull();
  });
  it('collapses an absolute same-origin URL to its path', () => {
    expect(sameOriginPath('https://mase.fi/explorer', ORIGIN)).toBe('/explorer');
  });
});

describe('isSafeRedirect', () => {
  it('allows same-origin paths and known mase.fi hosts (moved-app routes)', () => {
    expect(isSafeRedirect('/explorer', ORIGIN)).toBe(true);
    expect(isSafeRedirect('https://mase.fi/explorer', ORIGIN)).toBe(true);
    expect(isSafeRedirect('https://diet.mase.fi', ORIGIN)).toBe(true);
    expect(isSafeRedirect('http://diet.mase.fi', ORIGIN)).toBe(true);
  });
  it('refuses scheme-relative, backslash, and foreign-host targets', () => {
    expect(isSafeRedirect('//evil.com', ORIGIN)).toBe(false);
    expect(isSafeRedirect('/\\evil.com', ORIGIN)).toBe(false);
    expect(isSafeRedirect('https://evil.com/x', ORIGIN)).toBe(false);
    expect(isSafeRedirect('https://mase.fi.evil.com', ORIGIN)).toBe(false);
    expect(isSafeRedirect('javascript:alert(1)', ORIGIN)).toBe(false);
    expect(isSafeRedirect('', ORIGIN)).toBe(false);
  });
});
