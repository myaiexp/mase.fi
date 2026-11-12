// @vitest-environment jsdom
// <base-select> keyboard: arrow navigation, Enter/Tab, letter jump, group-header skipping
import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { TYPEAHEAD_TIMEOUT_MS } from './letter-jump.js';
import { createSelect, getMenu, getTrigger, getOptions } from './select-test-helpers.js';

beforeAll(async () => {
  await import('./select.js');
});

describe('base-select keyboard', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  // --- Keyboard ---

  it.each(['ArrowDown', 'ArrowUp'])('%s on a closed select opens it on the first enabled option', (key) => {
    const el = createSelect({ options: [
      { value: 'a', label: 'A', disabled: true },
      { value: 'b', label: 'B' },
      { value: 'c', label: 'C' },
    ] });
    /** @type {{ value: string, label: string }[]} */
    const received = [];
    el.addEventListener('change', (e) => received.push(/** @type {CustomEvent} */ (e).detail));
    expect(el.isOpen).toBe(false);

    const press = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    getTrigger(el).dispatchEvent(press);

    expect(el.isOpen).toBe(true);
    expect(getMenu(el).hidden).toBe(false);
    expect(press.defaultPrevented).toBe(true); // the arrow must not scroll the page
    // Opening consumes the key: the highlight starts on the first enabled option
    // for both arrows, and nothing is selected yet.
    expect(getOptions(el).map((o) => o.classList.contains('active'))).toEqual([false, true, false]);
    expect(received).toEqual([]);
    expect(el.value).toBe('');
  });

  it.each(['ArrowDown', 'ArrowUp'])('%s opens a closed searchable select from its input', (key) => {
    const el = createSelect({ searchable: true, options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] });
    expect(el.isOpen).toBe(false);

    const press = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    getTrigger(el).dispatchEvent(press);

    expect(el.isOpen).toBe(true);
    expect(press.defaultPrevented).toBe(true);
    expect(getOptions(el)[0].classList.contains('active')).toBe(true);
  });

  it.each(['ArrowDown', 'ArrowUp'])('%s leaves a disabled select closed', (key) => {
    const el = createSelect({ disabled: true, options: [{ value: 'a', label: 'A' }] });
    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    expect(el.isOpen).toBe(false);
    expect(getMenu(el).hidden).toBe(true);
  });

  it('ArrowDown/Up navigates options', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }, { value: 'c', label: 'C' }] });
    el.open();

    const opts = getOptions(el);
    expect(opts[0].classList.contains('active')).toBe(true);

    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(opts[1].classList.contains('active')).toBe(true);
    expect(opts[0].classList.contains('active')).toBe(false);

    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(opts[0].classList.contains('active')).toBe(true);
  });

  it('ArrowDown/Up wraps around at ends', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] });
    el.open();

    const opts = getOptions(el);
    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(opts[1].classList.contains('active')).toBe(true);

    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(opts[0].classList.contains('active')).toBe(true);

    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(opts[1].classList.contains('active')).toBe(true);
  });

  it('keyboard skips disabled options', () => {
    const el = createSelect({ options: [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B', disabled: true },
      { value: 'c', label: 'C' },
    ] });
    el.open();

    const opts = getOptions(el);
    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(opts[2].classList.contains('active')).toBe(true);
  });

  it('Enter selects highlighted option', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] });
    el.open();

    /** @type {{ value: string, label: string }[]} */

    const received = [];
    el.addEventListener('change', (e) => received.push(/** @type {CustomEvent} */ (e).detail));

    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    expect(received).toHaveLength(1);
    expect(received[0].value).toBe('b');
    expect(el.isOpen).toBe(false);
  });

  it('Tab closes the menu', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }] });
    el.open();
    expect(el.isOpen).toBe(true);
    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(el.isOpen).toBe(false);
  });

  it('Tab closes the menu when there are no options', () => {
    const el = createSelect({ options: [] });
    el.open();
    expect(el.isOpen).toBe(true);
    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(el.isOpen).toBe(false);
  });

  it('letter key jumps to matching option (non-searchable)', () => {
    const el = createSelect({ options: [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
      { value: 'c', label: 'Charlie' },
    ] });
    el.open();

    const opts = getOptions(el);
    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
    expect(opts[1].classList.contains('active')).toBe(true);
  });

  it('repeated same letter cycles through matches', () => {
    const el = createSelect({ options: [
      { value: 'a1', label: 'Apple' },
      { value: 'b', label: 'Banana' },
      { value: 'a2', label: 'Avocado' },
    ] });
    el.open();

    const opts = getOptions(el);
    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(opts[0].classList.contains('active')).toBe(true);

    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(opts[2].classList.contains('active')).toBe(true);

    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(opts[0].classList.contains('active')).toBe(true);
  });

  // Regression for finding #8791: cycle state survived close(), so the first
  // matching option became unreachable after its first use.
  it('letter-jump restarts after close so the first match is reachable again', () => {
    const el = createSelect({ options: [
      { value: 'a1', label: 'Apple' },
      { value: 'b', label: 'Banana' },
      { value: 'a2', label: 'Avocado' },
    ] });
    el.open();

    const opts = getOptions(el);
    const trigger = getTrigger(el);
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(opts[0].classList.contains('active')).toBe(true);

    el.close();
    el.open();
    trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    expect(opts[0].classList.contains('active')).toBe(true);
    expect(opts[2].classList.contains('active')).toBe(false);
  });

  it('letter-jump restarts after a 1s idle gap (native select typeahead)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const el = createSelect({ options: [
        { value: 'a1', label: 'Apple' },
        { value: 'b', label: 'Banana' },
        { value: 'a2', label: 'Avocado' },
      ] });
      el.open();

      const opts = getOptions(el);
      const trigger = getTrigger(el);
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(opts[0].classList.contains('active')).toBe(true);

      vi.advanceTimersByTime(TYPEAHEAD_TIMEOUT_MS);
      trigger.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(opts[0].classList.contains('active')).toBe(true);
      expect(opts[2].classList.contains('active')).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  // --- Groups ---

  it('group headers render', () => {
    const el = createSelect({ groups: [
      { label: 'Fruits', options: [{ value: 'apple', label: 'Apple' }] },
    ] });
    const headers = [...getMenu(el).querySelectorAll('.group-header')];
    expect(headers).toHaveLength(1);
    expect(headers[0].textContent).toBe('Fruits');
  });

  it('keyboard skips group headers', () => {
    const el = createSelect({ groups: [
      { label: 'Group A', options: [{ value: 'a', label: 'A' }] },
      { label: 'Group B', options: [{ value: 'b', label: 'B' }] },
    ] });
    el.open();

    const opts = getOptions(el);
    expect(opts[0].classList.contains('active')).toBe(true);

    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(opts[1].classList.contains('active')).toBe(true);
  });
});
