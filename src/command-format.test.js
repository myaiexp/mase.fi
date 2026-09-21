// @vitest-environment jsdom
// formatRelativeActivity: the autocomplete popup's .cc-last "time since" column,
// driven through initCommand with data.entriesFor mocked per test.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

let command, registry, data;

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  setupDom();
  registry = await import('./registry.js');
  await import('./channels.js');
  data = await import('./data.js');
  command = await import('./command.js');
});

describe('formatRelativeActivity (cc-last column)', () => {
  const NOW = new Date('2026-06-13T12:00:00Z');

  function lastCell() {
    type('/home');
    return items()[0].querySelector('.cc-last').textContent;
  }

  function entryAt(iso) {
    return [{ date: iso }];
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    setChannels(registry, [ch('home')]);
    command.initCommand({});
  });

  afterEach(() => {
    vi.useRealTimers();
    data.entriesFor.mockImplementation(() => []);
  });

  it("renders '3m' for an entry three minutes ago", () => {
    data.entriesFor.mockReturnValue(entryAt('2026-06-13T11:57'));
    expect(lastCell()).toBe('3m');
  });

  it("renders '2h' for an entry two hours ago", () => {
    data.entriesFor.mockReturnValue(entryAt('2026-06-13T10:00'));
    expect(lastCell()).toBe('2h');
  });

  it("renders '3d' for an entry three days ago", () => {
    data.entriesFor.mockReturnValue(entryAt('2026-06-10T12:00'));
    expect(lastCell()).toBe('3d');
  });

  it("renders '—' when the channel has no entries", () => {
    expect(lastCell()).toBe('—');
  });

  it("clamps a future-dated entry to '0m'", () => {
    data.entriesFor.mockReturnValue(entryAt('2026-06-13T12:05'));
    expect(lastCell()).toBe('0m');
  });
});
