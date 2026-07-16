// @vitest-environment jsdom
// Unit tests for beam.js destructionAt() — the pure destruction-progress curve.
import { describe, it, expect } from 'vitest';
import { destructionAt } from './beam.js';

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
