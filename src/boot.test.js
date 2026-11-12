// @vitest-environment jsdom
// Unit tests for the boot gate and its stamp: shouldSkipBoot() decides whether the
// animation runs, __maseReplayBoot() clears the stamp so the reload shows it, and
// neither path may abort when localStorage throws (private mode / quota).
// runBoot()'s reveal is in boot-run.test.js.
import { describe, it, expect, vi } from 'vitest';
import { shouldSkipBoot, writeBootStamp, initReplayBoot } from './boot.js';
import { KEY, NOW, TTL_MS, freezeBootClock, throwOn, bootWindow } from './boot-test-helpers.js';

freezeBootClock();

const replayBoot = () => /** @type {() => void} */ (bootWindow.__maseReplayBoot)();

describe('shouldSkipBoot', () => {
  it('skips when no stamp is stored but prefersReducedMotion is true', () => {
    // No stored stamp → the TTL gate would otherwise show the boot, but
    // reduced-motion forces a skip.
    expect(shouldSkipBoot(true)).toBe(true);
  });

  it('does not write the TTL stamp (pure query, even on reduced-motion skip)', () => {
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(shouldSkipBoot(true)).toBe(true);
    expect(shouldSkipBoot(true)).toBe(true);
    // Stamp write lives at the caller (main.js) / runBoot, so evaluating the
    // gate twice cannot silently extend the TTL (finding #8830).
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('does NOT skip (shows boot) when no stamp is stored and motion is allowed', () => {
    expect(shouldSkipBoot(false)).toBe(false);
  });

  it('does not write a stamp on the show-boot path', () => {
    shouldSkipBoot(false);
    // Only runBoot()/the reduced-motion branch stamp; the show-boot decision
    // must leave storage untouched so runBoot can stamp on completion.
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('skips when a stamp is within the 7-day TTL', () => {
    // Stamped one hour ago → well inside the window.
    localStorage.setItem(KEY, String(NOW - 3600 * 1000));
    expect(shouldSkipBoot(false)).toBe(true);
  });

  it('does NOT skip when the stamp is older than the 7-day TTL', () => {
    // Stamped eight days ago → expired, boot should replay.
    localStorage.setItem(KEY, String(NOW - (TTL_MS + 24 * 3600 * 1000)));
    expect(shouldSkipBoot(false)).toBe(false);
  });

  it('treats an empty stored value as "no stamp" (shows boot)', () => {
    // "" is falsy → coerced to 0 via `|| 0`, same as a missing key.
    localStorage.setItem(KEY, '');
    expect(shouldSkipBoot(false)).toBe(false);
  });

  it('handles a malformed (non-numeric) stamp gracefully without throwing', () => {
    // Number('garbage') is NaN; NaN > TTL is false → ttlExpired=false → skip.
    // The point is it degrades to a boolean decision rather than throwing.
    localStorage.setItem(KEY, 'garbage');
    expect(() => shouldSkipBoot(false)).not.toThrow();
    expect(shouldSkipBoot(false)).toBe(true);
  });

  it('force-replays (shows boot) over a fresh stamp when MASE_FORCE_BOOT is set', () => {
    // A within-TTL stamp would normally skip, but the replay flag overrides it.
    localStorage.setItem(KEY, String(NOW - 3600 * 1000));
    bootWindow.MASE_FORCE_BOOT = true;
    expect(shouldSkipBoot(false)).toBe(false);
  });

  it('reduced-motion still wins over a force-replay request', () => {
    // forceReplay gets past the first gate, but reduced-motion then skips anyway.
    localStorage.setItem(KEY, String(NOW - 3600 * 1000));
    bootWindow.MASE_FORCE_BOOT = true;
    expect(shouldSkipBoot(true)).toBe(true);
  });
});

// ---- throwing storage (Safari private mode / QuotaExceeded / disabled) ----

describe('shouldSkipBoot with throwing storage', () => {
  it('treats a throwing getItem as "no stamp" (shows boot, does not throw)', () => {
    const spy = throwOn('getItem', new DOMException('Access is denied', 'SecurityError'));
    try {
      expect(() => shouldSkipBoot(false)).not.toThrow();
      expect(shouldSkipBoot(false)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('reduced-motion still skips when getItem throws', () => {
    const spy = throwOn('getItem', new DOMException('Access is denied', 'SecurityError'));
    try {
      expect(shouldSkipBoot(true)).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });

  it('reduced-motion still skips when setItem throws (query never writes)', () => {
    const spy = throwOn('setItem', new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    try {
      expect(() => shouldSkipBoot(true)).not.toThrow();
      expect(shouldSkipBoot(true)).toBe(true);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('writeBootStamp', () => {
  it('persists Date.now() under the boot stamp key', () => {
    writeBootStamp();
    expect(Number(localStorage.getItem(KEY))).toBe(NOW);
  });

  it('does not throw when setItem fails (stamp is best-effort)', () => {
    const spy = throwOn('setItem', new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    try {
      expect(() => writeBootStamp()).not.toThrow();
    } finally {
      spy.mockRestore();
    }
  });
});

describe('initReplayBoot', () => {
  it('clears the boot stamp before reloading', () => {
    localStorage.setItem(KEY, String(NOW));
    // Read at call time: a stamp still present when reload runs means a skipped boot.
    /** @type {(string | null)[]} */
    const stampAtReload = [];
    vi.stubGlobal('location', { reload: () => stampAtReload.push(localStorage.getItem(KEY)) });
    try {
      initReplayBoot();
      replayBoot();
      expect(stampAtReload).toEqual([null]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('does not throw when removeItem fails (reload is still attempted)', () => {
    const spy = throwOn('removeItem', new DOMException('Access is denied', 'SecurityError'));
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    try {
      initReplayBoot();
      expect(() => replayBoot()).not.toThrow();
      expect(reload).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

