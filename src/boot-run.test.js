// @vitest-environment jsdom
// Unit tests for the boot animation's reveal: runBoot() must always unhide #app
// and fire mase:booted exactly once, whichever way it ends (click, key, natural
// completion), and a keypress must only count once the 400ms debounce has passed.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { runBoot } from './boot.js';
import { KEY, NOW, freezeBootClock, throwOn } from './boot-test-helpers.js';

freezeBootClock();

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

  const pressKey = () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'x' }));

  it('ignores a keypress during the 400ms debounce', () => {
    runBoot();
    vi.advanceTimersByTime(399);
    pressKey();

    expect(document.getElementById('app').hidden).toBe(true);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('a keypress after the debounce skips: stamp, reveal, one mase:booted', () => {
    const booted = vi.fn();
    window.addEventListener('mase:booted', booted);

    runBoot();
    vi.advanceTimersByTime(400);
    pressKey();

    expect(document.getElementById('app').hidden).toBe(false);
    // The fake clock advanced with the timers, so the stamp is finish() time.
    expect(Number(localStorage.getItem(KEY))).toBe(NOW + 400);

    pressKey();
    vi.advanceTimersByTime(300);
    expect(booted).toHaveBeenCalledOnce();
    expect(document.getElementById('boot')).toBeNull();
  });
});
