// @vitest-environment jsdom
// Tests for mountShadow: the shadow-root mount order, the init argument, and that no component bypasses it
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { mountShadow } from './mount-shadow.js';
import { shadowStyles } from './shadow-styles.js';

const COMPONENTS_DIR = join(import.meta.dirname, '..');

function makeTemplate(html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mountShadow', () => {
  it('opens an open shadow root holding a clone of the template', () => {
    const template = makeTemplate('<span id="a"></span>');
    const host = document.createElement('div');
    mountShadow(host, shadowStyles(':host {}'), template);
    expect(host.shadowRoot.mode).toBe('open');
    expect(host.shadowRoot.querySelector('#a')).not.toBeNull();
    expect(template.content.querySelector('#a')).not.toBeNull();
  });

  it('gives each host its own copy of the template', () => {
    const template = makeTemplate('<span></span>');
    const styles = shadowStyles(':host {}');
    const a = document.createElement('div');
    const b = document.createElement('div');
    mountShadow(a, styles, template);
    mountShadow(b, styles, template);
    expect(a.shadowRoot.querySelector('span')).not.toBe(b.shadowRoot.querySelector('span'));
  });

  it('adopts the styles before the template content goes in', () => {
    const template = makeTemplate('<span></span>');
    const host = document.createElement('div');
    let childrenAtAdopt = -1;
    mountShadow(host, { adopt: (root) => { childrenAtAdopt = root.childNodes.length; } }, template);
    expect(childrenAtAdopt).toBe(0);
    expect(host.shadowRoot.querySelector('span')).not.toBeNull();
  });

  it('passes a custom init through to attachShadow', () => {
    const attach = vi.spyOn(HTMLElement.prototype, 'attachShadow');
    const host = document.createElement('div');
    const init = { mode: 'open', delegatesFocus: true };
    mountShadow(host, shadowStyles(':host {}'), makeTemplate(''), init);
    expect(attach).toHaveBeenCalledWith(init);
  });
});

describe('components', () => {
  it('base-select keeps delegatesFocus on its shadow root', async () => {
    await import('../select/select.js');
    const attach = vi.spyOn(HTMLElement.prototype, 'attachShadow');
    document.createElement('base-select');
    expect(attach).toHaveBeenCalledWith({ mode: 'open', delegatesFocus: true });
  });

  it('attach shadow roots only through mountShadow', () => {
    const offenders = readdirSync(COMPONENTS_DIR, { recursive: true })
      .map((entry) => join(COMPONENTS_DIR, entry))
      .filter((path) => path.endsWith('.js') && !path.endsWith('.test.js'))
      .filter((path) => !path.endsWith('mount-shadow.js'))
      .filter((path) => readFileSync(path, 'utf8').includes('attachShadow('))
      .map((path) => relative(COMPONENTS_DIR, path));
    expect(offenders).toEqual([]);
  });
});
