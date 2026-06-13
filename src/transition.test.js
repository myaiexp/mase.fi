// @vitest-environment jsdom
// Unit tests for playSwitchTransition(onMid) — the channel-switch scanline
// transition. Covers the prefers-reduced-motion fast-path (onMid fires
// immediately and synchronously, skipping all DOM/animation work) and the
// timer-driven normal path: onMid fires once at the midpoint swap, cleanup
// runs on animationend, and a safety setTimeout guarantees cleanup if
// animationend never arrives. Critically pins that onMid is never invoked
// twice — the cleanup path (done) does not call onMid, and the safety timer
// is cancelled once animationend's done() runs. jsdom has no matchMedia, so
// it is stubbed; fake timers drive the midpoint + safety setTimeouts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { playSwitchTransition } from './transition.js';

// jsdom returns '' for animationDuration, so durMs falls back to 420 (see
// transition.js: parseFloat('') * 1000 || 420). Midpoint swap fires at
// 420 * 0.33 ≈ 138.6ms; the safety net fires at 420 + 200 = 620ms. These
// constants pin the timing the tests advance fake timers through.
const MIDPOINT_MS = 140; // just past 138.6
const SAFETY_MS = 620;

// jsdom does not implement matchMedia; bare matchMedia(...) would ReferenceError.
function stubReducedMotion(matches) {
  vi.stubGlobal('matchMedia', (query) => ({ matches, media: query }));
}

// Build the #feed-overlay element the normal (animated) path reads and mutates.
function mountOverlay() {
  document.body.replaceChildren();
  const overlay = document.createElement('div');
  overlay.id = 'feed-overlay';
  document.body.appendChild(overlay);
  return overlay;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('playSwitchTransition — prefers-reduced-motion fast path', () => {
  it('calls onMid immediately exactly once and skips the animation', () => {
    stubReducedMotion(true);
    const onMid = vi.fn();

    playSwitchTransition(onMid);

    // Called synchronously, before any timer is advanced — and with no
    // #feed-overlay in the DOM, proving the early return ran first.
    expect(onMid).toHaveBeenCalledTimes(1);

    // No timers were scheduled; advancing all of them changes nothing.
    vi.runAllTimers();
    expect(onMid).toHaveBeenCalledTimes(1);
  });
});

describe('playSwitchTransition — normal animated path', () => {
  it('defers onMid to the midpoint timer, not synchronously', () => {
    stubReducedMotion(false);
    const overlay = mountOverlay();
    const onMid = vi.fn();

    playSwitchTransition(onMid);

    // onMid is scheduled on a timer, so it has not fired yet.
    expect(onMid).not.toHaveBeenCalled();
    // The overlay is activated with a single .scan child driving the sweep.
    expect(overlay.classList.contains('active')).toBe(true);
    expect(overlay.querySelector('.scan')).not.toBeNull();

    vi.advanceTimersByTime(MIDPOINT_MS);
    expect(onMid).toHaveBeenCalledTimes(1);
  });

  it('cleans up on animationend and leaves onMid called exactly once', () => {
    stubReducedMotion(false);
    const overlay = mountOverlay();
    const onMid = vi.fn();

    playSwitchTransition(onMid);
    vi.advanceTimersByTime(MIDPOINT_MS);

    const scan = overlay.querySelector('.scan');
    scan.dispatchEvent(new Event('animationend'));

    // done() tore the overlay back down...
    expect(overlay.classList.contains('active')).toBe(false);
    expect(overlay.children.length).toBe(0);
    // ...and the cleanup path did not re-invoke onMid.
    expect(onMid).toHaveBeenCalledTimes(1);
  });
});

describe('playSwitchTransition — safety timeout fallback', () => {
  it('cleans up via the safety timer when animationend never fires', () => {
    stubReducedMotion(false);
    const overlay = mountOverlay();
    const onMid = vi.fn();

    playSwitchTransition(onMid);

    // No animationend is ever dispatched. Advancing past the safety window
    // fires both the midpoint timer (onMid) and the safety timer (cleanup).
    vi.advanceTimersByTime(SAFETY_MS);

    expect(onMid).toHaveBeenCalledTimes(1);
    expect(overlay.classList.contains('active')).toBe(false);
    expect(overlay.children.length).toBe(0);
  });
});

describe('playSwitchTransition — animationend + safety timer do not double-fire', () => {
  it('calls onMid exactly once even when the safety window also elapses', () => {
    stubReducedMotion(false);
    const overlay = mountOverlay();
    const onMid = vi.fn();

    playSwitchTransition(onMid);
    vi.advanceTimersByTime(MIDPOINT_MS);

    // animationend runs done(), which cancels the pending safety timer.
    const scan = overlay.querySelector('.scan');
    scan.dispatchEvent(new Event('animationend'));

    // Advance well past the safety window: the cancelled timer must not re-run,
    // so onMid (which the cleanup path never calls anyway) stays at one.
    vi.advanceTimersByTime(SAFETY_MS);

    expect(onMid).toHaveBeenCalledTimes(1);
    expect(overlay.children.length).toBe(0);
  });
});
