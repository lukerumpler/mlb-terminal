import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiOriginForTests, apiUrl, resolveApiOrigin } from '../client/src/lib/apiOrigin.js';

describe('API origin configuration', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('normalizes the configured API origin without duplicating slashes', () => {
    const expected = `${apiOriginForTests()}/api/cache-health`;
    expect(apiUrl('/api/cache-health')).toBe(expected);
    expect(apiUrl('api/cache-health')).toBe(expected);
  });

  it('keeps development-preview requests same-origin when a production API base is configured', () => {
    expect(resolveApiOrigin('https://api.example.test/', {
      development: true,
      currentOrigin: 'https://3000-preview.manus.computer',
    })).toBe('');
    expect(resolveApiOrigin('https://api.example.test/', {
      development: false,
      currentOrigin: 'https://app.example.test',
    })).toBe('https://api.example.test');
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
