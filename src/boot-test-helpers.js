// Shared setup for the boot test suites: stamp constants, a frozen clock, throwing storage
import { beforeEach, afterEach, vi } from 'vitest';

export const KEY = 'mase.boot.last';
export const TTL_MS = 7 * 24 * 3600 * 1000;
export const NOW = new Date('2026-06-13T12:00:00Z').getTime();

// Freeze Date.now() so stamps stored relative to NOW land deterministically on
// either side of the TTL boundary regardless of real wall-clock during the run.
export function freezeBootClock() {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    localStorage.clear();
    delete window.MASE_FORCE_BOOT;
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    delete window.MASE_FORCE_BOOT;
  });
}

// Throwing storage: Safari private mode, QuotaExceeded, storage disabled.
export function throwOn(method, error) {
  return vi.spyOn(localStorage, method).mockImplementation(() => {
    throw error;
  });
}
