// @vitest-environment jsdom
// <base-tabs> tests: rendering, selection, keyboard nav, tab-change, ARIA panel wiring
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import {
  createTabs,
  shadowQ,
  shadowAll,
  tabButtons,
  collectTabChanges,
} from './tabs-test-helpers.js';

beforeAll(async () => {
  await import('./tabs.js');
});

afterEach(() => {
  document.body.innerHTML = '';
});

describe('base-tabs', () => {
  it('renders tab buttons from child base-tab labels', () => {
    const { tabs } = createTabs([
      { label: 'Alpha' },
      { label: 'Beta' },
      { label: 'Gamma' },
    ]);
    const bar = shadowQ(tabs, '[role="tablist"]');
    expect(bar).toBeTruthy();
    const buttons = tabButtons(tabs);
    expect(buttons.length).toBe(3);
    expect((buttons[0].textContent ?? '').trim()).toBe('Alpha');
    expect((buttons[1].textContent ?? '').trim()).toBe('Beta');
    expect((buttons[2].textContent ?? '').trim()).toBe('Gamma');
  });

  it('first tab is active by default', () => {
    const { tabs } = createTabs([
      { label: 'One' },
      { label: 'Two' },
    ]);
    expect(tabs.activeIndex).toBe(0);
    const buttons = tabButtons(tabs);
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
    expect(buttons[1].getAttribute('aria-selected')).toBe('false');
  });

  it('clicking tab button switches active panel', () => {
    const { tabs } = createTabs([
      { label: 'First', content: 'Panel 1' },
      { label: 'Second', content: 'Panel 2' },
    ]);
    const buttons = tabButtons(tabs);
    buttons[1].click();
    expect(tabs.activeIndex).toBe(1);
    expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    expect(buttons[0].getAttribute('aria-selected')).toBe('false');
  });

  it('selectTab(index) switches programmatically', () => {
    const { tabs } = createTabs([
      { label: 'A' },
      { label: 'B' },
      { label: 'C' },
    ]);
    tabs.selectTab(2);
    expect(tabs.activeIndex).toBe(2);
    const buttons = tabButtons(tabs);
    expect(buttons[2].getAttribute('aria-selected')).toBe('true');
    expect(buttons[0].getAttribute('aria-selected')).toBe('false');
  });

  it('tab-change event fires with correct index and label', () => {
    const { tabs } = createTabs([
      { label: 'X' },
      { label: 'Y' },
    ]);
    const events = collectTabChanges(tabs);
    tabs.selectTab(1);
    expect(events.length).toBe(1);
    expect(events[0].index).toBe(1);
    expect(events[0].label).toBe('Y');
  });

  it('disabled tab cannot be selected', () => {
    const { tabs } = createTabs([
      { label: 'Enabled' },
      { label: 'Disabled', disabled: true },
    ]);
    tabs.selectTab(1);
    // Should remain on 0
    expect(tabs.activeIndex).toBe(0);
    const buttons = tabButtons(tabs);
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
  });

  it('arrow keys navigate between tabs', () => {
    const { tabs } = createTabs([
      { label: 'P' },
      { label: 'Q' },
      { label: 'R' },
    ]);
    const bar = shadowQ(tabs, '[role="tablist"]');
    // Start at 0, ArrowRight => 1
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(tabs.activeIndex).toBe(1);
    // ArrowRight => 2
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(tabs.activeIndex).toBe(2);
    // ArrowRight wraps => 0
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(tabs.activeIndex).toBe(0);
    // ArrowLeft wraps => 2
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    expect(tabs.activeIndex).toBe(2);
  });

  // nextEnabledIndex stops after one lap; a loop without that bound never
  // returns here and the key press hangs the page.
  it.each(['ArrowRight', 'ArrowLeft'])('%s returns without moving when every tab is disabled', (key) => {
    const { tabs } = createTabs([
      { label: 'P', disabled: true },
      { label: 'Q', disabled: true },
      { label: 'R', disabled: true },
    ]);
    const bar = shadowQ(tabs, '[role="tablist"]');
    const before = tabs.activeIndex;
    const events = collectTabChanges(tabs);

    bar.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));

    expect(tabs.activeIndex).toBe(before);
    expect(events).toEqual([]);
  });

  it.each([['Enter'], [' ']])('%j commits the focused tab and fires tab-change', (key) => {
    const { tabs } = createTabs([
      { label: 'P' },
      { label: 'Q' },
    ]);
    const bar = shadowQ(tabs, '[role="tablist"]');
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    const events = collectTabChanges(tabs);

    const press = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
    bar.dispatchEvent(press);

    expect(events).toEqual([{ index: 1, label: 'Q' }]);
    expect(press.defaultPrevented).toBe(true);
    const buttons = tabButtons(tabs);
    expect(buttons[1].getAttribute('aria-selected')).toBe('true');
  });

  it('active attribute on base-tab sets initial selection', () => {
    const { tabs } = createTabs([
      { label: 'First' },
      { label: 'Second', active: true },
      { label: 'Third' },
    ]);
    expect(tabs.activeIndex).toBe(1);
    const buttons = tabButtons(tabs);
    expect(buttons[1].getAttribute('aria-selected')).toBe('true');
    expect(buttons[0].getAttribute('aria-selected')).toBe('false');
  });

  it('user selection survives a rebuild triggered by a tab attribute change', () => {
    // Markup marks Second (index 1) active; user then clicks First (index 0).
    const { tabs, tabEls } = createTabs([
      { label: 'First' },
      { label: 'Second', active: true },
      { label: 'Third' },
    ]);
    expect(tabs.activeIndex).toBe(1);

    tabButtons(tabs)[0].click();
    expect(tabs.activeIndex).toBe(0);

    // A host app edits an unrelated tab's label — this fires attributeChanged-
    // Callback, which reruns _updateTabs (a full rebuild). The user's selection
    // must survive rather than snapping back to the originally-marked Second.
    tabEls[2].setAttribute('label', 'Third!');

    expect(tabs.activeIndex).toBe(0);
    const buttons = tabButtons(tabs);
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
    expect(buttons[1].getAttribute('aria-selected')).toBe('false');
  });
});

