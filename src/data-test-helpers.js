// Shared fixtures for the data adapter tests: normalized entries, fetch stubs
import { vi } from 'vitest';

// A normalized entry as produced by fetchData(): { ch, cat, date, nick, text, project? }.
export function entry(cat, ch, extra = {}) {
  return {
    ch,
    cat,
    date: '2026-01-01T00:00',
    nick: cat === 'log' ? 'git' : 'mase',
    text: 't',
    ...extra,
  };
}

export function stubFetch(payload) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
}
