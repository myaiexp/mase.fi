// Pins the published custom-element surface of dist/base-components.js
// @vitest-environment jsdom
import { describe, it, expect, beforeAll } from 'vitest';

// Every tag `customElements.define`d from a file this entry imports. Toast is
// a static `window.BaseToast` API, not a tag — asserted separately below.
const REGISTERED_TAGS = [
  'base-badge',
  'base-modal',
  'base-tabs',
  'base-tab',
  'base-dropdown',
  'base-dropdown-item',
  'base-dropdown-divider',
  'base-select',
  'base-option',
  'base-option-group',
  'base-text-fit',
  'base-context-menu',
];

describe('base-components library entry', () => {
  beforeAll(async () => {
    await import('./index.js');
  });

  it.each(REGISTERED_TAGS)('registers <%s>', (tag) => {
    expect(customElements.get(tag)).toBeDefined();
  });

  it('exposes window.BaseToast (static API, no tag)', () => {
    expect(typeof window.BaseToast?.show).toBe('function');
  });
});
