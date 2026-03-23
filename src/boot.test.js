// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { shouldSkipBoot } from './boot.js';

const STORAGE_KEY = 'mase-fi-boot-seen';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const SEVEN_DAYS_MS = 7 * ONE_DAY_MS;

// Minimal localStorage mock — jsdom's implementation may not expose .clear()
function makeStorageMock() {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i) => Object.keys(store)[i] ?? null,
  };
}

describe('shouldSkipBoot', () => {
  let storageMock;

  beforeEach(() => {
    storageMock = makeStorageMock();
    vi.stubGlobal('localStorage', storageMock);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('returns true when prefersReducedMotion', () => {
    expect(shouldSkipBoot(true)).toBe(true);
  });

  it('returns false with fresh localStorage (no entry)', () => {
    expect(shouldSkipBoot(false)).toBe(false);
  });

  it('returns true with recent boot-seen (1 hour ago)', () => {
    storageMock.setItem(STORAGE_KEY, String(Date.now() - 60 * 60 * 1000));
    expect(shouldSkipBoot(false)).toBe(true);
  });

  it('returns true with recent boot-seen (6 days ago)', () => {
    storageMock.setItem(STORAGE_KEY, String(Date.now() - 6 * ONE_DAY_MS));
    expect(shouldSkipBoot(false)).toBe(true);
  });

  it('returns false with expired boot-seen (>7 days)', () => {
    // Just over 7 days ago
    storageMock.setItem(STORAGE_KEY, String(Date.now() - SEVEN_DAYS_MS - 1000));
    expect(shouldSkipBoot(false)).toBe(false);
  });

  it('returns false with expired boot-seen (10 days ago)', () => {
    storageMock.setItem(STORAGE_KEY, String(Date.now() - 10 * ONE_DAY_MS));
    expect(shouldSkipBoot(false)).toBe(false);
  });

  it('returns false with malformed localStorage value', () => {
    storageMock.setItem(STORAGE_KEY, 'not-a-timestamp');
    expect(shouldSkipBoot(false)).toBe(false);
  });

  it('returns false when prefersReducedMotion is false and no stored entry', () => {
    expect(shouldSkipBoot(false)).toBe(false);
  });
});
