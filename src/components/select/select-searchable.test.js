// @vitest-environment jsdom
// <base-select searchable>: typed filtering, no-matches state, close/reset of the query
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createSelect, getMenu, getTrigger, getOptions } from './select-test-helpers.js';

beforeAll(async () => {
  await import('./select.js');
});

describe('base-select searchable', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  // --- Searchable ---

  it('renders input instead of button when searchable', () => {
    const el = createSelect({ searchable: true, options: [{ value: 'a', label: 'A' }] });
    const trigger = getTrigger(el);
    expect(trigger.tagName).toBe('INPUT');
  });

  it('letter key does NOT jump in searchable mode (input handles typing)', () => {
    // Non-searchable, 'b' would letter-jump the highlight to Banana (index 1).
    // Searchable mode guards that off (the input field owns typed characters), so
    // the highlight must stay where open() put it — the first option, Apple.
    const el = createSelect({ searchable: true, options: [
      { value: 'a', label: 'Apple' },
      { value: 'b', label: 'Banana' },
    ] });
    el.open();

    const opts = getOptions(el);
    expect(opts[0].classList.contains('active')).toBe(true);

    getTrigger(el).dispatchEvent(new KeyboardEvent('keydown', { key: 'b', bubbles: true }));
    expect(opts[0].classList.contains('active')).toBe(true);  // unmoved — no jump
    expect(opts[1].classList.contains('active')).toBe(false); // Banana NOT jumped to
  });

  // Insert `ch` the way a keystroke does: replace the current selection, or
  // insert at the caret when the selection is collapsed.
  function insertText(input, ch) {
    input.setRangeText(ch, input.selectionStart, input.selectionEnd, 'end');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('first typed character replaces the selected label instead of joining it', () => {
    const el = createSelect({ searchable: true, value: 'a', options: [
      { value: 'a', label: 'Apple' },
      { value: 'b', label: 'Banana' },
    ] });
    const input = getTrigger(el);
    expect(input.value).toBe('Apple');

    input.dispatchEvent(new Event('focus'));
    expect(el.isOpen).toBe(true);
    insertText(input, 'b');

    expect(input.value).toBe('b');
    const visible = getOptions(el).filter(o => o.style.display !== 'none');
    expect(visible.map(o => o.dataset.label)).toEqual(['Banana']);
  });

  it('clicking into the selected label still filters on the one character typed', () => {
    const el = createSelect({ searchable: true, value: 'a', options: [
      { value: 'a', label: 'Apple' },
      { value: 'b', label: 'Banana' },
    ] });
    const input = getTrigger(el);

    // Focus opens, then the click's default action drops the caret into the label.
    input.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    input.dispatchEvent(new Event('focus'));
    const mid = Math.floor(input.value.length / 2);
    input.setSelectionRange(mid, mid);
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    insertText(input, 'b');

    expect(input.value).toBe('b');
    const visible = getOptions(el).filter(o => o.style.display !== 'none');
    expect(visible.map(o => o.dataset.label)).toEqual(['Banana']);
  });

  it('a second open() does not wipe an in-progress query', () => {
    const el = createSelect({ searchable: true, value: 'a', options: [
      { value: 'a', label: 'Apple' },
      { value: 'b', label: 'Banana' },
    ] });
    el.open();
    const input = getTrigger(el);
    expect(input.value).toBe('');

    input.value = 'ban';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    el.open();

    expect(input.value).toBe('ban');
    const visible = getOptions(el).filter(o => o.style.display !== 'none');
    expect(visible.map(o => o.dataset.label)).toEqual(['Banana']);
  });

  it('typing filters options', () => {
    const el = createSelect({ searchable: true, options: [
      { value: 'a', label: 'Apple' },
      { value: 'b', label: 'Banana' },
    ] });
    el.open();

    const input = getTrigger(el);
    input.value = 'app';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const opts = getOptions(el);
    const visible = opts.filter(o => o.style.display !== 'none');
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toBe('Apple');
  });

  it('filters case-insensitively', () => {
    const el = createSelect({ searchable: true, options: [
      { value: 'a', label: 'Apple' },
      { value: 'b', label: 'Banana' },
    ] });
    el.open();

    const input = getTrigger(el);
    input.value = 'BANANA';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const visible = getOptions(el).filter(o => o.style.display !== 'none');
    expect(visible).toHaveLength(1);
    expect(visible[0].textContent).toBe('Banana');
  });

  it('group headers hide when all options hidden', () => {
    const el = createSelect({ searchable: true, groups: [
      { label: 'Fruits', options: [{ value: 'a', label: 'Apple' }] },
      { label: 'Vegs', options: [{ value: 'c', label: 'Carrot' }] },
    ] });
    el.open();

    const input = getTrigger(el);
    input.value = 'carrot';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const headers = [...getMenu(el).querySelectorAll('.group-header')];
    expect(headers[0].style.display).toBe('none');
    expect(headers[1].style.display).not.toBe('none');
  });

  it('shows no-matches when all filtered out', () => {
    const el = createSelect({ searchable: true, options: [{ value: 'a', label: 'Apple' }] });
    el.open();

    const input = getTrigger(el);
    input.value = 'zzz';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    const noMatch = getMenu(el).querySelector('.no-matches');
    expect(noMatch).toBeTruthy();
    expect(noMatch.style.display).not.toBe('none');
  });

  it('Tab closes a searchable select showing no matches', () => {
    const el = createSelect({ searchable: true, options: [{ value: 'a', label: 'Apple' }] });
    el.open();

    const input = getTrigger(el);
    input.value = 'zzz';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(el.isOpen).toBe(true);
    expect(getMenu(el).querySelector('.no-matches').style.display).not.toBe('none');

    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
    expect(el.isOpen).toBe(false);
  });

  it('clearing input shows all options', () => {
    const el = createSelect({ searchable: true, options: [
      { value: 'a', label: 'Apple' },
      { value: 'b', label: 'Banana' },
    ] });
    el.open();

    const input = getTrigger(el);
    input.value = 'apple';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(getOptions(el).filter(o => o.style.display !== 'none')).toHaveLength(1);

    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(getOptions(el).filter(o => o.style.display !== 'none')).toHaveLength(2);
  });

  it('focus opens menu in searchable mode', () => {
    const el = createSelect({ searchable: true, options: [{ value: 'a', label: 'A' }] });
    const input = getTrigger(el);
    input.dispatchEvent(new Event('focus'));
    expect(el.isOpen).toBe(true);
  });

  it('selection shows label in input', () => {
    const el = createSelect({ searchable: true, options: [{ value: 'a', label: 'Apple' }] });
    el.open();
    getOptions(el)[0].click();
    const input = getTrigger(el);
    expect(input.value).toBe('Apple');
  });

  it('close restores input to selected label after an abandoned search', () => {
    const el = createSelect({ searchable: true, value: 'a', options: [
      { value: 'a', label: 'Apple' },
      { value: 'b', label: 'Banana' },
    ] });
    el.open();

    const input = getTrigger(el);
    input.value = 'ban';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(input.value).toBe('ban');

    el.close();
    expect(input.value).toBe('Apple');
  });

  it('close clears input when nothing is selected', () => {
    const el = createSelect({ searchable: true, options: [{ value: 'a', label: 'Apple' }] });
    el.open();

    const input = getTrigger(el);
    input.value = 'app';
    input.dispatchEvent(new Event('input', { bubbles: true }));

    el.close();
    expect(input.value).toBe('');
  });

  it('close resets the filter so a fresh open shows all options', () => {
    const el = createSelect({ searchable: true, value: 'a', options: [
      { value: 'a', label: 'Apple' },
      { value: 'b', label: 'Banana' },
    ] });
    el.open();

    const input = getTrigger(el);
    input.value = 'ban';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(getOptions(el).filter(o => o.style.display !== 'none')).toHaveLength(1);

    el.close();
    el.open();
    // Filter abandoned: every option visible again (incl. the selected Apple,
    // which the restored input now displays) and no-matches stays hidden.
    expect(getOptions(el).filter(o => o.style.display !== 'none')).toHaveLength(2);
    expect(getMenu(el).querySelector('.no-matches').style.display).toBe('none');
  });

  it('close resets hidden group headers after a filtered search', () => {
    const el = createSelect({ searchable: true, groups: [
      { label: 'Fruits', options: [{ value: 'a', label: 'Apple' }] },
      { label: 'Vegs', options: [{ value: 'c', label: 'Carrot' }] },
    ] });
    el.open();

    const input = getTrigger(el);
    input.value = 'carrot';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    const headers = [...getMenu(el).querySelectorAll('.group-header')];
    expect(headers[0].style.display).toBe('none');

    el.close();
    el.open();
    expect(headers[0].style.display).toBe('');
    expect(headers[1].style.display).toBe('');
  });
});
