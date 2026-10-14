/*
Our goal is to make sure the browser side of our player WAR backup actually asks our server for a player's Baseball-Reference
WAR and wRC+ and passes the answer along. It never did before: the call used a function name that did not exist
(providerJson instead of fetchProviderJson). That crash was caught by a try/catch, so the player backup always said
"unavailable" and no one saw an error.

To solve this we are going to:
  1. Replace the internet with a fake fetch that returns an answer we choose and writes down what we asked for
  2. Ask for a player and check we sent exactly one request to the right address with the right details
  3. Check the answer comes back whole, including a negative WAR and the player's Baseball-Reference id
  4. Cross-check the bad cases: a failed request or a missing name must give "unavailable", never a made-up number
*/
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetProviderJsonCacheForTests, getBaseballReferenceAdvancedSafe } from '../client/src/api/mlb.js';

describe('getBaseballReferenceAdvancedSafe', () => {
  beforeEach(() => __resetProviderJsonCacheForTests());      // Forget any answer saved from the last test
  afterEach(() => vi.unstubAllGlobals());                    // Put the real fetch back

  function respond(body) {
    // A fake fetch that always answers with this body as JSON, and remembers how it was called
    return vi.fn(async () => new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  }

  it('returns the server value, including a negative WAR and the provider id', async () => {
    const fetchMock = respond({
      season: 2026,
      war: -0.4,                                             // A negative WAR, the kind we used to lose
      wrcPlus: 88,
      status: 'live',
      source: 'Baseball-Reference player summary',
      providerIds: { baseballReference: 'sotoju01' },
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await getBaseballReferenceAdvancedSafe('Juan Soto', 2026, { mlbId: 665742 });

    expect(fetchMock).toHaveBeenCalledTimes(1);              // Before the fix this was 0, the request was never sent
    const addressWeAskedFor = String(fetchMock.mock.calls[0][0]);
    expect(addressWeAskedFor).toContain('/api/player-advanced?name=Juan+Soto&season=2026&mlbId=665742');
    expect(result.providerIds).toEqual({ baseballReference: 'sotoju01' });
    expect(result).toMatchObject({ war: -0.4, wrcPlus: 88 });
  });

  it('still degrades to unavailable when the request fails or no name is given', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 502 })));    // The server is down
    expect(await getBaseballReferenceAdvancedSafe('Juan Soto', 2026)).toMatchObject({ war: null, wrcPlus: null, status: 'unavailable' });
    expect(await getBaseballReferenceAdvancedSafe('', 2026)).toMatchObject({ war: null, status: 'unavailable' });     // No name, nothing to look up
  });
});
