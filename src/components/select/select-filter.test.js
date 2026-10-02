// @vitest-environment jsdom
// <base-select> search filter and letter-jump match on the option label only —
// an action option's '...' button text must never match.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

beforeAll(async () => {
  await import('./select.js');
});

afterEach(() => { document.body.innerHTML = ''; });

function createSelect(options, { searchable = false } = {}) {
  const el = document.createElement('base-select');
  if (searchable) el.setAttribute('searchable', '');
  for (const opt of options) {
    const o = document.createElement('base-option');
    o.setAttribute('value', opt.value);
    if (opt.action) o.setAttribute('action', '');
    o.textContent = opt.label;
    el.appendChild(o);
  }
  document.body.appendChild(el);
  return el;
}

const trigger = (el) => el.shadowRoot.querySelector('[part="trigger"]');
const visibleLabels = (el) => [...el.shadowRoot.querySelectorAll('[part="menu"] .option')]
  .filter((o) => o.style.display !== 'none')
  .map((o) => o.dataset.label);

describe('base-select label matching', () => {
  it('does not match an action option through its "..." button text', () => {
    const el = createSelect([
      { value: 'a', label: 'Apple', action: true },
      { value: 'b', label: 'Banana' },
    ], { searchable: true });
    el.open();
    const input = trigger(el);
    input.value = '.';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(visibleLabels(el)).toEqual([]);
  });

  it('still matches an action option by its label', () => {
    const el = createSelect([
      { value: 'a', label: 'Apple', action: true },
      { value: 'b', label: 'Banana' },
    ], { searchable: true });
    el.open();
    const input = trigger(el);
    input.value = 'ppl';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(visibleLabels(el)).toEqual(['Apple']);
  });

  it('letter-jumps to an action option by its label', () => {
    const el = createSelect([
      { value: 'a', label: 'Apple' },
      { value: 'b', label: 'Banana', action: true },
    ]);
    el.open();
    trigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
    const highlighted = el.shadowRoot.querySelector('[part="menu"] .option.active');
    expect(highlighted?.dataset.label).toBe('Banana');
  });
});
