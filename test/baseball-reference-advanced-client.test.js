import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetProviderJsonCacheForTests, getBaseballReferenceAdvancedSafe } from '../client/src/api/mlb.js';

// Regression: the call site used an undefined `providerJson`, the ReferenceError was
// swallowed by the surrounding try/catch, and the player fallback always said "unavailable".
describe('getBaseballReferenceAdvancedSafe', () => {
  beforeEach(() => __resetProviderJsonCacheForTests());
  afterEach(() => vi.unstubAllGlobals());

  const respond = body => vi.fn(async () => new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }));

  it('returns the server value, including a negative WAR and the provider id', async () => {
    const fetchMock = respond({ season: 2026, war: -0.4, wrcPlus: 88, status: 'live', source: 'Baseball-Reference player summary', providerIds: { baseballReference: 'sotoju01' } });
    vi.stubGlobal('fetch', fetchMock);
    const result = await getBaseballReferenceAdvancedSafe('Juan Soto', 2026, { mlbId: 665742 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/player-advanced?name=Juan+Soto&season=2026&mlbId=665742');
    expect(result.providerIds).toEqual({ baseballReference: 'sotoju01' });
    expect(result).toMatchObject({ war: -0.4, wrcPlus: 88 });
  });

  it('still degrades to unavailable when the request fails or no name is given', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 502 })));
    expect(await getBaseballReferenceAdvancedSafe('Juan Soto', 2026)).toMatchObject({ war: null, wrcPlus: null, status: 'unavailable' });
    expect(await getBaseballReferenceAdvancedSafe('', 2026)).toMatchObject({ war: null, status: 'unavailable' });
  });
});
