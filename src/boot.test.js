// @vitest-environment jsdom
// Unit tests for the boot gate and reveal: shouldSkipBoot() decides whether the
// animation runs, runBoot() must always unhide #app + fire mase:booted, and
// neither path may abort when localStorage throws (private mode / quota).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { shouldSkipBoot, writeBootStamp, runBoot, initReplayBoot } from './boot.js';

const KEY = 'mase.boot.last';
const TTL_MS = 7 * 24 * 3600 * 1000;
const NOW = new Date('2026-06-13T12:00:00Z').getTime();

// Freeze Date.now() so stamps stored relative to NOW land deterministically on
// either side of the TTL boundary regardless of real wall-clock during the run.
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
    window.MASE_FORCE_BOOT = true;
    expect(shouldSkipBoot(false)).toBe(false);
  });

  it('reduced-motion still wins over a force-replay request', () => {
    // forceReplay gets past the first gate, but reduced-motion then skips anyway.
    localStorage.setItem(KEY, String(NOW - 3600 * 1000));
    window.MASE_FORCE_BOOT = true;
    expect(shouldSkipBoot(true)).toBe(true);
  });
});

// ---- throwing storage (Safari private mode / QuotaExceeded / disabled) ----

function throwOn(method, error) {
  return vi.spyOn(localStorage, method).mockImplementation(() => {
    throw error;
  });
}

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

describe('runBoot finish', () => {
  function setupBootDom() {
    document.body.replaceChildren();
    const boot = document.createElement('div');
    boot.id = 'boot';
    const app = document.createElement('div');
    app.id = 'app';
    app.hidden = true;
    document.body.append(boot, app);
  }

  beforeEach(() => {
    setupBootDom();
  });

  it('click-skip writes the TTL stamp, unhides #app, and fires mase:booted', () => {
    const booted = vi.fn();
    window.addEventListener('mase:booted', booted);

    runBoot();
    document.getElementById('boot').click();

    expect(document.getElementById('app').hidden).toBe(false);
    expect(Number(localStorage.getItem(KEY))).toBe(NOW);

    vi.advanceTimersByTime(300);
    expect(booted).toHaveBeenCalledOnce();
    expect(document.getElementById('boot')).toBeNull();
  });

  it('unhides #app and fires mase:booted even when the TTL stamp cannot be persisted', () => {
    const spy = throwOn('setItem', new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
    const booted = vi.fn();
    window.addEventListener('mase:booted', booted);
    try {
      runBoot();
      document.getElementById('boot').click();

      expect(document.getElementById('app').hidden).toBe(false);

      vi.advanceTimersByTime(300);
      expect(booted).toHaveBeenCalledOnce();
      expect(document.getElementById('boot')).toBeNull();
    } finally {
      spy.mockRestore();
    }
  });

  // Drain line-render timers until #boot stops growing for longer than the
  // max inter-line delay (200ms) but shorter than the 400ms finish pause.
  // Leaves us in that pause — the window where a click used to race finish().
  function drainScript() {
    const boot = document.getElementById('boot');
    let prev = boot.childElementCount;
    let staleMs = 0;
    for (let t = 0; t < 5000; t += 10) {
      vi.advanceTimersByTime(10);
      const n = boot.childElementCount;
      if (n !== prev) {
        prev = n;
        staleMs = 0;
      } else {
        staleMs += 10;
        if (staleMs >= 250) return;
      }
    }
    throw new Error('boot script did not settle');
  }

  it('natural completion renders the script, reveals #app, and fires mase:booted once', () => {
    const booted = vi.fn();
    window.addEventListener('mase:booted', booted);

    runBoot();
    drainScript();

    const boot = document.getElementById('boot');
    expect(boot.querySelectorAll('.boot-ok').length).toBeGreaterThan(0);
    expect(boot.querySelector('.boot-warn').textContent).toBe('[ WARN ]');
    expect(boot.querySelectorAll('.boot-dim').length).toBeGreaterThan(0);
    expect(boot.querySelector('pre.boot-logo')).toBeTruthy();
    expect([...boot.querySelectorAll('.boot-dim')].some((el) =>
      el.textContent.includes('welcome, mase')
    )).toBe(true);
    expect(document.getElementById('app').hidden).toBe(true);

    vi.advanceTimersByTime(800);
    expect(document.getElementById('app').hidden).toBe(false);
    expect(document.getElementById('boot')).toBeNull();
    expect(booted).toHaveBeenCalledOnce();
    // Stamp is written at finish time, which is after ~1.6s of fake-timer
    // advances — not NOW. Presence + finiteness is the contract.
    const stamp = Number(localStorage.getItem(KEY));
    expect(Number.isFinite(stamp)).toBe(true);
    expect(stamp).toBeGreaterThan(NOW);

    // Keydown skip stays armed after natural completion unless finish() sets
    // done. A first keypress must not dispatch a second mase:booted.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    vi.advanceTimersByTime(300);
    expect(booted).toHaveBeenCalledOnce();
  });

  it('a click inside the final 400ms pause still fires mase:booted exactly once', () => {
    const booted = vi.fn();
    window.addEventListener('mase:booted', booted);

    runBoot();
    drainScript();
    expect(document.getElementById('app').hidden).toBe(true);

    document.getElementById('boot').click();
    expect(document.getElementById('app').hidden).toBe(false);

    // Drain the click's 300ms remove + the leftover natural-completion finish().
    vi.advanceTimersByTime(800);
    expect(booted).toHaveBeenCalledOnce();
    expect(document.getElementById('boot')).toBeNull();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));
    vi.advanceTimersByTime(300);
    expect(booted).toHaveBeenCalledOnce();
  });
});

describe('initReplayBoot', () => {
  it('does not throw when removeItem fails (reload is still attempted)', () => {
    const spy = throwOn('removeItem', new DOMException('Access is denied', 'SecurityError'));
    const reload = vi.fn();
    vi.stubGlobal('location', { reload });
    try {
      initReplayBoot();
      expect(() => window.__maseReplayBoot()).not.toThrow();
      expect(reload).toHaveBeenCalledOnce();
    } finally {
      spy.mockRestore();
      vi.unstubAllGlobals();
    }
  });
});

