import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiUrl } from '../client/src/lib/apiOrigin.js';
import { __resetCacheHealthClientForTests, getCacheHealth } from '../client/src/lib/cacheHealthClient.js';

describe('cache-health client', () => {
  afterEach(() => {
    __resetCacheHealthClientForTests();
    vi.unstubAllGlobals();
  });

  it('coalesces concurrent reads and reuses a successful health snapshot for one minute', async () => {
    const payload = { day: '2026-08-17', providers: {} };
    const resolveResponse = vi.fn();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(resolve => { resolveResponse.mockImplementation(resolve); })));

    const first = getCacheHealth(100);
    const second = getCacheHealth(100);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(apiUrl('/api/cache-health'), {
      headers: { Accept: 'application/json' },
    });

    resolveResponse({ ok: true, json: async () => payload });
    await expect(first).resolves.toEqual(payload);
    await expect(second).resolves.toEqual(payload);
    await expect(getCacheHealth(101)).resolves.toEqual(payload);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('does not cache an unavailable response, so a later read can recover', async () => {
    vi.stubGlobal('fetch', vi
      .fn()
      .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ day: '2026-08-17', providers: {} }) }));

    await expect(getCacheHealth(100)).resolves.toBeNull();
    await expect(getCacheHealth(101)).resolves.toEqual({ day: '2026-08-17', providers: {} });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
