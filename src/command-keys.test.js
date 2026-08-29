// @vitest-environment jsdom
// Command input key sequences: leftover slash→help, Tab-complete, global shortcuts.
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

let command, registry, channels;

function setupDom() {
  document.body.replaceChildren();
  document.getElementById('search-dim-style')?.remove();
  for (const id of ['cmd', 'cmd-input', 'cmd-prompt', 'cmd-hint', 'cmd-complete', 'feed']) {
    const el = document.createElement(id === 'cmd-input' ? 'input' : 'div');
    el.id = id;
    document.body.appendChild(el);
  }
}

function setChannels(list) {
  registry.getChannels.mockReturnValue(list);
}

function ch(id, label = id, topic = `${id} topic`) {
  return { id, label, topic };
}

function type(value) {
  const input = document.getElementById('cmd-input');
  input.value = value;
  input.dispatchEvent(new Event('input'));
  return input;
}

function press(el, key) {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
}

const cc = () => document.getElementById('cmd-complete');
const input = () => document.getElementById('cmd-input');

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  setupDom();
  registry = await import('./registry.js');
  channels = await import('./channels.js');
  command = await import('./command.js');
  setChannels([ch('home'), ch('explorer', 'explorer', 'file explorer'), ch('activity')]);
  command.initCommand({});
});

describe('slash then help (leftover matches must not hijack Enter/Tab)', () => {
  it('type /exp then ? : Enter does not navigate and the popup stays help/note', () => {
    type('/exp');
    expect(cc().hidden).toBe(false);
    expect(cc().querySelector('[data-ch="explorer"]')).toBeTruthy();

    const el = type('?');
    expect(cc().getAttribute('role')).toBe('note');
    expect(cc().hidden).toBe(false);

    press(el, 'Enter');
    expect(channels.navigate).not.toHaveBeenCalled();
    expect(cc().getAttribute('role')).toBe('note');
    expect(el.value).toBe('?');
  });

  it('type /exp then ? : Tab does not rewrite the value back to a slash match', () => {
    type('/exp');
    const el = type('?');
    press(el, 'Tab');
    expect(el.value).toBe('?');
    expect(cc().getAttribute('role')).toBe('note');
    expect(channels.navigate).not.toHaveBeenCalled();
  });

  it('type /exp then empty then ? : Enter still does not navigate', () => {
    type('/exp');
    type('');
    const el = type('?');
    press(el, 'Enter');
    expect(channels.navigate).not.toHaveBeenCalled();
    expect(cc().getAttribute('role')).toBe('note');
  });
});

describe('Tab-complete', () => {
  it('Tab rewrites the input to "/" plus the highlighted row label', () => {
    const el = type('/exp');
    press(el, 'Tab');
    expect(el.value).toBe('/explorer');
    expect(cc().hidden).toBe(false);
    expect(cc().querySelector('[data-ch="explorer"]')).toBeTruthy();
  });

  it('Tab completes the ArrowDown-highlighted row, not always the first', () => {
    const el = type('/o'); // home + explorer (both contain "o")
    press(el, 'ArrowDown');
    press(el, 'Tab');
    expect(el.value).toBe('/explorer');
  });
});

describe('global shortcuts (window keydown, non-input target)', () => {
  it('"/" focuses the command input in slash mode', () => {
    press(document.body, '/');
    expect(document.activeElement).toBe(input());
    expect(input().value).toBe('/');
    expect(document.getElementById('cmd').classList.contains('mode-slash')).toBe(true);
    expect(cc().hidden).toBe(false);
  });

  it('"?" focuses the command input in help mode', () => {
    press(document.body, '?');
    expect(document.activeElement).toBe(input());
    expect(input().value).toBe('?');
    expect(document.getElementById('cmd').classList.contains('mode-help')).toBe(true);
    expect(cc().getAttribute('role')).toBe('note');
  });

  it('g then h navigates home', () => {
    press(document.body, 'g');
    press(document.body, 'h');
    expect(channels.navigate).toHaveBeenCalledWith('home');
  });

  it('g then a navigates activity', () => {
    press(document.body, 'g');
    press(document.body, 'a');
    expect(channels.navigate).toHaveBeenCalledWith('activity');
  });

  it('h without a preceding g does not navigate', () => {
    press(document.body, 'h');
    expect(channels.navigate).not.toHaveBeenCalled();
  });

  it('does not steal "/" when another input is focused', () => {
    const other = document.createElement('input');
    document.body.appendChild(other);
    press(other, '/');
    expect(input().value).toBe('');
    expect(document.activeElement).not.toBe(input());
  });
});
