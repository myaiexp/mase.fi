// @vitest-environment jsdom
// Tests for upgradeProperties: properties set before custom-element definition reach the setters
import { describe, it, expect, beforeAll } from 'vitest';
import { upgradeProperties } from './upgrade-properties.js';

// Built BEFORE the component modules load, the way a consumer bundle hoisted
// into <head> runs ahead of the base-components.js <script>: the elements are
// still plain HTMLElements, so `.value =` / `.activeIndex =` create own props.
let select;
let tabs;

beforeAll(async () => {
  select = document.createElement('base-select');
  for (const [value, label] of [['low', 'Low'], ['normal', 'Normal'], ['high', 'High']]) {
    const o = document.createElement('base-option');
    o.setAttribute('value', value);
    o.textContent = label;
    select.appendChild(o);
  }
  select.value = 'high';
  document.body.appendChild(select);

  tabs = document.createElement('base-tabs');
  for (const label of ['one', 'two', 'three']) {
    const t = document.createElement('base-tab');
    t.setAttribute('label', label);
    tabs.appendChild(t);
  }
  tabs.activeIndex = 2;
  document.body.appendChild(tabs);

  expect(customElements.get('base-select')).toBeUndefined();
  await import('../select/select.js');
  await import('../tabs/tabs.js');
});

describe('pre-upgrade property writes', () => {
  it('base-select: value set before define goes through the setter', () => {
    expect(Object.hasOwn(select, 'value')).toBe(false);
    expect(select.getAttribute('value')).toBe('high');
    expect(select.value).toBe('high');
    expect(select.shadowRoot.querySelector('[part="trigger"]').textContent).toBe('High');
    expect(select.shadowRoot.querySelector('.option.selected').dataset.value).toBe('high');
  });

  it('base-select: later writes hit the setter, not a stale own property', () => {
    select.value = 'low';
    expect(select.getAttribute('value')).toBe('low');
    expect(select.selectedOption.label).toBe('Low');
  });

  it('base-tabs: activeIndex set before define selects that tab', () => {
    expect(Object.hasOwn(tabs, 'activeIndex')).toBe(false);
    expect(tabs.activeIndex).toBe(2);
    const selected = tabs.shadowRoot.querySelector('[aria-selected="true"]');
    expect(selected.textContent).toBe('three');
  });
});

describe('upgradeProperties', () => {
  it('replays only own props that shadow a setter, including inherited setters', () => {
    const seen = [];
    class Base extends HTMLElement {
      set inherited(v) { seen.push(['inherited', v]); }
    }
    class Probe extends Base {
      get readOnly() { return 'class'; }
      set own(v) { seen.push(['own', v]); }
    }
    customElements.define('probe-upgrade', Probe);
    const el = new Probe();
    Object.defineProperty(el, 'own', { value: 1, configurable: true, writable: true });
    Object.defineProperty(el, 'inherited', { value: 2, configurable: true, writable: true });
    el.unrelated = 3;
    upgradeProperties(el);
    expect(seen).toEqual([['own', 1], ['inherited', 2]]);
    expect(el.unrelated).toBe(3);
    expect(el.readOnly).toBe('class');
  });
});
