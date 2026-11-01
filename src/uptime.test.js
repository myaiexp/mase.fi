// Unit tests for fakePing's range. formatUptime is pinned in tickers.test.js.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { fakePing } from './uptime.js';

afterEach(() => vi.restoreAllMocks());

describe('fakePing', () => {
  it('stays within 11–17ms at both ends of Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    random.mockReturnValue(0);
    expect(fakePing()).toBe(11);
    random.mockReturnValue(0.999999);
    expect(fakePing()).toBe(17);
  });
});
