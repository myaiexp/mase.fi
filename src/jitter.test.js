// @vitest-environment jsdom
// Unit tests for playJitter(rowEls) — the modem-decode arrival animation.
// Pins the accessibility guard: when prefers-reduced-motion is set, playJitter()
// early-exits with zero side effects (no classes, no animationDelay, no DOM
// mutation, no timers). The contrasting motion-allowed case proves the animated
// path actually runs: it tags the row, schedules timers, scrambles the text
// mid-flight, then hands the row to the caller's settle() to be rebuilt. jsdom has
// no matchMedia, so it is stubbed; fake timers drive the staggered scramble/settle
// setTimeouts.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { playJitter, clearJitter } from './jitter.js';

// jsdom does not implement matchMedia; bare matchMedia(...) would ReferenceError.
function stubReducedMotion(matches) {
  vi.stubGlobal('matchMedia', (query) => ({ matches, media: query }));
}

// Build a feed row with the .msg / .nick children playJitter queries and mutates.
// dataset.raw is the row's source of truth, as populateRow leaves it in feed.js.
function makeRow(msgText, nickText) {
  const row = document.createElement('div');
  row.dataset.raw = msgText;
  const msg = document.createElement('span');
  msg.className = 'msg';
  msg.textContent = msgText;
  const nick = document.createElement('span');
  nick.className = 'nick';
  nick.textContent = nickText;
  row.append(nick, msg);
  return { row, msg, nick };
}

// Stand-in for feed.js's settle: rebuild .msg from the row's source of truth.
const settle = (row) => { row.querySelector('.msg').textContent = row.dataset.raw; };

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

    playJitter([{ row }], settle);

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

    playJitter([{ row }], settle);

    // Synchronous side effects of the animated path.
    expect(row.classList.contains('jitter')).toBe(true);
    expect(row.classList.contains('arriving')).toBe(true);
    expect(row.style.animationDelay).toBe('0ms'); // i === 0 → 0 * STAGGER_MS
    // Scramble frames + the final restore are queued on timers.
    expect(vi.getTimerCount()).toBeGreaterThan(0);
  });

  it('scrambles the text mid-animation then settles the row', () => {
    stubReducedMotion(false);
    // Math.random === 0 → every char falls below the scramble probability, so
    // the frame text is guaranteed to differ from the (alphabetic) original.
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { row, msg, nick } = makeRow('hello world', 'mase');

    playJitter([{ row }], settle);

    // First scramble frame fires at i*STAGGER_MS + 40 = 40ms (i === 0).
    vi.advanceTimersByTime(40);
    expect(msg.textContent).not.toBe('hello world');
    expect(nick.textContent).not.toBe('mase');

    // The settle timer fires at start + JITTER_MS = 40 + 320 = 360ms.
    vi.advanceTimersByTime(400);
    expect(msg.textContent).toBe('hello world');
    expect(nick.textContent).toBe('mase');
    expect(row.classList.contains('jitter')).toBe(false);
  });

  // The frames overwrite .msg in place. Putting back a copy taken at the start
  // would undo whatever reached the row mid-animation: a resize relayout (new
  // line breaks) or a search (its <mark>s). settle() rebuilds from current state.
  it('rebuilds .msg through settle() at the end, not from a copy taken at the start', () => {
    stubReducedMotion(false);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { row, msg } = makeRow('hello world', 'mase');
    let lines = 1; // the line count a real layout derives from the feed width
    const layout = vi.fn((r) => {
      const words = r.dataset.raw.split(' ');
      const per = Math.ceil(words.length / lines);
      msg.replaceChildren(...Array.from({ length: lines }, (_, i) => {
        const line = document.createElement('span');
        line.className = 'line';
        line.textContent = words.slice(i * per, (i + 1) * per).join(' ');
        return line;
      }));
    });
    layout(row);
    layout.mockClear();
    expect(msg.querySelectorAll('.line')).toHaveLength(1);

    playJitter([{ row }], layout);
    vi.advanceTimersByTime(40);
    expect(msg.querySelector('.line')).toBeNull(); // a scramble frame replaced the lines
    lines = 2; // the feed narrowed mid-animation
    expect(layout).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    expect(layout).toHaveBeenCalledTimes(1);
    expect(layout).toHaveBeenCalledWith(row);
    expect([...msg.querySelectorAll('.line')].map((l) => l.textContent)).toEqual(['hello', 'world']);
  });

  it('settles each row once, in stagger order', () => {
    stubReducedMotion(false);
    const made = [makeRow('one', 'a'), makeRow('two', 'b'), makeRow('three', 'c')];
    const settled = [];
    playJitter(made.map(({ row }) => ({ row })), (row) => { settled.push(row.dataset.raw); settle(row); });
    vi.advanceTimersByTime(2000);
    expect(settled).toEqual(['one', 'two', 'three']);
    expect(made.map(({ msg }) => msg.textContent)).toEqual(['one', 'two', 'three']);
    expect(made.some(({ row }) => row.classList.contains('jitter'))).toBe(false);
  });

  it('clearJitter cancels pending scramble/settle timers so later ticks write nothing', () => {
    stubReducedMotion(false);
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { row, msg, nick } = makeRow('hello world', 'mase');

    playJitter([{ row }], settle);
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    const msgAtCancel = msg.textContent;
    const nickAtCancel = nick.textContent;

    clearJitter();
    expect(vi.getTimerCount()).toBe(0);
    expect(() => clearJitter()).not.toThrow();

    // Past start (40) + JITTER_MS (320). No scramble frame, no settle call.
    vi.advanceTimersByTime(1000);
    expect(msg.textContent).toBe(msgAtCancel);
    expect(nick.textContent).toBe(nickAtCancel);
    expect(msg.textContent).toBe('hello world');
  });
});
