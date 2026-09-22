// @vitest-environment jsdom
// Tests for shadowStyles: adopted-sheet path (CSP-safe), <style> fallback, per-component coverage
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { shadowStyles } from './shadow-styles.js';

// Every shadow-DOM tag the library defines. Toast is not here: it has no
// shadow root and styles through the CSSOM (element.style), which CSP allows.
const TAGS = [
  'base-badge', 'base-modal', 'base-tabs', 'base-dropdown', 'base-dropdown-item',
  'base-dropdown-divider', 'base-select', 'base-text-fit', 'base-context-menu',
];

beforeAll(async () => {
  await import('../index.js');
});

// jsdom 29 has CSSStyleSheet + replaceSync but no ShadowRoot#adoptedStyleSheets,
// so the browser path is exercised by installing a spec-shaped accessor.
function stubAdoptedStyleSheets({ throwOnSet = false } = {}) {
  const store = new WeakMap();
  Object.defineProperty(ShadowRoot.prototype, 'adoptedStyleSheets', {
    configurable: true,
    get() { return store.get(this) ?? []; },
    set(v) {
      if (throwOnSet) throw new DOMException('cross-document', 'NotAllowedError');
      store.set(this, v);
    },
  });
}

afterEach(() => {
  delete ShadowRoot.prototype.adoptedStyleSheets;
  vi.restoreAllMocks();
});

// Styles are adopted in the constructor, so the element never needs connecting
// (text-fit's connectedCallback wants a ResizeObserver jsdom lacks).
function shadowOf(tag) {
  return document.createElement(tag).shadowRoot;
}

describe('components under adoptedStyleSheets (browser path)', () => {
  it.each(TAGS)('%s adopts a constructed sheet and injects no <style>', (tag) => {
    stubAdoptedStyleSheets();
    const root = shadowOf(tag);
    expect(root.querySelector('style')).toBeNull();
    expect(root.adoptedStyleSheets).toHaveLength(1);
    const [sheet] = root.adoptedStyleSheets;
    expect(sheet).toBeInstanceOf(CSSStyleSheet);
    expect(sheet.cssRules.length).toBeGreaterThan(0);
  });

  it('shares one sheet across instances of the same component', () => {
    stubAdoptedStyleSheets();
    const a = shadowOf('base-select');
    const b = shadowOf('base-select');
    expect(a.adoptedStyleSheets[0]).toBe(b.adoptedStyleSheets[0]);
  });
});

describe('components without adoptedStyleSheets (fallback path)', () => {
  it.each(TAGS)('%s falls back to a leading <style>', (tag) => {
    const root = shadowOf(tag);
    expect(root.firstChild.nodeName).toBe('STYLE');
    expect(root.firstChild.textContent).toContain(':host');
  });
});

describe('shadowStyles', () => {
  it('keeps any sheets already adopted on the root', () => {
    stubAdoptedStyleSheets();
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    const first = shadowStyles(':host { color: red; }');
    const second = shadowStyles(':host { display: block; }');
    first.adopt(root);
    second.adopt(root);
    expect(root.adoptedStyleSheets).toHaveLength(2);
  });

  it('falls back to <style> and warns when adoption throws', () => {
    stubAdoptedStyleSheets({ throwOnSet: true });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const host = document.createElement('div');
    const root = host.attachShadow({ mode: 'open' });
    shadowStyles(':host { display: block; }').adopt(root);
    expect(root.querySelector('style').textContent).toBe(':host { display: block; }');
    expect(warn).toHaveBeenCalledOnce();
  });
});
