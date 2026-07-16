// @vitest-environment jsdom
// Unit tests for playJitter(rowEls) — the modem-decode arrival animation.
// Pins the accessibility guard: when prefers-reduced-motion is set, playJitter()
// early-exits with zero side effects (no classes, no animationDelay, no DOM
// mutation, no timers). The contrasting motion-allowed case proves the animated
// path actually runs: it tags the row, schedules timers, scrambles the text
// mid-flight, then restores the original markup. jsdom has no matchMedia, so it
// is stubbed; fake timers drive the staggered scramble/restore setTimeouts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { playJitter, clearJitter } from './jitter.js';

// jsdom does not implement matchMedia; bare matchMedia(...) would ReferenceError.
function stubReducedMotion(matches) {
  vi.stubGlobal('matchMedia', (query) => ({ matches, media: query }));
}

// Build a feed row with the .msg / .nick children playJitter queries and mutates.
// Uses textContent (not innerHTML) for setup; for plain text the resulting
// .innerHTML is identical, and playJitter captures/restores via .innerHTML.
function makeRow(msgText, nickText) {
  const row = document.createElement('div');
  const msg = document.createElement('span');
  msg.className = 'msg';
  msg.textContent = msgText;
  const nick = document.createElement('span');
  nick.className = 'nick';
  nick.textContent = nickText;
  row.append(nick, msg);
  return { row, msg, nick };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  clearJitter();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('playJitter — prefers-reduced-motion early-exit', () => {
  it('applies no jitter: no classes, no animationDelay, no DOM mutation, no timers', () => {
    stubReducedMotion(true);
    const { row, msg, nick } = makeRow('hello world', 'mase');

    playJitter([{ row }]);

    // The guard returned before touching the row at all.
    expect(row.classList.contains('jitter')).toBe(false);
    expect(row.classList.contains('arriving')).toBe(false);
    expect(row.style.animationDelay).toBe('');
    expect(msg.textContent).toBe('hello world');
    expect(nick.textContent).toBe('mase');
    // No scramble/restore timers were scheduled.
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('playJitter — motion allowed', () => {
  it('tags the row, schedules timers, and sets the stagger delay', () => {
    stubReducedMotion(false);
    const { row } = makeRow('hello world', 'mase');

    playJitter([{ row }]);

    // Synchronous side effects of the animated path.
    expect(row.classList.contains('jitter')).toBe(true);
    expect(row.classList.contains('arriving')).toBe(true);
    expect(row.style.animationDelay).toBe('0ms'); // i === 0 → 0 * STAGGER_MS
    // Scramble frames + the final restore are queued on timers.
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it('scrambles the text mid-animation then restores the original', () => {
    stubReducedMotion(false);
    // Math.random === 0 → every char falls below the scramble probability, so
    // the frame text is guaranteed to differ from the (alphabetic) original.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { row, msg, nick } = makeRow('hello world', 'mase');

    playJitter([{ row }]);

    // First scramble frame fires at i*STAGGER_MS + 40 = 40ms (i === 0).
    vi.advanceTimersByTime(40);
    expect(msg.textContent).not.toBe('hello world');
    expect(nick.textContent).not.toBe('mase');

    // The restore timer fires at start + JITTER_MS = 40 + 320 = 360ms.
    vi.advanceTimersByTime(400);
    expect(msg.textContent).toBe('hello world');
    expect(nick.textContent).toBe('mase');
    expect(row.classList.contains('jitter')).toBe(false);
  });
});
