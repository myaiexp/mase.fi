// @vitest-environment jsdom
// applySearch (feed highlight round-trip) driven through initCommand: typing in
// the command input marks matching #feed rows and dims the rest, including a
// feed:relayout re-apply. The lower-level applySearch(el, term) unit tests
// against pretext-laid-out rows live in command-search.test.js.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupDom, setChannels, ch, type, feedRow } from './command-test-helpers.js';

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

describe('applySearch', () => {
  beforeEach(() => {
    setChannels(registry, [ch('home')]);
    document
      .getElementById('feed')
      .append(feedRow('hello world', 'hello world'), feedRow('goodbye moon', 'goodbye moon'));
    command.initCommand({});
  });

  it('lowercases the typed query, marks matching rows and dims non-matching ones', () => {
    type('WORLD');
    const rows = [...document.querySelectorAll('.feed-row')];
    expect(rows[0].classList.contains('search-dim')).toBe(false);
    expect(rows[0].querySelector('mark').textContent).toBe('world');
    expect(rows[1].classList.contains('search-dim')).toBe(true);
    expect(rows[1].querySelector('mark')).toBeNull();
  });

  it('clearing the query removes all marks and un-dims every row', () => {
    type('world');
    type('');
    expect(document.querySelector('mark')).toBeNull();
    expect(document.querySelector('.search-dim')).toBeNull();
  });

  function stripSearchMarkup() {
    for (const row of document.querySelectorAll('.feed-row')) {
      const msg = row.querySelector('.msg');
      msg.textContent = row.dataset.raw;
      row.classList.remove('search-dim');
    }
  }

  it('re-applies marks and dimming when feed:relayout rebuilds .msg content', () => {
    type('world');
    stripSearchMarkup();
    expect(document.querySelector('mark')).toBeNull();
    expect(document.querySelector('.search-dim')).toBeNull();

    document.getElementById('feed').dispatchEvent(new CustomEvent('feed:relayout'));

    const rows = [...document.querySelectorAll('.feed-row')];
    expect(rows[0].classList.contains('search-dim')).toBe(false);
    expect(rows[0].querySelector('mark').textContent).toBe('world');
    expect(rows[1].classList.contains('search-dim')).toBe(true);
    expect(rows[1].querySelector('mark')).toBeNull();
  });

  it('is a no-op on feed:relayout when no search term is active', () => {
    document.getElementById('feed').dispatchEvent(new CustomEvent('feed:relayout'));
    expect(document.querySelector('mark')).toBeNull();
    expect(document.querySelector('.search-dim')).toBeNull();
    expect([...document.querySelectorAll('.feed-row .msg')].map((m) => m.textContent))
      .toEqual(['hello world', 'goodbye moon']);
  });
});
