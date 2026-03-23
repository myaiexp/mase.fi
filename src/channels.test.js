// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { parseHash } from './channels.js';

describe('route parsing', () => {
  it('extracts channelId from #/explorer', () => {
    expect(parseHash('#/explorer')).toBe('explorer');
  });

  it('extracts channelId from #/home', () => {
    expect(parseHash('#/home')).toBe('home');
  });

  it('extracts channelId from #/about', () => {
    expect(parseHash('#/about')).toBe('about');
  });

  it('extracts channelId from #/activity', () => {
    expect(parseHash('#/activity')).toBe('activity');
  });

  it('defaults to home for empty hash', () => {
    expect(parseHash('')).toBeNull();
    expect(parseHash(null)).toBeNull();
    expect(parseHash(undefined)).toBeNull();
  });

  it('defaults to home for bare # hash', () => {
    expect(parseHash('#')).toBeNull();
  });

  it('defaults to home for #/ with no id', () => {
    expect(parseHash('#/')).toBeNull();
  });

  it('defaults to home for invalid hash (no #/ prefix)', () => {
    expect(parseHash('#home')).toBeNull();
  });

  it('defaults to home for non-hash strings', () => {
    expect(parseHash('explorer')).toBeNull();
  });

  it('handles project channel ids with hyphens', () => {
    expect(parseHash('#/my-project')).toBe('my-project');
  });
});
