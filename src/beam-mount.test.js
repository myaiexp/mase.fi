// @vitest-environment jsdom
// Lifecycle tests for mountBeam() and unmountBeam(): the plain-logo exits, the
// single-active-beam singleton, detached-host self-cleanup, click-to-replay.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mountBeam, unmountBeam } from './beam.js';

// Keep measurement off the canvas: mountBeam only needs a positive charWidth
// to enter the animated path, and jsdom's measureText is not a contract we pin.
vi.mock('@chenglou/pretext', () => ({
  prepareWithSegments: (/** @type {string} */ text) => text,
  measureNaturalWidth: (/** @type {unknown} */ prepared) => String(prepared).length * 8,
}));

// jsdom does not implement matchMedia; bare matchMedia(...) would ReferenceError.
/** @param {boolean} matches */
function stubReducedMotion(matches) {
  vi.stubGlobal('matchMedia', (/** @type {string} */ query) => ({ matches, media: query }));
}

function makeHost() {
  const el = document.createElement('div');
  el.className = 'ascii';
  document.body.appendChild(el);
  // jsdom does not compute layout, so offsetParent is null unless we pin it.
  Object.defineProperty(el, 'offsetParent', {
    configurable: true,
    get: () => document.body,
  });
  return el;
}

describe('mountBeam', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    unmountBeam();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it('under reduced-motion sets textContent and returns without scheduling', () => {
    stubReducedMotion(true);
    const host = makeHost();
    const result = mountBeam(host, 'LOGO');

    expect(host.textContent).toBe('LOGO');
    expect(result).toBeNull();
    expect(host.classList.contains('beam-host')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('on a hidden host sets textContent and returns without scheduling', () => {
    stubReducedMotion(false);
    const host = makeHost();
    Object.defineProperty(host, 'offsetParent', { configurable: true, get: () => null });
    const result = mountBeam(host, 'LOGO');

    expect(host.textContent).toBe('LOGO');
    expect(result).toBeNull();
    expect(host.classList.contains('beam-host')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('with an unmeasurable char width replaces the host text and returns without scheduling', () => {
    stubReducedMotion(false);
    const host = makeHost();
    host.textContent = 'stale';
    const result = mountBeam(host, ''); // no glyphs: charWidth is 0

    expect(host.textContent).toBe('');
    expect(result).toBeNull();
    expect(host.classList.contains('beam-host')).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('a second mount on a different host leaves exactly one loop alive', () => {
    stubReducedMotion(false);
    const a = makeHost();
    const b = makeHost();
    const logo = 'AB';

    mountBeam(a, logo);
    expect(a.classList.contains('beam-host')).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    mountBeam(b, logo);
    // First host restored; its timeout cancelled; only B's loop is scheduled.
    expect(a.classList.contains('beam-host')).toBe(false);
    expect(a.textContent).toBe(logo);
    expect(a.querySelector('.ascii-beam')).toBeNull();
    expect(b.classList.contains('beam-host')).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    const frozen = a.textContent;
    vi.advanceTimersByTime(10_000);
    expect(a.textContent).toBe(frozen);
    expect(b.classList.contains('beam-host')).toBe(true);
  });

  it('unmountBeam cancels the loop immediately and restores the host', () => {
    stubReducedMotion(false);
    const host = makeHost();
    mountBeam(host, 'AB');
    expect(host.classList.contains('beam-host')).toBe(true);
    expect(vi.getTimerCount()).toBe(1);

    unmountBeam();
    expect(vi.getTimerCount()).toBe(0);
    expect(host.classList.contains('beam-host')).toBe(false);
    expect(host.textContent).toBe('AB');
    expect(host.querySelector('.ascii-beam')).toBeNull();
  });

  it('unmountBeam is a no-op when nothing is mounted', () => {
    expect(() => unmountBeam()).not.toThrow();
    unmountBeam();
  });

  it('self-cleans on the next scheduled play when the host has been detached', () => {
    // The leak: leaving #home replaces #pinned (detaching ~300 spans) without
    // tearing down the rAF/timeout chain. play() must notice isConnected and
    // run cleanup so a missed unmountBeam still dies. FIRST_DELAY_MS = 1600.
    stubReducedMotion(false);
    const host = makeHost();
    mountBeam(host, 'AB');
    expect(vi.getTimerCount()).toBe(1);
    host.remove();
    vi.advanceTimersByTime(1600);
    expect(vi.getTimerCount()).toBe(0);
  });

  // Fake timers drive requestAnimationFrame too (one frame per 16ms) and count
  // a pending frame in getTimerCount.
  const FRAME_MS = 16;
  const beamOf = (/** @type {HTMLElement} */ host) => /** @type {HTMLElement} */ (host.querySelector('.ascii-beam'));
  const charsOf = (/** @type {HTMLElement} */ host) => [...host.querySelectorAll('.bch')].map((el) => el.textContent).join('');

  it('self-cleans within one frame when the host is detached mid-sweep', () => {
    // play()'s entry check only runs between phases. A host detached while a
    // sweep is in flight is caught by step(): without that guard the sweep keeps
    // painting the detached spans until the phase ends.
    stubReducedMotion(false);
    const host = makeHost();
    mountBeam(host, 'AB');
    vi.advanceTimersByTime(1600 + 3 * FRAME_MS);
    expect(beamOf(host).style.opacity).not.toBe('0'); // the sweep is running
    expect(vi.getTimerCount()).toBe(1); // the next frame

    host.remove();
    vi.advanceTimersByTime(FRAME_MS);

    expect(vi.getTimerCount()).toBe(0);
    expect(host.classList.contains('beam-host')).toBe(false);
    expect(host.textContent).toBe('AB'); // spans replaced by the plain logo
  });

  it('a click during the first delay starts the sweep at once', () => {
    stubReducedMotion(false);
    const host = makeHost();
    mountBeam(host, 'AB');
    expect(beamOf(host).style.opacity).toBe('');

    host.click();
    vi.advanceTimersByTime(3 * FRAME_MS); // far short of FIRST_DELAY_MS

    expect(beamOf(host).style.opacity).not.toBe('0');
    expect(beamOf(host).style.transform).toMatch(/^translateX\(/);
    expect(vi.getTimerCount()).toBe(1); // the pending first-delay timeout was cleared
  });

  it('a click mid-sweep cancels the frame in flight and replays from pristine', () => {
    stubReducedMotion(false);
    const host = makeHost();
    mountBeam(host, 'AB');
    vi.advanceTimersByTime(1600 + 3 * FRAME_MS);
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame');

    host.click();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(charsOf(host)).toBe('AB');
    expect(beamOf(host).style.opacity).toBe('0');
    expect(vi.getTimerCount()).toBe(1); // one chain: the old frame is gone, the replay's is queued
    vi.advanceTimersByTime(3 * FRAME_MS);
    expect(beamOf(host).style.opacity).not.toBe('0');
  });

  it('a click after unmount starts nothing', () => {
    stubReducedMotion(false);
    const host = makeHost();
    mountBeam(host, 'AB');
    unmountBeam();
    host.click();
    expect(vi.getTimerCount()).toBe(0);
  });
});
