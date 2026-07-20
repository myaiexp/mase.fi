// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

beforeAll(async () => {
  await import('./select.js');
});

function createSelect({ options = [], groups = [], placeholder = '', searchable = false, disabled = false, size = '', value = '' } = {}) {
  const el = document.createElement('base-select');
  if (placeholder) el.setAttribute('placeholder', placeholder);
  if (searchable) el.setAttribute('searchable', '');
  if (disabled) el.setAttribute('disabled', '');
  if (size) el.setAttribute('size', size);
  if (value) el.setAttribute('value', value);

  for (const opt of options) {
    const o = document.createElement('base-option');
    o.setAttribute('value', opt.value);
    if (opt.disabled) o.setAttribute('disabled', '');
    if (opt.action) o.setAttribute('action', '');
    o.textContent = opt.label ?? opt.value;
    el.appendChild(o);
  }

  for (const group of groups) {
    const g = document.createElement('base-option-group');
    g.setAttribute('label', group.label);
    for (const opt of group.options) {
      const o = document.createElement('base-option');
      o.setAttribute('value', opt.value);
      if (opt.disabled) o.setAttribute('disabled', '');
      o.textContent = opt.label ?? opt.value;
      g.appendChild(o);
    }
    el.appendChild(g);
  }

  document.body.appendChild(el);
  return el;
}

function getMenu(el) {
  return el.shadowRoot.querySelector('[part="menu"]');
}

function getTrigger(el) {
  return el.shadowRoot.querySelector('[part="trigger"]');
}

function getOptions(el) {
  return [...getMenu(el).querySelectorAll('.option')];
}

describe('base-option', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('value property returns value attribute', () => {
    const o = document.createElement('base-option');
    o.setAttribute('value', 'foo');
    document.body.appendChild(o);
    expect(o.value).toBe('foo');
  });

  it('label property returns trimmed textContent', () => {
    const o = document.createElement('base-option');
    o.textContent = '  Hello World  ';
    document.body.appendChild(o);
    expect(o.label).toBe('Hello World');
  });

  it('disabled property reflects attribute', () => {
    const o = document.createElement('base-option');
    document.body.appendChild(o);
    expect(o.disabled).toBe(false);
    o.setAttribute('disabled', '');
    expect(o.disabled).toBe(true);
  });
});

describe('base-option-group', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('label property returns label attribute', () => {
    const g = document.createElement('base-option-group');
    g.setAttribute('label', 'My Group');
    document.body.appendChild(g);
    expect(g.label).toBe('My Group');
  });
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

  // --- Keyboard ---

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

    const received = [];
    el.addEventListener('change', (e) => received.push(e.detail));

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

  // --- Auto-flip ---

  it('adds flip class when near bottom', () => {
    const el = createSelect({ options: [{ value: 'x', label: 'X' }] });

    el.getBoundingClientRect = () => ({
      top: 900, bottom: 940, left: 0, right: 100, width: 100, height: 40,
    });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    el.open();
    expect(getMenu(el).classList.contains('flip')).toBe(true);
    delete el.getBoundingClientRect;
  });

  it('no flip class when space available', () => {
    const el = createSelect({ options: [{ value: 'x', label: 'X' }] });

    // spaceBelow = 768 - 518 = 250, just clears the 200px estimate. Boundary-
    // sensitive: bumping MENU_HEIGHT_ESTIMATE to 300 would flip this RED.
    el.getBoundingClientRect = () => ({
      top: 478, bottom: 518, left: 0, right: 100, width: 100, height: 40,
    });
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true });

    el.open();
    expect(getMenu(el).classList.contains('flip')).toBe(false);
    delete el.getBoundingClientRect;
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

  // --- Size variant ---

  it('sm size applies sm class to trigger', () => {
    const el = createSelect({ size: 'sm', options: [{ value: 'a', label: 'A' }] });
    const trigger = getTrigger(el);
    expect(trigger.classList.contains('sm')).toBe(true);
  });

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

// The control sizes to its widest option rather than filling its container, so a
// hidden sizer carries every label the trigger could display. jsdom has no layout
// engine — these assert the DOM contract the CSS grid then measures.
describe('base-select intrinsic sizing', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  function getSizer(el) {
    return el.shadowRoot.querySelector('.sizer');
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
