// @vitest-environment jsdom
// <base-select> action options: the '...' button, option-action event, clean labels
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createSelect, getTrigger, getOptions } from './select-test-helpers.js';

beforeAll(async () => {
  await import('./select.js');
});

describe('base-select action options', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  // --- Action variant ---

  it('option with action attribute renders an action button', () => {
    const el = createSelect({ options: [{ value: 'foo', label: 'Foo', action: true }] });
    const div = getOptions(el)[0];
    expect(div.classList.contains('has-action')).toBe(true);
    const btn = div.querySelector('.action-btn');
    expect(btn).toBeTruthy();
    expect(btn.tagName).toBe('BUTTON');
  });

  it('non-action option renders no action button', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }] });
    const div = getOptions(el)[0];
    expect(div.classList.contains('has-action')).toBe(false);
    expect(div.querySelector('.action-btn')).toBeNull();
  });

  it('clicking action button dispatches option-action with value, label and anchor', () => {
    const el = createSelect({ options: [{ value: 'foo', label: 'Foo', action: true }] });
    getTrigger(el).click();

    const received = [];
    el.addEventListener('option-action', (e) => received.push(e));

    const btn = getOptions(el)[0].querySelector('.action-btn');
    btn.click();

    expect(received).toHaveLength(1);
    expect(received[0].detail).toEqual({ value: 'foo', label: 'Foo', anchor: btn });
    expect(received[0].target).toBe(el);
  });

  it('selecting an action option fires change with the clean label, not the action affordance text', () => {
    const el = createSelect({ options: [{ value: 'foo', label: 'Foo', action: true }] });
    getTrigger(el).click();

    const changes = [];
    el.addEventListener('change', (e) => changes.push(e.detail));

    // Click the option div itself (not the action-btn) to select it normally.
    getOptions(el)[0].click();

    expect(changes).toHaveLength(1);
    // div.textContent would be 'Foo...' (label span + action-btn '...'); the
    // change label must be the clean 'Foo'.
    expect(changes[0]).toEqual({ value: 'foo', label: 'Foo' });
  });

  it('action button click does not trigger normal selection', () => {
    const el = createSelect({ options: [{ value: 'foo', label: 'Foo', action: true }] });
    getTrigger(el).click();

    const changes = [];
    el.addEventListener('change', (e) => changes.push(e.detail));

    getOptions(el)[0].querySelector('.action-btn').click();

    expect(changes).toHaveLength(0);
    expect(el.value).toBe('');
    expect(el.isOpen).toBe(true);
  });
});
