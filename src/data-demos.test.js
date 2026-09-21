// Unit tests for fetchDemos: the /demos/manifest.json fetch + shape guards.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchDemos } from './data.js';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function stubDemosResponse(ok, body) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok, json: async () => body }));
}

describe('fetchDemos', () => {
  it('returns the channel-slug array on a successful manifest fetch', async () => {
    stubDemosResponse(true, ['helm', 'metsuri']);
    expect(await fetchDemos()).toEqual(['helm', 'metsuri']);
  });

  it('filters out non-string entries', async () => {
    stubDemosResponse(true, ['helm', 3, null, 'x']);
    expect(await fetchDemos()).toEqual(['helm', 'x']);
  });

  it('returns [] on a non-ok response (no demos dir yet)', async () => {
    stubDemosResponse(false, ['helm']);
    expect(await fetchDemos()).toEqual([]);
  });

  it('returns [] when the body is not an array', async () => {
    stubDemosResponse(true, { helm: true });
    expect(await fetchDemos()).toEqual([]);
  });

  it('returns [] on a network/parse failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));
    expect(await fetchDemos()).toEqual([]);
  });

  it('returns [] when the manifest fetch is aborted (timeout)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(
      Object.assign(new Error('timeout'), { name: 'TimeoutError' }),
    ));
    expect(await fetchDemos()).toEqual([]);
  });

  it('passes an AbortSignal so a hung manifest can be cancelled', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
    vi.stubGlobal('fetch', fetchMock);
    await fetchDemos();
    expect(fetchMock.mock.calls[0][1]?.signal).toBeInstanceOf(AbortSignal);
  });
});
