// @vitest-environment jsdom
// BaseToast tests: show, timed fade-out, stacking, type classes, the base.css-owned look
import { join } from 'node:path';
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { inlineBaseCss } from '../../../scripts/build-base-css.js';

// The visual contract. BaseToast only stamps these classes; a second inline
// geometry would not show up in the DOM assertions below.
// join, not new URL(import.meta.url): under the jsdom vitest environment Vite
// rewrites that URL off the file: scheme and fileURLToPath throws.
// The published sheet, not the @import index: the rules live in src/base/*.css.
const baseCss = inlineBaseCss(join(import.meta.dirname, '../../base.css'));

/** @type {typeof import('./toast.js').BaseToast} */
let BaseToast;

beforeAll(async () => {
  const mod = await import('./toast.js');
  BaseToast = mod.BaseToast;
});

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  // Clean up container between tests
  const container = document.querySelector('[data-toast-container]');
  if (container) container.remove();
});

/** @returns {HTMLElement} the toast container; a missing one fails the test */
function getContainer() {
  const c = /** @type {HTMLElement | null} */ (document.querySelector('[data-toast-container]'));
  if (!c) throw new Error('toast container missing');
  return c;
}

/** @returns {HTMLElement} the first toast in the container */
function firstToast() {
  return /** @type {HTMLElement} */ (getContainer().children[0]);
}

describe('BaseToast', () => {
  it('show() creates a toast element in the container', () => {
    BaseToast.show('test message');
    const container = getContainer();
    expect(container).toBeTruthy();
    expect(container.classList.contains('toast-container')).toBe(true);
    expect(container.children.length).toBe(1);
    expect(firstToast().textContent).toBe('test message');
    // Omitted type is info, the same class an explicit 'info' gets.
    expect(firstToast().className).toBe('toast toast-info');
  });

  it('toast auto-removes after duration', () => {
    BaseToast.show('gone soon', 'info', 100);
    const container = getContainer();
    expect(container.children.length).toBe(1);
    vi.advanceTimersByTime(500); // 100ms duration + 300ms fade-out
    expect(container.children.length).toBe(0);
  });

  it('fades out (opacity 0) before removal, not abruptly', () => {
    BaseToast.show('fading', 'info', 100);
    const container = getContainer();
    const toast = /** @type {HTMLElement} */ (container.children[0]);

    // The opacity transition is what makes the fade visible rather than a snap.
    expect(toast.style.transition).toBe('opacity 0.3s');
    // Fully visible while the duration is still counting down.
    expect(toast.style.opacity).toBe('1');

    // At the duration boundary the fade begins, but the toast is NOT yet removed.
    vi.advanceTimersByTime(100);
    expect(toast.style.opacity).toBe('0');
    expect(container.children.length).toBe(1);

    // Mid-fade (before the 300ms transition completes) the toast is still present.
    vi.advanceTimersByTime(299);
    expect(container.children.length).toBe(1);

    // Only after the full 300ms fade does the toast leave the DOM.
    vi.advanceTimersByTime(1);
    expect(container.children.length).toBe(0);
  });

  it('multiple toasts stack vertically', () => {
    BaseToast.show('first');
    BaseToast.show('second');
    const container = getContainer();
    expect(container.children.length).toBe(2);
  });

  it('stamps the type class and leaves geometry to base.css', () => {
    BaseToast.show('error msg', 'error');
    const container = getContainer();
    const toast = /** @type {HTMLElement} */ (container.children[0]);
    expect(toast.className).toBe('toast toast-error');
    // Position, stacking, padding, border and type color are the stylesheet's.
    // An inline copy is how the two recipes drifted.
    expect(container.style.position).toBe('');
    expect(container.style.zIndex).toBe('');
    expect(container.style.top).toBe('');
    expect(container.style.bottom).toBe('');
    expect(container.style.right).toBe('');
    expect(toast.style.padding).toBe('');
    expect(toast.style.border).toBe('');
    expect(toast.style.borderLeft).toBe('');
    expect(toast.style.borderColor).toBe('');
    expect(toast.style.background).toBe('');
    expect(toast.style.color).toBe('');
    expect(toast.style.maxWidth).toBe('');
  });

  it.each([
    ['success', 'toast toast-success'],
    ['error', 'toast toast-error'],
    ['warning', 'toast toast-warning'],
    ['info', 'toast toast-info'],
  ])('%s stamps %s', (type, className) => {
    BaseToast.show('msg', type);
    const toast = firstToast();
    expect(toast.className).toBe(className);
  });

  it('an unknown type falls back to info, not a class base.css does not style', () => {
    BaseToast.show('nope', 'banana');
    const toast = firstToast();
    expect(toast.className).toBe('toast toast-info');
  });

  it('base.css is the only type and geometry map for those classes', () => {
    const types = { success: '--green', error: '--red', warning: '--orange', info: '--blue' };
    for (const [type, token] of Object.entries(types)) {
      const rule = baseCss.match(new RegExp(`\\.toast-${type}\\s*\\{[^}]*\\}`));
      expect(rule, `.toast-${type} missing from base.css`).not.toBeNull();
      expect(/** @type {RegExpMatchArray} */ (rule)[0]).toContain(`var(${token})`);
    }
    const container = baseCss.match(/\.toast-container\s*\{[^}]*\}/);
    expect(container, '.toast-container missing from base.css').not.toBeNull();
    const containerRule = /** @type {RegExpMatchArray} */ (container)[0];
    expect(containerRule).toContain('bottom:');
    expect(containerRule).toContain('z-index:');
    expect(containerRule).toContain('max-width:');
    expect(containerRule).toContain('overflow-wrap:');
    expect(containerRule).not.toMatch(/(^|\n)\s*top\s*:/);
    const toast = baseCss.match(/\.toast\s*\{[^}]*\}/);
    const toastRule = /** @type {RegExpMatchArray} */ (toast)[0];
    expect(toastRule).toContain('padding:');
    expect(toastRule).toContain('border:');
    // The phone cap is on .toast-container. .toast is shared with helm's own
    // notifier, which already widths #toast-container; a max-width here would
    // restyle that notifier too.
    expect(toastRule).not.toContain('max-width');
  });

  it('container is created only once', () => {
    BaseToast.show('a');
    BaseToast.show('b');
    const containers = document.querySelectorAll('[data-toast-container]');
    expect(containers.length).toBe(1);
  });
});
