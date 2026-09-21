// @vitest-environment jsdom
// Unit tests for the command input module: the "/" autocomplete render and its
// combobox ARIA wiring, driven through the public initCommand surface. Ranking
// helpers live in command-fuzzy.js (and command-fuzzy.test.js).
//
// Other command.js suites: Tab-complete/Enter/Escape/global-shortcuts and
// autocomplete choose live in command-keys.test.js; slash commands in
// command-slash.test.js; applySearch-through-initCommand in
// command-applysearch.test.js; formatRelativeActivity in command-format.test.js.
// Shared DOM harness: command-test-helpers.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupDom, setChannels, ch, type, items, cc } from './command-test-helpers.js';

// command-complete.js reads getChannels/chAccent from the registry leaf;
// command.js only needs navigate from the routing orchestrator. Stub both so
// these tests exercise ranking, autocomplete rendering, and search highlighting.
// The channel list is set per test via setChannels() (stubbing the accessor).
vi.mock('./registry.js', () => ({
  getChannels: vi.fn(() => []),
  chAccent: vi.fn(() => 'oklch(0.620 0.140 78.0)'),
}));
vi.mock('./channels.js', () => ({
  navigate: vi.fn(),
}));
vi.mock('./data.js', () => ({
  entriesFor: vi.fn(() => []),
}));

// Re-imported fresh per test so module state (the autocomplete `selection`, the
// lazy DOM refs) starts clean and command-complete binds to the same mocked
// registry instance the test sees.
let command, registry;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  setupDom();
  registry = await import('./registry.js');
  await import('./channels.js');
  await import('./data.js');
  command = await import('./command.js');
});

// ---- autocomplete render -------------------------------------------------

describe('autocomplete render', () => {
  beforeEach(() => {
    setChannels(registry, [ch('home'), ch('explorer', 'explorer', 'file explorer'), ch('activity')]);
    command.initCommand({});
  });

  it('renders only the channels matching a partial "/foo" query', () => {
    type('/exp');
    expect(cc().hidden).toBe(false);
    const list = items();
    expect(list).toHaveLength(1);
    expect(list[0].dataset.ch).toBe('explorer');
  });

  it('highlights the matched characters of the rendered label', () => {
    type('/exp');
    expect(items()[0].querySelectorAll('.hit')).toHaveLength(3);
  });

  it('escapes the channel topic into the description cell', () => {
    setChannels(registry, [ch('explorer', 'explorer', 'a <b> topic')]);
    type('/exp');
    expect(items()[0].querySelector('.cc-desc').innerHTML).toBe('a &lt;b&gt; topic');
  });

  // Regression for audit #6282: data-ch used to interpolate m.id raw into
  // innerHTML. Quotes/angle brackets in a hostile project.channel break out of
  // the attribute (sidebar already escapeHtml's the same field).
  it('escapes channel id in data-ch so quote/angle breakout cannot inject attrs', () => {
    const hostile = 'foo" onclick=alert(1) x="<img src=x onerror=1>';
    setChannels(registry, [ch(hostile, 'foox', 'topic')]);
    type('/foo');
    const item = items()[0];
    expect(item).toBeTruthy();
    // Browser decodes the attribute — full id round-trips (not truncated at ").
    expect(item.getAttribute('data-ch')).toBe(hostile);
    expect(item.dataset.ch).toBe(hostile);
    // Breakout must not create real attributes or injected nodes.
    expect(item.hasAttribute('onclick')).toBe(false);
    expect(item.querySelector('img')).toBeNull();
    // Quotes were entity-escaped in the attribute source (not a raw " closer).
    expect(item.outerHTML).toContain('&quot;');
  });

  it('an empty query ("/") lists every channel with no highlight spans', () => {
    type('/');
    expect(items().map((el) => el.dataset.ch)).toEqual(['home', 'explorer', 'activity']);
    expect(cc().querySelectorAll('.hit')).toHaveLength(0);
  });

  it('sorts matches by descending fuzzy score', () => {
    setChannels(registry, [ch('chrome'), ch('home'), ch('shop')]);
    type('/ho');
    expect(items().map((el) => el.dataset.ch)).toEqual(['home', 'shop', 'chrome']);
  });

  it('hides the popup when nothing matches', () => {
    type('/zzz');
    expect(cc().hidden).toBe(true);
    expect(cc().innerHTML).toBe('');
  });
});

// ---- combobox ARIA (autocomplete announced to screen readers) ------------

describe('combobox ARIA', () => {
  const input = () => document.getElementById('cmd-input');
  const options = () => [...cc().querySelectorAll('[role="option"]')];

  beforeEach(() => {
    setChannels(registry, [ch('home'), ch('explorer'), ch('activity')]);
    command.initCommand({ meta: { server: 'irc.test', bootTime: Date.now() } });
  });

  it('slash mode marks the popup a listbox of options with an active descendant', () => {
    type('/o'); // matches home + explorer
    expect(cc().getAttribute('role')).toBe('listbox');
    const opts = options();
    expect(opts).toHaveLength(2);
    expect(opts.map((el) => el.id)).toEqual(['cc-opt-0', 'cc-opt-1']);
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(input().getAttribute('aria-activedescendant')).toBe('cc-opt-0');
    expect(opts[0].getAttribute('aria-selected')).toBe('true');
    expect(opts[1].getAttribute('aria-selected')).toBe('false');
  });

  it('ArrowDown moves aria-activedescendant and aria-selected to the next option', () => {
    const el = type('/o');
    el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(input().getAttribute('aria-activedescendant')).toBe('cc-opt-1');
    const opts = options();
    expect(opts[0].getAttribute('aria-selected')).toBe('false');
    expect(opts[1].getAttribute('aria-selected')).toBe('true');
  });

  it('hovering an option syncs aria-selected and the active descendant', () => {
    type('/o');
    options()[1].dispatchEvent(new MouseEvent('mouseenter', { bubbles: true }));
    expect(input().getAttribute('aria-activedescendant')).toBe('cc-opt-1');
    expect(options()[1].getAttribute('aria-selected')).toBe('true');
  });

  it('help mode announces a note, not a listbox, with no active descendant', () => {
    type('?');
    expect(cc().getAttribute('role')).toBe('note');
    expect(options()).toHaveLength(0);
    expect(input().getAttribute('aria-expanded')).toBe('true');
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('collapses the combobox when the popup hides (no match / search)', () => {
    type('/o');
    type('/zzz'); // no match -> hidden
    expect(input().getAttribute('aria-expanded')).toBe('false');
    expect(input().hasAttribute('aria-activedescendant')).toBe(false);
    expect(cc().hasAttribute('role')).toBe(false);
  });
});
