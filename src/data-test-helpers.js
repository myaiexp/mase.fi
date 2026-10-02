// Shared fixtures for the data adapter tests: normalized entries, fetch stubs
import { vi } from 'vitest';

// A normalized entry as produced by fetchData(): { channel, category, date, nick, text, projectSlug? }.
export function entry(category, channel, extra = {}) {
  return {
    channel,
    category,
    date: '2026-01-01T00:00',
    nick: category === 'log' ? 'git' : 'mase',
    text: 't',
    ...extra,
  };
}

export function stubFetch(payload) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
}
