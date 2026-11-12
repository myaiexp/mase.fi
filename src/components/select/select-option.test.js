// @vitest-environment jsdom
// <base-option> / <base-option-group> getters, including the empty-string
// fallbacks other apps get when they omit the value or label attribute.
import { describe, it, expect, afterEach } from 'vitest';
import './select-option.js';
/** @import { BaseOption, BaseOptionGroup } from './select-option.js' */

describe('base-option', () => {
  afterEach(() => { document.body.replaceChildren(); });

  it('value property returns value attribute', () => {
    const o = /** @type {BaseOption} */ (document.createElement('base-option'));
    o.setAttribute('value', 'foo');
    document.body.appendChild(o);
    expect(o.value).toBe('foo');
  });

  it('value is an empty string, never null, when the attribute is absent', () => {
    const o = /** @type {BaseOption} */ (document.createElement('base-option'));
    document.body.appendChild(o);
    expect(o.value).toBe('');
  });

  it('label property returns trimmed textContent', () => {
    const o = /** @type {BaseOption} */ (document.createElement('base-option'));
    o.textContent = '  Hello World  ';
    document.body.appendChild(o);
    expect(o.label).toBe('Hello World');
  });

  it('disabled and action properties reflect their attributes', () => {
    const o = /** @type {BaseOption} */ (document.createElement('base-option'));
    document.body.appendChild(o);
    expect(o.disabled).toBe(false);
    expect(o.action).toBe(false);
    o.setAttribute('disabled', '');
    o.setAttribute('action', '');
    expect(o.disabled).toBe(true);
    expect(o.action).toBe(true);
  });
});

describe('base-option-group', () => {
  afterEach(() => { document.body.replaceChildren(); });

  it('label property returns label attribute', () => {
    const g = /** @type {BaseOptionGroup} */ (document.createElement('base-option-group'));
    g.setAttribute('label', 'My Group');
    document.body.appendChild(g);
    expect(g.label).toBe('My Group');
  });

  it('label is an empty string, never null, when the attribute is absent', () => {
    const g = /** @type {BaseOptionGroup} */ (document.createElement('base-option-group'));
    document.body.appendChild(g);
    expect(g.label).toBe('');
  });
});
