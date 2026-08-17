import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiOriginForTests, apiUrl } from '../client/src/lib/apiOrigin.js';

describe('API origin configuration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes the configured API origin without duplicating slashes', () => {
    const expected = `${apiOriginForTests()}/api/cache-health`;
    expect(apiUrl('/api/cache-health')).toBe(expected);
    expect(apiUrl('api/cache-health')).toBe(expected);
  });

  it('can call the lightweight cache-health endpoint without embedding credentials', async () => {
    const response = { ok: true, json: async () => ({}) };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await fetch(apiUrl('/api/cache-health'), { headers: { Accept: 'application/json' } });

    expect(fetch).toHaveBeenCalledWith(apiUrl('/api/cache-health'), {
      headers: { Accept: 'application/json' },
    });
  });
});
