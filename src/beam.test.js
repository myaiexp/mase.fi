// @vitest-environment jsdom
// Unit tests for beam.js: destructionAt() (pure curve), paintChar() (bucket
// cache — the cheap DOM-write invariant), mountBeam() (reduced-motion
// fast-path + the single-active-beam singleton), and unmountBeam().
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { destructionAt, paintChar, mountBeam, unmountBeam } from './beam.js';

// Keep measurement off the canvas: mountBeam only needs a positive charWidth
// to enter the animated path, and jsdom's measureText is not a contract we pin.
vi.mock('@chenglou/pretext', () => ({
  prepareWithSegments: (text) => text,
  measureNaturalWidth: (prepared) => String(prepared).length * 8,
}));

// Module-private constants, mirrored here so the boundary inputs are legible.
// d = beamX - charX, so for a target d we pick charX = beamX - d (beamX fixed).
const CHARGE_R = 56;
const BEAM_R = 18;
const DECAY_R = 96;
const BEAM_X = 100;

// Returns destructionAt for a char whose signed distance from the beam is `d`
// (d>0 = char behind the beam / already swept, d<0 = char ahead of the beam).
const at = (d) => destructionAt(BEAM_X - d, BEAM_X);

describe('destructionAt', () => {
  it('is pristine (0) for a char far ahead of the beam', () => {
    expect(at(-2 * CHARGE_R)).toBe(0);
  });

  it('is exactly 0 at the -CHARGE_R charge onset boundary', () => {
    expect(at(-CHARGE_R)).toBeCloseTo(0, 10);
  });

  it('ramps linearly through the charge band (0..0.40)', () => {
    expect(at(-CHARGE_R / 2)).toBeCloseTo(0.2, 10); // halfway → half of 0.40
  });

  it('is 0.40 at the beam centre', () => {
    expect(at(0)).toBeCloseTo(0.4, 10);
  });

  it('ramps through the peak band (0.40..0.70)', () => {
    expect(at(BEAM_R / 2)).toBeCloseTo(0.55, 10); // halfway → 0.40 + half of 0.30
  });

  it('is 0.70 at the BEAM_R peak→decay boundary', () => {
    expect(at(BEAM_R)).toBeCloseTo(0.7, 10);
  });

  it('ramps through the decay band (0.70..1.0)', () => {
    expect(at(BEAM_R + DECAY_R / 2)).toBeCloseTo(0.85, 10); // halfway → 0.70 + half of 0.30
  });

  it('approaches 1.0 just inside the decay tail end', () => {
    expect(at(BEAM_R + DECAY_R - 0.0001)).toBeCloseTo(1.0, 4);
  });

  it('is ash (1) at and beyond the BEAM_R+DECAY_R boundary', () => {
    expect(at(BEAM_R + DECAY_R)).toBe(1);
    expect(at(3 * (BEAM_R + DECAY_R))).toBe(1);
  });

  it('is monotonically non-decreasing across the full sweep', () => {
    let prev = -1;
    for (let d = -CHARGE_R - 10; d <= BEAM_R + DECAY_R + 10; d += 1) {
      const v = at(d);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });
});

// Drain MutationObserver records synchronously — paintChar either assigns
// textContent/className or it doesn't, and takeRecords() sees that without
// waiting on a microtask.
function mutationsDuring(el, fn) {
  const obs = new MutationObserver(() => {});
  obs.observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
  fn();
  const records = obs.takeRecords();
  obs.disconnect();
  return records;
}

describe('paintChar', () => {
  it('does not rewrite textContent when dest stays inside the same peak bucket', () => {
    const span = document.createElement('span');
    paintChar(span, 'A', 0.50); // bucket 2 (peak)
    expect(span.textContent).toBe('█');

    const records = mutationsDuring(span, () => {
      paintChar(span, 'A', 0.55);
      paintChar(span, 'A', 0.69);
    });
    expect(records).toHaveLength(0);
    expect(span.textContent).toBe('█');
  });

  it('does not rewrite textContent when dest stays inside the same decay sub-bucket', () => {
    const span = document.createElement('span');
    // dest 0.71 and 0.75 both map to DECAY_RAMP[0] ('▓') — same sub-bucket.
    paintChar(span, 'A', 0.71);
    expect(span.textContent).toBe('▓');

    const records = mutationsDuring(span, () => {
      paintChar(span, 'A', 0.75);
    });
    expect(records).toHaveLength(0);
    expect(span.textContent).toBe('▓');
  });

  it('does rewrite when dest crosses into a new bucket', () => {
    const span = document.createElement('span');
    paintChar(span, 'A', 0.50); // peak → █
    const records = mutationsDuring(span, () => {
      paintChar(span, 'A', 0.90); // decay
    });
    expect(records.length).toBeGreaterThan(0);
    expect(span.textContent).not.toBe('█');
  });
});

// jsdom does not implement matchMedia; bare matchMedia(...) would ReferenceError.
function stubReducedMotion(matches) {
  vi.stubGlobal('matchMedia', (query) => ({ matches, media: query }));
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
  const beamOf = (host) => host.querySelector('.ascii-beam');
  const charsOf = (host) => [...host.querySelectorAll('.bch')].map((el) => el.textContent).join('');

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
