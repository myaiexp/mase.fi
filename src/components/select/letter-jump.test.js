// Unit tests for letter-jump typeahead: cycle, close-reset, idle timeout
import { describe, it, expect } from 'vitest';
import { createLetterJump, TYPEAHEAD_TIMEOUT_MS } from './letter-jump.js';

function opts(...labels) {
  return labels.map((textContent) => ({ textContent }));
}

describe('createLetterJump', () => {
  const fruit = opts('Apple', 'Banana', 'Avocado');

  it('jumps to the first option starting with the letter', () => {
    const jump = createLetterJump();
    expect(jump.jump('b', fruit, 0)).toBe(1);
  });

  it('is case-insensitive', () => {
    const jump = createLetterJump();
    expect(jump.jump('A', fruit, 0)).toBe(0);
  });

  it('returns -1 and leaves state alone when nothing matches', () => {
    const jump = createLetterJump();
    expect(jump.jump('a', fruit, 0)).toBe(0);
    expect(jump.jump('z', fruit, 10)).toBe(-1);
    // 'a' still cycles — the unmatched key did not start a new prefix
    expect(jump.jump('a', fruit, 20)).toBe(2);
  });

  it('repeated same letter cycles through matches', () => {
    const jump = createLetterJump();
    expect(jump.jump('a', fruit, 0)).toBe(0);
    expect(jump.jump('a', fruit, 10)).toBe(2);
    expect(jump.jump('a', fruit, 20)).toBe(0);
  });

  it('a different letter starts a new jump', () => {
    const jump = createLetterJump();
    expect(jump.jump('a', fruit, 0)).toBe(0);
    expect(jump.jump('b', fruit, 10)).toBe(1);
    expect(jump.jump('a', fruit, 20)).toBe(0);
  });

  it('reset() makes the next press a fresh jump, not a cycle', () => {
    const jump = createLetterJump();
    expect(jump.jump('a', fruit, 0)).toBe(0);
    jump.reset();
    expect(jump.jump('a', fruit, 10)).toBe(0);
  });

  it('a gap of TYPEAHEAD_TIMEOUT_MS restarts on the same letter', () => {
    const jump = createLetterJump();
    expect(jump.jump('a', fruit, 0)).toBe(0);
    expect(jump.jump('a', fruit, TYPEAHEAD_TIMEOUT_MS)).toBe(0);
  });

  it('a gap just under the timeout still cycles', () => {
    const jump = createLetterJump();
    expect(jump.jump('a', fruit, 0)).toBe(0);
    expect(jump.jump('a', fruit, TYPEAHEAD_TIMEOUT_MS - 1)).toBe(2);
  });
});