describe('base-tabs ARIA panel wiring', () => {
  it('gives each panel role=tabpanel and points the tab and the panel at each other', () => {
    const { tabs, tabEls } = createTabs([
      { label: 'Alpha' },
      { label: 'Beta' },
    ]);
    const buttons = shadowAll(tabs, '[role="tab"]');
    expect(buttons).toHaveLength(2);
    buttons.forEach((btn, i) => {
      const panelId = btn.getAttribute('aria-controls');
      expect(panelId).toBeTruthy();
      expect(tabEls[i].id).toBe(panelId);
      expect(tabEls[i].getAttribute('role')).toBe('tabpanel');
      expect(tabEls[i].getAttribute('aria-labelledby')).toBe(btn.id);
    });
    expect(new Set(buttons.map((b) => b.id)).size).toBe(2);
  });

  it('keeps an author-set panel id and the same button id across a rebuild', () => {
    const { tabs, tabEls } = createTabs([{ label: 'Alpha' }, { label: 'Beta' }]);
    tabEls[0].id = 'custom-panel';
    tabs._updateTabs();
    const btn = shadowQ(tabs, '[role="tab"]');
    expect(tabEls[0].id).toBe('custom-panel');
    expect(btn.getAttribute('aria-controls')).toBe('custom-panel');
    expect(tabEls[0].getAttribute('aria-labelledby')).toBe(btn.id);
    const buttonId = btn.id;
    tabs._updateTabs();
    const again = shadowQ(tabs, '[role="tab"]');
    expect(again.id).toBe(buttonId);
    expect(tabEls[0].getAttribute('aria-labelledby')).toBe(buttonId);
  });
});
