// @vitest-environment jsdom
import { describe, it, expect, beforeAll, vi } from 'vitest';

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
    constructor(cb) { this._cb = cb; }
    observe(el) {
      Promise.resolve().then(() => this._cb([{ target: el, contentRect: { width: 200 } }]));
    }
    unobserve() {}
    disconnect() {}
  });
});

// Import AFTER mocks are installed
let BaseTextFit;
beforeAll(async () => {
  const mod = await import('./text-fit.js');
  BaseTextFit = customElements.get('base-text-fit');
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

  it('cleans up observers on disconnect', () => {
    const el = document.createElement('base-text-fit');
    document.body.appendChild(el);
    // Should not throw
    document.body.removeChild(el);
  });
});

describe('BaseTextFit.truncate (static)', () => {
  const DEFAULT_FONT = '13px monospace';
  let prepareWithSegments;

  beforeAll(async () => {
    const mod = await import('@chenglou/pretext');
    prepareWithSegments = mod.prepareWithSegments;
  });

  function prep(text) {
    const result = prepareWithSegments(text, DEFAULT_FONT);
    result._font = DEFAULT_FONT;
    return result;
  }

  it('returns full text when it fits', () => {
    const prepared = prep('Hello');
    // 5 chars * 8px = 40px, maxWidth 200 -> fits
    const result = BaseTextFit.truncate(prepared, 200, 1);
    expect(result).toBe('Hello');
  });

  it('truncates and adds ellipsis when text overflows', () => {
    const prepared = prep('A'.repeat(50));
    // 50 chars * 8px = 400px > 200px
    const result = BaseTextFit.truncate(prepared, 200, 1);
    expect(result).toContain('\u2026');
    expect(result.length).toBeLessThan(50);
  });

  it('handles empty text', () => {
    const prepared = prep('');
    const result = BaseTextFit.truncate(prepared, 200, 1);
    expect(result).toBe('');
  });
});
