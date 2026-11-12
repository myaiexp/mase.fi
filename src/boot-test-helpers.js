// Shared setup for the boot test suites: stamp constants, a frozen clock, throwing storage
import { beforeEach, afterEach, vi } from 'vitest';
/** @import { BootWindow } from './boot.js' */

/** @type {BootWindow} */
export const bootWindow = window;

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
    delete bootWindow.MASE_FORCE_BOOT;
  });

  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
    delete bootWindow.MASE_FORCE_BOOT;
  });
}

// Throwing storage: Safari private mode, QuotaExceeded, storage disabled.
/**
 * @param {'getItem' | 'setItem' | 'removeItem'} method
 * @param {Error} error
 */
export function throwOn(method, error) {
  return vi.spyOn(localStorage, method).mockImplementation(() => {
    throw error;
  });
}

/**
 * Element by id; throws when missing (the test asserts it exists).
 * @param {string} id
 * @returns {HTMLElement}
 */
export function byId(id) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} is missing`);
  return node;
}
