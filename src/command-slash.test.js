// @vitest-environment jsdom
// Slash commands: the easter-egg /help, /whoami, /clear, … surfaced in the "/"
// popup (registry in slash-commands.js), driven through initCommand.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupDom, setChannels, ch, type, items } from './command-test-helpers.js';

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

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  setupDom();
  registry = await import('./registry.js');
  channels = await import('./channels.js');
  await import('./data.js');
  command = await import('./command.js');
});

describe('slash commands', () => {
  const notices = () => [...document.getElementById('feed').querySelectorAll('.sys-notice')];

  beforeEach(() => {
    setChannels(registry, [ch('home'), ch('explorer'), ch('activity')]);
    command.initCommand({ meta: { server: 'irc.test', bootTime: Date.now() } });
  });

  it('surfaces a matching command in the "/" popup, tagged is-cmd', () => {
    type('/whoami'); // no channel matches "whoami"
    const list = items();
    expect(list).toHaveLength(1);
    expect(list[0].classList.contains('is-cmd')).toBe(true);
    expect(list[0].querySelector('.cc-ch').textContent).toContain('whoami');
  });

  // Commands match by name prefix, not the fuzzy subsequence channels use.
  const cmdLabels = () => items()
    .filter((el) => el.classList.contains('is-cmd'))
    .map((el) => el.querySelector('.cc-ch').textContent);

  it('does not surface a command for a non-prefix subsequence ("/o" vs /whoami)', () => {
    type('/o');
    expect(items().length).toBeGreaterThan(0); // channels still fuzzy-match "o"
    expect(cmdLabels()).toEqual([]);
  });

  it('surfaces a command for a partial name prefix', () => {
    for (const q of ['/w', '/who']) {
      type(q);
      expect(cmdLabels()).toEqual(['/whoami']);
    }
  });

  it('lists /help for "/h" without the fuzzy-only /whoami', () => {
    type('/h');
    expect(cmdLabels()).toEqual(['/help']);
  });

  it('keeps commands hidden on a bare "/" (channels only)', () => {
    type('/');
    expect(items().some((el) => el.classList.contains('is-cmd'))).toBe(false);
    expect(items().map((el) => el.dataset.ch)).toEqual(['home', 'explorer', 'activity']);
  });

  it('Enter on a command prints server-notice line(s) and does not navigate', () => {
    const input = type('/help');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const out = notices();
    expect(out.length).toBeGreaterThan(1);
    expect(out[0].textContent).toMatch(/slash commands/);
    expect(input.value).toBe('');
    expect(channels.navigate).not.toHaveBeenCalled();
  });

  it('/clear removes existing notices', () => {
    let input = type('/help');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(notices().length).toBeGreaterThan(0);
    input = type('/clear');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(notices()).toHaveLength(0);
  });
});
