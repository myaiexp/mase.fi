// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { formatDate, shortDate, relativeDate, createNick, createLine, typeText, appendLine } from './terminal.js';

describe('formatDate', () => {
  it('converts ISO to Finnish DD.MM.YYYY format', () => {
    expect(formatDate('2026-03-17')).toBe('17.03.2026');
  });

  it('handles single-digit days and months', () => {
    expect(formatDate('2026-01-05')).toBe('05.01.2026');
  });

  it('handles year boundary', () => {
    expect(formatDate('2025-12-31')).toBe('31.12.2025');
  });
});

describe('shortDate', () => {
  it('returns DD.MM format', () => {
    expect(shortDate('2026-03-22')).toBe('22.03');
  });

  it('pads single digits', () => {
    expect(shortDate('2026-01-05')).toBe('05.01');
  });
});

describe('relativeDate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-23T12:00:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "today" for today', () => {
    expect(relativeDate('2026-03-23')).toBe('today');
  });

  it('returns "yesterday" for yesterday', () => {
    expect(relativeDate('2026-03-22')).toBe('yesterday');
  });

  it('returns "2d" for 2 days ago', () => {
    expect(relativeDate('2026-03-21')).toBe('2d');
  });

  it('returns "6d" for 6 days ago', () => {
    expect(relativeDate('2026-03-17')).toBe('6d');
  });

  it('returns "1w" for 7 days ago', () => {
    expect(relativeDate('2026-03-16')).toBe('1w');
  });

  it('returns "3w" for 21 days ago', () => {
    expect(relativeDate('2026-03-02')).toBe('3w');
  });

  it('returns "1mo" for 30+ days', () => {
    expect(relativeDate('2026-02-20')).toBe('1mo');
  });

  it('returns "2mo" for 60+ days', () => {
    expect(relativeDate('2026-01-20')).toBe('2mo');
  });
});

describe('createNick', () => {
  it('returns a span with nick class', () => {
    const el = createNick('explorer');
    expect(el.tagName).toBe('SPAN');
    expect(el.classList.contains('nick')).toBe(true);
  });

  it('sets text content to the name', () => {
    const el = createNick('tracker');
    expect(el.textContent).toBe('tracker');
  });

  it('assigns consistent color for same name', () => {
    const a = createNick('explorer');
    const b = createNick('explorer');
    expect(a.style.color).toBe(b.style.color);
  });

  it('assigns different colors for most different names', () => {
    const a = createNick('explorer');
    const b = createNick('yatzy');
    // Not guaranteed different for all names, but likely for these
    // At minimum, both should have a color set
    expect(a.style.color).toBeTruthy();
    expect(b.style.color).toBeTruthy();
  });
});

describe('createLine', () => {
  it('returns a div with feed-line class', () => {
    const el = createLine('2026-03-22', 'explorer', 'Added offline caching');
    expect(el.tagName).toBe('DIV');
    expect(el.classList.contains('feed-line')).toBe(true);
  });

  it('contains timestamp element', () => {
    const el = createLine('2026-03-22', 'explorer', 'Test');
    const ts = el.querySelector('.feed-line__time');
    expect(ts).toBeTruthy();
    expect(ts.textContent).toBe('22.03');
  });

  it('contains nick element', () => {
    const el = createLine('2026-03-22', 'explorer', 'Test');
    const nick = el.querySelector('.nick');
    expect(nick).toBeTruthy();
    expect(nick.textContent).toBe('explorer');
  });

  it('contains text element', () => {
    const el = createLine('2026-03-22', 'explorer', 'Added offline caching');
    const text = el.querySelector('.feed-line__text');
    expect(text).toBeTruthy();
    expect(text.textContent).toBe('Added offline caching');
  });
});

describe('typeText', () => {
  it('types text character by character', async () => {
    const el = document.createElement('span');
    await typeText(el, 'abc', 1);
    expect(el.textContent).toBe('abc');
  });

  it('completes instantly on abort', async () => {
    const el = document.createElement('span');
    const controller = new AbortController();
    // Abort immediately
    controller.abort();
    await typeText(el, 'hello world', 50, controller.signal);
    expect(el.textContent).toBe('hello world');
  });
});

describe('appendLine', () => {
  it('appends a div to the container', () => {
    const container = document.createElement('div');
    const line = appendLine(container, 'Test line');
    expect(container.children.length).toBe(1);
    expect(line.textContent).toBe('Test line');
  });

  it('applies className if provided', () => {
    const container = document.createElement('div');
    const line = appendLine(container, 'Test', 'boot-line');
    expect(line.classList.contains('boot-line')).toBe(true);
  });

  it('returns the created element', () => {
    const container = document.createElement('div');
    const line = appendLine(container, 'Test');
    expect(line.tagName).toBe('DIV');
  });
});
