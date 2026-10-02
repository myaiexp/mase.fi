// @vitest-environment jsdom
// Tests for <base-text-fit>: render modes, the title tooltip, and the connect/disconnect lifecycle.
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// Every ResizeObserver the component constructs, so lifecycle tests can assert
// on the exact instance it disconnects.
const resizeObservers = [];

// Canvas mock MUST be installed before pretext initializes.
// Pretext caches the canvas context as a module-level singleton on first use.
beforeAll(() => {
  const mockCtx = {
    measureText: (text) => ({ width: text.length * 8 }), // 8px per char (monospace sim)
    font: '',
  };
  vi.stubGlobal('OffscreenCanvas', class {
    getContext() { return mockCtx; }
  });
  HTMLCanvasElement.prototype.getContext = () => mockCtx;

  // Mock ResizeObserver (not available in jsdom)
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb) { this._cb = cb; resizeObservers.push(this); }
    observe(el) {
      Promise.resolve().then(() => this._cb([{ target: el, contentRect: { width: 200 } }]));
    }
    unobserve() {}
    disconnect = vi.fn();
  });
});

// Import AFTER mocks are installed
beforeAll(async () => {
  await import('./text-fit.js'); // registers <base-text-fit>
});

describe('base-text-fit', () => {
  it('renders full text when it fits', async () => {
    const el = document.createElement('base-text-fit');
    el.textContent = 'Short';
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 0));
    // 'Short' = 5 chars * 8px = 40px, container is 200px -> fits
    expect(el.shadowRoot.querySelector('#text').textContent).toBe('Short');
  });

  it('truncates with ellipsis when text overflows single line', async () => {
    const el = document.createElement('base-text-fit');
    // 50 chars * 8px = 400px > 200px container
    el.textContent = 'A'.repeat(50);
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 0));
    const rendered = el.shadowRoot.querySelector('#text').textContent;
    expect(rendered).toContain('\u2026');
    expect(rendered.length).toBeLessThan(50);
  });

  it('respects lines attribute for multi-line truncation', async () => {
    const el = document.createElement('base-text-fit');
    el.setAttribute('lines', '3');
    el.textContent = 'word '.repeat(100);
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 0));
    const rendered = el.shadowRoot.querySelector('#text').textContent;
    expect(rendered).toContain('\u2026');
  });

  it('sets title to full text for tooltip', () => {
    const el = document.createElement('base-text-fit');
    el.textContent = 'Full original text here';
    document.body.appendChild(el);
    expect(el.title).toBe('Full original text here');
  });

  it('does not overwrite existing title attribute', () => {
    const el = document.createElement('base-text-fit');
    el.setAttribute('title', 'Custom tooltip');
    el.textContent = 'Some text';
    document.body.appendChild(el);
    expect(el.title).toBe('Custom tooltip');
  });

  it('lines=0 disables truncation', async () => {
    const el = document.createElement('base-text-fit');
    el.setAttribute('lines', '0');
    el.textContent = 'A'.repeat(50);
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 0));
    expect(el.shadowRoot.querySelector('#text').textContent).toBe('A'.repeat(50));
  });

  it('paints text synchronously on connect (no blank frame before RO fires)', () => {
    const el = document.createElement('base-text-fit');
    el.textContent = 'Sync paint';
    document.body.appendChild(el);
    // No await: assert immediately, before the async ResizeObserver callback.
    // jsdom has no layout so width is 0 -> full-text fallback paints at once.
    expect(el.shadowRoot.querySelector('#text').textContent).toBe('Sync paint');
  });

});

