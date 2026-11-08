// @vitest-environment jsdom
// <base-select> core: open/close, selection and value, dynamic options, size variant
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { createSelect, getMenu, getTrigger, getOptions } from './select-test-helpers.js';

beforeAll(async () => {
  await import('./select.js');
});

describe('base-select', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  // --- Core ---

  it('menu is hidden by default', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }] });
    expect(el.isOpen).toBe(false);
    expect(getMenu(el).hidden).toBe(true);
  });

  it('click opens the menu', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }] });
    getTrigger(el).click();
    expect(el.isOpen).toBe(true);
    expect(getMenu(el).hidden).toBe(false);
  });

  it('click option fires change event with value and label', () => {
    const el = createSelect({ options: [{ value: 'foo', label: 'Foo' }] });
    getTrigger(el).click();

    const received = [];
    el.addEventListener('change', (e) => received.push(e.detail));

    getOptions(el)[0].click();
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ value: 'foo', label: 'Foo' });
  });

  it('click option closes menu', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }] });
    getTrigger(el).click();
    expect(el.isOpen).toBe(true);
    getOptions(el)[0].click();
    expect(el.isOpen).toBe(false);
  });

  it('click option updates value', () => {
    const el = createSelect({ options: [{ value: 'bar', label: 'Bar' }] });
    getTrigger(el).click();
    getOptions(el)[0].click();
    expect(el.value).toBe('bar');
  });

  it('trigger shows selected label', () => {
    const el = createSelect({ options: [{ value: 'x', label: 'X Label' }] });
    getTrigger(el).click();
    getOptions(el)[0].click();
    const trigger = getTrigger(el);
    expect(trigger.textContent).toContain('X Label');
  });

  it('trigger shows placeholder when empty', () => {
    const el = createSelect({ placeholder: 'Pick one', options: [{ value: 'a', label: 'A' }] });
    const trigger = getTrigger(el);
    expect(trigger.textContent).toContain('Pick one');
  });

  it('selectedOption returns matching element', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }, { value: 'b', label: 'B' }] });
    el.value = 'b';
    expect(el.selectedOption).toBe(el.querySelectorAll('base-option')[1]);
  });

  it('selectedOption returns null when no match', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }] });
    el.value = 'nonexistent';
    expect(el.selectedOption).toBeNull();
  });

  // Regression for audit #6281: interpolating value into a CSS attribute
  // selector (base-option[value="…"]) throws SyntaxError on " or \, which
  // aborts #syncTriggerText mid-_selectOption (menu stuck open, no change).
  it('selectedOption survives quote and backslash in value (click path)', () => {
    const tricky = 'say"hi\\there';
    const el = createSelect({
      options: [
        { value: 'safe', label: 'Safe' },
        { value: tricky, label: 'Tricky Label' },
      ],
    });

    el.open();
    const received = [];
    el.addEventListener('change', (e) => received.push(e.detail));

    const opt = getOptions(el).find((o) => o.dataset.value === tricky);
    expect(opt).toBeTruthy();
    opt.click();

    expect(received).toEqual([{ value: tricky, label: 'Tricky Label' }]);
    expect(el.isOpen).toBe(false);
    expect(el.value).toBe(tricky);
    expect(el.selectedOption).toBe(el.querySelectorAll('base-option')[1]);
    expect(getTrigger(el).textContent).toContain('Tricky Label');
  });

  it('selectedOption survives quote and backslash in value (programmatic set)', () => {
    const tricky = 'say"hi\\there';
    const el = createSelect({
      options: [
        { value: 'safe', label: 'Safe' },
        { value: tricky, label: 'Tricky Label' },
      ],
    });
    el.value = tricky;
    expect(el.selectedOption).toBe(el.querySelectorAll('base-option')[1]);
    expect(getTrigger(el).textContent).toContain('Tricky Label');
  });

  it('programmatic value set updates trigger', () => {
    const el = createSelect({ options: [{ value: 'x', label: 'X Label' }] });
    el.value = 'x';
    const trigger = getTrigger(el);
    expect(trigger.textContent).toContain('X Label');
  });

  it('click outside closes menu', async () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }] });
    getTrigger(el).click();
    expect(el.isOpen).toBe(true);
    await Promise.resolve(); // outside-click listener attaches on the next microtask
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(el.isOpen).toBe(false);
  });

  it('stays open when opened from inside an external bubbling click (#1866)', async () => {
    const el = createSelect({ searchable: true, options: [{ value: 'a', label: 'Apple' }, { value: 'b', label: 'Banana' }] });

    // An unrelated control opens the select inside ITS click handler; that
    // opening click then keeps bubbling up to document. A synchronously-attached
    // outside-click listener would catch it and slam the menu shut the same tick.
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.addEventListener('click', () => el.open());

    opener.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(el.isOpen).toBe(true);
    expect(getMenu(el).hidden).toBe(false);

    // Once the opening click is done, the outside-click listener is live, so a
    // LATER outside click still closes the menu.
    await Promise.resolve();
    expect(el.isOpen).toBe(true);
    document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(el.isOpen).toBe(false);
  });

  it('Escape closes menu', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }] });
    getTrigger(el).click();
    expect(el.isOpen).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(el.isOpen).toBe(false);
  });

  it('open() and close() work programmatically', () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }] });
    el.open();
    expect(el.isOpen).toBe(true);
    el.close();
    expect(el.isOpen).toBe(false);
  });

  it('disabled prevents opening', () => {
    const el = createSelect({ disabled: true, options: [{ value: 'a', label: 'A' }] });
    getTrigger(el).click();
    expect(el.isOpen).toBe(false);
  });

  it('disconnect removes document listeners — no leak on a detached element', async () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }] });
    el.open();
    await Promise.resolve(); // let the deferred outside-click listener attach
    expect(el.isOpen).toBe(true);

    // Detach the element. disconnectedCallback() must remove BOTH the document
    // 'click' and 'keydown' listeners; a leak would let these stray document
    // events still reach close() — silently accumulating handlers in long-lived
    // apps that mount/unmount selects.
    el.remove();

    expect(() => {
      document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    }).not.toThrow();

    // Listeners were detached, so neither event invoked close(): the detached
    // element's open state is untouched (a leak would have flipped it to false).
    expect(el.isOpen).toBe(true);
  });

  // --- Dynamic options ---

  it('MutationObserver rebuilds menu on child add', async () => {
    const el = createSelect({ options: [{ value: 'a', label: 'A' }] });
    expect(getOptions(el)).toHaveLength(1);

    const o = document.createElement('base-option');
    o.setAttribute('value', 'b');
    o.textContent = 'B';
    el.appendChild(o);

    await new Promise(r => setTimeout(r, 0));
    expect(getOptions(el)).toHaveLength(2);
  });

  // --- Size variant ---

  it('sm size applies sm class to trigger', () => {
    const el = createSelect({ size: 'sm', options: [{ value: 'a', label: 'A' }] });
    const trigger = getTrigger(el);
    expect(trigger.classList.contains('sm')).toBe(true);
  });
});
