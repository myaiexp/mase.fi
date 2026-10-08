// A demos manifest that loses the grace race is kept and applied later.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchData } from './data.js';
import { DEMOS_GRACE_MS } from './data-demos.js';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubSplitFetch({ updates, manifest }) {
  vi.stubGlobal('fetch', vi.fn((url) => {
    if (String(url).includes('/demos/')) return manifest();
    return updates();
  }));
}

describe('fetchData late demos manifest', () => {
  it('keeps a manifest that resolves just after the grace window', async () => {
    vi.useFakeTimers();
    let releaseManifest;
    stubSplitFetch({
      updates: () => Promise.resolve({
        ok: true,
        json: async () => ({ projects: [], entries: [] }),
      }),
      manifest: () => new Promise((resolve) => {
        releaseManifest = () => resolve({ ok: true, json: async () => ['explorer'] });
      }),
    });

    const pending = fetchData();
    await vi.advanceTimersByTimeAsync(DEMOS_GRACE_MS);
    const data = await pending;

    expect(data.demos).toEqual([]);
    expect(data.pendingDemos).toBeInstanceOf(Promise);
    releaseManifest();
    await expect(data.pendingDemos).resolves.toEqual(['explorer']);
    // The caller applies the list. fetchData does not mutate demos out of band.
    expect(data.demos).toEqual([]);
  });

  it('keeps the late manifest when updates.json itself fails', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    let releaseManifest;
    stubSplitFetch({
      updates: () => Promise.reject(new Error('down')),
      manifest: () => new Promise((resolve) => {
        releaseManifest = () => resolve({ ok: true, json: async () => ['explorer'] });
      }),
    });

    const pending = fetchData();
    await vi.advanceTimersByTimeAsync(DEMOS_GRACE_MS);
    const data = await pending;

    expect(data.entries).toEqual([]);
    expect(data.demos).toEqual([]);
    releaseManifest();
    await expect(data.pendingDemos).resolves.toEqual(['explorer']);
  });

  it('does not leave a pending promise when the manifest wins the grace race', async () => {
    stubSplitFetch({
      updates: () => Promise.resolve({ ok: true, json: async () => ({ projects: [], entries: [] }) }),
      manifest: () => Promise.resolve({ ok: true, json: async () => ['explorer'] }),
    });
    const data = await fetchData();
    expect(data.demos).toEqual(['explorer']);
    expect(data.pendingDemos).toBeUndefined();
  });
});
