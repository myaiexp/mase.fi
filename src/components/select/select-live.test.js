// @vitest-environment jsdom
// Option edits after <base-select> connects: disabled, value, action, and label.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createSelect, getTrigger, getOptions, $ } from './select-test-helpers.js';

beforeAll(async () => {
  await import('./select.js');
});

// MutationObserver delivers on a microtask; the child-add suite flushes the same way.
function flushObserver() {
  return new Promise((r) => setTimeout(r, 0));
}

describe('base-select live option edits', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('does not select an option disabled after connect', async () => {
    const el = createSelect({ options: [
      { value: 'a', label: 'Alpha' },
      { value: 'b', label: 'Beta' },
    ] });
    $(el, 'base-option').setAttribute('disabled', '');
    await flushObserver();

    getTrigger(el).click();
    const row = getOptions(el)[0];
    expect(row.classList.contains('disabled')).toBe(true);
    row.click();
    expect(el.value).toBe('');
    getOptions(el)[1].click();
    expect(el.value).toBe('b');
  });

  it('commits a value attribute changed after connect', async () => {
    const el = createSelect({ options: [{ value: 'a', label: 'Alpha' }] });
    $(el, 'base-option').setAttribute('value', 'b');
    await flushObserver();

    getTrigger(el).click();
    getOptions(el)[0].click();
    expect(el.value).toBe('b');
  });

  it('shows an action button added after connect', async () => {
    const el = createSelect({ options: [{ value: 'a', label: 'Alpha' }] });
    $(el, 'base-option').setAttribute('action', '');
    await flushObserver();

    const btn = $(getOptions(el)[0], '.action-btn');
    expect(btn).not.toBeNull();
    /** @type {unknown[]} */
    const received = [];
    el.addEventListener('option-action', (e) => received.push(/** @type {CustomEvent} */ (e).detail));
    btn.click();
    expect(received).toEqual([{ value: 'a', label: 'Alpha', anchor: btn }]);
  });

  it('updates the closed trigger when a selected option\'s text changes', async () => {
    const el = createSelect({ value: 'a', options: [{ value: 'a', label: 'Alpha' }] });
    expect(getTrigger(el).textContent).toBe('Alpha');
    $(el, 'base-option').textContent = 'Beta';
    await flushObserver();
    expect(getTrigger(el).textContent).toBe('Beta');
  });
});
