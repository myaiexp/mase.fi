// @vitest-environment jsdom
import { describe, it, expect, beforeAll, afterEach } from 'vitest';

beforeAll(async () => {
  await import('./tabs.js');
});

afterEach(() => {
  document.body.innerHTML = '';
});

// Helper: create a <base-tabs> with N <base-tab> children and append to body.
// Returns { tabs, tabEls } where tabEls are the <base-tab> elements.
function createTabs(defs = []) {
  const tabs = document.createElement('base-tabs');
  for (const def of defs) {
    const tab = document.createElement('base-tab');
    tab.setAttribute('label', def.label);
    if (def.active) tab.setAttribute('active', '');
    if (def.disabled) tab.setAttribute('disabled', '');
    tab.textContent = def.content ?? def.label + ' content';
    tabs.appendChild(tab);
  }
  document.body.appendChild(tabs);
  // Trigger initial scan (slotchange does not fire in jsdom)
  tabs._updateTabs();
  return { tabs, tabEls: Array.from(tabs.querySelectorAll('base-tab')) };
}

describe('base-tabs', () => {
  it('renders tab buttons from child base-tab labels', () => {
    const { tabs } = createTabs([
      { label: 'Alpha' },
      { label: 'Beta' },
      { label: 'Gamma' },
    ]);
    const bar = tabs.shadowRoot.querySelector('[role="tablist"]');
    expect(bar).toBeTruthy();
    const buttons = bar.querySelectorAll('button');
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent.trim()).toBe('Alpha');
    expect(buttons[1].textContent.trim()).toBe('Beta');
    expect(buttons[2].textContent.trim()).toBe('Gamma');
  });

  it('first tab is active by default', () => {
    const { tabs } = createTabs([
      { label: 'One' },
      { label: 'Two' },
    ]);
    expect(tabs.activeIndex).toBe(0);
    const buttons = tabs.shadowRoot.querySelectorAll('[role="tablist"] button');
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
    expect(buttons[1].getAttribute('aria-selected')).toBe('false');
  });

  it('clicking tab button switches active panel', () => {
    const { tabs } = createTabs([
      { label: 'First', content: 'Panel 1' },
      { label: 'Second', content: 'Panel 2' },
    ]);
    const buttons = tabs.shadowRoot.querySelectorAll('[role="tablist"] button');
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
    const buttons = tabs.shadowRoot.querySelectorAll('[role="tablist"] button');
    expect(buttons[2].getAttribute('aria-selected')).toBe('true');
    expect(buttons[0].getAttribute('aria-selected')).toBe('false');
  });

  it('tab-change event fires with correct index and label', () => {
    const { tabs } = createTabs([
      { label: 'X' },
      { label: 'Y' },
    ]);
    const events = [];
    tabs.addEventListener('tab-change', (e) => events.push(e.detail));
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
    const buttons = tabs.shadowRoot.querySelectorAll('[role="tablist"] button');
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
  });

  it('arrow keys navigate between tabs', () => {
    const { tabs } = createTabs([
      { label: 'P' },
      { label: 'Q' },
      { label: 'R' },
    ]);
    const bar = tabs.shadowRoot.querySelector('[role="tablist"]');
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

  it('active attribute on base-tab sets initial selection', () => {
    const { tabs } = createTabs([
      { label: 'First' },
      { label: 'Second', active: true },
      { label: 'Third' },
    ]);
    expect(tabs.activeIndex).toBe(1);
    const buttons = tabs.shadowRoot.querySelectorAll('[role="tablist"] button');
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

    tabs.shadowRoot.querySelectorAll('[role="tablist"] button')[0].click();
    expect(tabs.activeIndex).toBe(0);

    // A host app edits an unrelated tab's label — this fires attributeChanged-
    // Callback, which reruns _updateTabs (a full rebuild). The user's selection
    // must survive rather than snapping back to the originally-marked Second.
    tabEls[2].setAttribute('label', 'Third!');

    expect(tabs.activeIndex).toBe(0);
    const buttons = tabs.shadowRoot.querySelectorAll('[role="tablist"] button');
    expect(buttons[0].getAttribute('aria-selected')).toBe('true');
    expect(buttons[1].getAttribute('aria-selected')).toBe('false');
  });
});
