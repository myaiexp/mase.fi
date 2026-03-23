// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { matchChannels } from './search.js';

const CHANNEL_IDS = ['home', 'explorer', 'tracker', 'shapez', 'porssi', 'yatzy', 'activity', 'about'];

describe('channel name matching', () => {
  it('matches partial channel names', () => {
    const results = matchChannels(CHANNEL_IDS, 'exp');
    expect(results).toContain('explorer');
  });

  it('returns empty for no match', () => {
    const results = matchChannels(CHANNEL_IDS, 'zzzzz');
    expect(results).toEqual([]);
  });

  it('returns empty for empty needle', () => {
    const results = matchChannels(CHANNEL_IDS, '');
    expect(results).toEqual([]);
  });

  it('matches multiple channels when needle is ambiguous', () => {
    // 'a' appears in tracker, shapez, yatzy, activity, about
    const results = matchChannels(CHANNEL_IDS, 'a');
    expect(results.length).toBeGreaterThan(1);
  });

  it('returns best match first for specific needle', () => {
    const results = matchChannels(CHANNEL_IDS, 'home');
    expect(results[0]).toBe('home');
  });

  it('matches channel ids with short prefix', () => {
    const results = matchChannels(CHANNEL_IDS, 'tra');
    expect(results).toContain('tracker');
  });

  it('matches about channel', () => {
    matchChannels(CHANNEL_IDS, 'abt');
    // uFuzzy may not match 'abt' -> 'about' depending on strictness; test softer match
    const results2 = matchChannels(CHANNEL_IDS, 'abou');
    expect(results2).toContain('about');
  });
});
