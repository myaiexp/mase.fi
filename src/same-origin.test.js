// Tests for sameOriginPath: the origin rule behind the 404 preview, its parent
// probes, and schemeless project links.
import { describe, it, expect } from 'vitest';
import { sameOriginPath } from './same-origin.js';

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
  it('returns null instead of throwing on an unparseable URL or origin', () => {
    expect(sameOriginPath('http://[', ORIGIN)).toBeNull();
    expect(sameOriginPath('/explorer', 'not a url')).toBeNull();
  });
});