describe('base-text-fit lifecycle', () => {
  // jsdom has no document.fonts; give each test a real EventTarget in its place
  // so the loadingdone wiring is reachable.
  let fonts;
  beforeEach(() => {
    fonts = new window.EventTarget();
    Object.defineProperty(document, 'fonts', { value: fonts, configurable: true });
  });
  afterEach(() => {
    delete document.fonts;
    vi.restoreAllMocks();
  });

  it('disconnects both observers and removes the font listener on disconnect', () => {
    const moDisconnect = vi.spyOn(MutationObserver.prototype, 'disconnect');
    const add = vi.spyOn(fonts, 'addEventListener');
    const remove = vi.spyOn(fonts, 'removeEventListener');
    const el = document.createElement('base-text-fit');
    el.textContent = 'bye';
    document.body.appendChild(el);
    const ro = resizeObservers.at(-1);
    expect(ro.disconnect).not.toHaveBeenCalled();

    document.body.removeChild(el);

    expect(ro.disconnect).toHaveBeenCalledTimes(1);
    expect(moDisconnect).toHaveBeenCalledTimes(1);
    expect(add).toHaveBeenCalledWith('loadingdone', expect.any(Function));
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith('loadingdone', add.mock.calls[0][1]);
  });

  it('re-renders and retitles when the text changes after connect', async () => {
    const el = document.createElement('base-text-fit');
    el.textContent = 'old';
    document.body.appendChild(el);
    el.textContent = 'new';
    await Promise.resolve(); // MutationObserver callbacks run as microtasks
    expect(el.shadowRoot.querySelector('#text').textContent).toBe('new');
    expect(el.title).toBe('new');
  });

  it('keeps an author title when the text changes after connect', async () => {
    const el = document.createElement('base-text-fit');
    el.setAttribute('title', 'Custom tooltip');
    el.textContent = 'old';
    document.body.appendChild(el);
    el.textContent = 'new';
    await Promise.resolve();
    expect(el.title).toBe('Custom tooltip');
  });

  it('retitles on reconnect when the text changed while detached', () => {
    const el = document.createElement('base-text-fit');
    el.textContent = 'first';
    document.body.appendChild(el);
    document.body.removeChild(el);
    el.textContent = 'second';
    document.body.appendChild(el);
    expect(el.title).toBe('second');
  });

  it('re-renders on fonts loadingdone while connected, and not after disconnect', () => {
    const el = document.createElement('base-text-fit');
    el.textContent = 'font swap';
    document.body.appendChild(el);
    const textEl = el.shadowRoot.querySelector('#text');

    textEl.textContent = 'stale';
    fonts.dispatchEvent(new Event('loadingdone'));
    expect(textEl.textContent).toBe('font swap');

    document.body.removeChild(el);
    textEl.textContent = 'stale';
    fonts.dispatchEvent(new Event('loadingdone'));
    expect(textEl.textContent).toBe('stale');
  });

  it('warns once that hyphenate is a no-op, however many elements set it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (let i = 0; i < 2; i++) {
      const el = document.createElement('base-text-fit');
      el.setAttribute('hyphenate', '');
      document.body.appendChild(el);
    }
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/hyphenate attribute is a no-op/);
  });
});

describe('base-text-fit mode=justify', () => {
  it('renders justified lines as block spans with word-spacing', async () => {
    const el = document.createElement('base-text-fit');
    el.setAttribute('mode', 'justify');
    el.setAttribute('lines', '0');
    // Use text where middle lines don't perfectly fill 200px (25 chars at 8px/char)
    el.textContent = 'over the lazy dog and then some more words to fill this out well';
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 0));
    const spans = el.shadowRoot.querySelectorAll('.jl');
    expect(spans.length).toBeGreaterThan(1);
    // At least one non-last line should have word-spacing (lines that don't fill maxWidth exactly)
    const hasJustified = Array.from(spans).slice(0, -1).some(s => s.style.cssText.includes('word-spacing'));
    expect(hasJustified).toBe(true);
    // Last line should NOT have word-spacing (left-aligned)
    expect(spans[spans.length - 1].style.cssText).not.toContain('word-spacing');
  });

  it('truncates last line when lines limit exceeded', async () => {
    const el = document.createElement('base-text-fit');
    el.setAttribute('mode', 'justify');
    el.setAttribute('lines', '2');
    el.textContent = 'word '.repeat(100);
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 0));
    const spans = el.shadowRoot.querySelectorAll('.jl');
    expect(spans.length).toBe(2);
    expect(spans[1].textContent).toContain('\u2026');
  });

  it('renders single line without word-spacing when text fits', async () => {
    const el = document.createElement('base-text-fit');
    el.setAttribute('mode', 'justify');
    el.setAttribute('lines', '0');
    el.textContent = 'Short text';
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 0));
    const spans = el.shadowRoot.querySelectorAll('.jl');
    expect(spans.length).toBe(1);
    // Single line = last line, no word-spacing
    expect(spans[0].style.wordSpacing).toBe('');
  });
});

describe('base-text-fit mode=wrap', () => {
  it('wraps and truncates last line with ellipsis when exceeding lines limit', async () => {
    const el = document.createElement('base-text-fit');
    el.setAttribute('mode', 'wrap');
    el.setAttribute('lines', '3');
    el.textContent = 'word '.repeat(100);
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 0));
    const rendered = el.shadowRoot.querySelector('#text').textContent;
    // Overflow branch: kept first 3 lines, last truncated with ellipsis.
    expect(rendered.split('\n').length).toBe(3);
    expect(rendered).toContain('…');
  });

  it('renders short text without ellipsis in wrap mode', async () => {
    const el = document.createElement('base-text-fit');
    el.setAttribute('mode', 'wrap');
    el.setAttribute('lines', '2');
    el.textContent = 'tiny';
    document.body.appendChild(el);
    await new Promise(r => setTimeout(r, 0));
    const rendered = el.shadowRoot.querySelector('#text').textContent;
    // Balanced branch: fits within lines, no truncation.
    expect(rendered).not.toContain('…');
    expect(rendered.replace(/\n/g, '')).toBe('tiny');
  });
});
