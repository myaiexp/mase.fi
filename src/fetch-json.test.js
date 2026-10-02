// Unit tests for the time-boxed fetch primitives: timeout, body-read cap, status check.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchWithTimeout, fetchJson } from './fetch-json.js';

// A fetch that never answers until its signal aborts, then rejects like a browser.
const hungFetch = () => vi.fn((url, init) => new Promise((_, reject) => {
  init.signal.addEventListener('abort', () => reject(init.signal.reason));
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('fetchWithTimeout', () => {
  it('passes init through and adds an abort signal', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await fetchWithTimeout('/x', { method: 'HEAD' }, 1000);
    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe('HEAD');
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects with a TimeoutError once the time box elapses', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', hungFetch());
    const p = fetchWithTimeout('/x', {}, 1500);
    const settled = expect(p).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(1500);
    await settled;
  });

  it('keeps the time box open while `read` consumes the body', async () => {
    vi.useFakeTimers();
    let signal;
    vi.stubGlobal('fetch', vi.fn(async (url, init) => { signal = init.signal; return { ok: true }; }));
    const p = fetchWithTimeout('/x', {}, 1000, () => new Promise((_, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    }));
    const settled = expect(p).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(1000);
    await settled;
  });

  it('clears its timer once the response is read', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })));
    await fetchWithTimeout('/x', {}, 1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('fetchJson', () => {
  it('parses a 2xx body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ a: 1 }) })));
    await expect(fetchJson('/x')).resolves.toEqual({ a: 1 });
  });

  it('rejects a non-2xx without parsing its body', async () => {
    const json = vi.fn(async () => ({ entries: [] }));
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, json })));
    await expect(fetchJson('/x')).rejects.toThrow('/x HTTP 503');
    expect(json).not.toHaveBeenCalled();
  });
});
