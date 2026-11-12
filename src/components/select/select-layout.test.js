// @vitest-environment jsdom
// <base-select> layout: menu auto-flip near the viewport bottom and intrinsic sizing
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createSelect, getMenu, getTrigger, $ } from './select-test-helpers.js';

beforeAll(async () => {
  await import('./select.js');
});

/**
 * Stub the host rect; only top/bottom matter to the flip maths.
 * @param {HTMLElement} el
 * @param {{ top: number, bottom: number }} rect
 */
function stubRect(el, { top, bottom }) {
  el.getBoundingClientRect = () => ({
    top, bottom, left: 0, right: 100, width: 100, height: 40, x: 0, y: top, toJSON: () => ({}),
  });
}

describe('base-select auto-flip', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  // --- Auto-flip ---

  it('adds flip class when near bottom', () => {
    const el = createSelect({ options: [{ value: 'x', label: 'X' }] });

    stubRect(el, { top: 900, bottom: 940 });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    el.open();
    expect(getMenu(el).classList.contains('flip')).toBe(true);
    // Drop the own-property stub so the prototype method is visible again.
    Reflect.deleteProperty(el, 'getBoundingClientRect');
  });

  it('no flip class when space available', () => {
    const el = createSelect({ options: [{ value: 'x', label: 'X' }] });

    // spaceBelow = 768 - 518 = 250, just clears the 200px estimate. Boundary-
    // sensitive: bumping MENU_HEIGHT_ESTIMATE to 300 would flip this RED.
    stubRect(el, { top: 478, bottom: 518 });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    el.open();
    expect(getMenu(el).classList.contains('flip')).toBe(false);
    // Drop the own-property stub so the prototype method is visible again.
    Reflect.deleteProperty(el, 'getBoundingClientRect');
  });
});

// The control sizes to its widest option rather than filling its container, so a
// hidden sizer carries every label the trigger could display. jsdom has no layout
// engine — these assert the DOM contract the CSS grid then measures.
describe('base-select intrinsic sizing', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  /** @param {HTMLElement} el */
  function getSizer(el) {
    return $(/** @type {ShadowRoot} */ (el.shadowRoot), '.sizer');
  }

  it('sizer mirrors every option label', () => {
    const el = createSelect({ options: [
      { value: 'a', label: 'Short' },
      { value: 'b', label: 'A considerably longer label' },
    ] });
    const labels = [...getSizer(el).children].map((s) => s.textContent);
    expect(labels).toEqual(['Short', 'A considerably longer label']);
  });

  it('sizer includes labels nested in option groups', () => {
    const el = createSelect({ groups: [
      { label: 'Group', options: [{ value: 'a', label: 'Grouped label' }] },
    ] });
    const labels = [...getSizer(el).children].map((s) => s.textContent);
    expect(labels).toContain('Grouped label');
  });

  it('sizer includes the placeholder — it is what an unset trigger displays', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }], placeholder: 'Pick one please' });
    const labels = [...getSizer(el).children].map((s) => s.textContent);
    expect(labels).toContain('Pick one please');
  });

  it('sizer resyncs when options are added after connect', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }] });
    const o = document.createElement('base-option');
    o.setAttribute('value', 'b');
    o.textContent = 'Added later';
    el.appendChild(o);
    // MutationObserver is async — flush the microtask queue it lands on.
    return Promise.resolve().then(() => {
      const labels = [...getSizer(el).children].map((s) => s.textContent);
      expect(labels).toContain('Added later');
    });
  });

  it('sizer does not twitch with the selected value', () => {
    const el = createSelect({ options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'Much longer label' },
    ] });
    const before = [...getSizer(el).children].map((s) => s.textContent);
    el.value = 'a';
    expect([...getSizer(el).children].map((s) => s.textContent)).toEqual(before);
  });

  it('size=sm applies to the sizer too, or it would measure the wrong font', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }], size: 'sm' });
    expect(getSizer(el).classList.contains('sm')).toBe(true);
    expect(getTrigger(el).classList.contains('sm')).toBe(true);
  });

  it('searchable rebuild keeps a populated sizer', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'Alpha' }] });
    el.setAttribute('searchable', '');
    const labels = [...getSizer(el).children].map((s) => s.textContent);
    expect(labels).toEqual(['Alpha']);
  });
});
