import { afterEach, describe, expect, it, vi } from 'vitest';
import { __resetMlbClientStateForTests, fetchPlayerProviderIdentity } from '../client/src/api/mlb.js';
import { __resetPlayerIdentityTelemetryForTests, summarizePlayerIdentityTelemetry } from '../client/src/lib/playerIdentityTelemetry.js';
import {
  __resetPlayerIdentityRegistryForTests,
  getStoredPlayerProviderIdentity,
  isUsablePlayerProviderIdentity,
  removeStoredPlayerProviderIdentity,
  storePlayerProviderIdentity,
} from '../client/src/lib/playerIdentityRegistry.js';

const identity = {
  mlb: {
    id: '660271',
    canonicalUrl: 'https://www.mlb.com/player/660271',
    confidence: 'official-id',
    provenance: 'MLB Stats API player identifier',
  },
  baseballReference: {
    id: 'ohtansh01',
    canonicalUrl: 'https://www.baseball-reference.com/players/o/ohtansh01.shtml',
    confidence: 'exact-name',
    provenance: 'Baseball-Reference search result verified by exact normalized player name',
    matchedName: 'Shohei Ohtani',
    verifiedAt: '2026-08-17T00:00:00.000Z',
  },
};

afterEach(() => {
  __resetPlayerIdentityRegistryForTests();
  __resetPlayerIdentityTelemetryForTests();
  __resetMlbClientStateForTests();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('persistent player provider ID registry', () => {
  it('persists and reuses a verified exact-name Baseball-Reference mapping', () => {
    const now = Date.parse('2026-08-17T00:00:00.000Z');
    expect(storePlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani', identity, now })).toBe(true);
    expect(getStoredPlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani', now:now + 1 })).toEqual(identity);
  });

  it('never reuses a mapping for a near-name player or mismatched MLB ID', () => {
    const now = Date.parse('2026-08-17T00:00:00.000Z');
    storePlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani', identity, now });
    expect(getStoredPlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtan', now:now + 1 })).toBeNull();
    expect(getStoredPlayerProviderIdentity({ mlbId:'999999', fullName:'Shohei Ohtani', now:now + 1 })).toBeNull();
  });

  it('requires a canonical URL, exact confidence, and matching name before storage', () => {
    const malformed = {
      ...identity,
      baseballReference: { ...identity.baseballReference, canonicalUrl:'https://example.test/ohtansh01', confidence:'near-name' },
    };
    expect(isUsablePlayerProviderIdentity(malformed, { mlbId:'660271', fullName:'Shohei Ohtani' })).toBe(false);
    expect(storePlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani', identity:malformed })).toBe(false);
  });

  it('sends a persisted exact mapping as a direct Baseball-Reference ID request', async () => {
    storePlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani', identity });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ found:true, identity }), {
      status:200,
      headers:{ 'content-type':'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchPlayerProviderIdentity({ id:'660271', fullName:'Shohei Ohtani' })).resolves.toEqual(identity);

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]), 'https://skip.local');
    expect(requestUrl.pathname).toBe('/api/player-identity');
    expect(requestUrl.searchParams.get('mlbId')).toBe('660271');
    expect(requestUrl.searchParams.get('baseballReferenceId')).toBe('ohtansh01');
    expect(requestUrl.searchParams.get('identitySource')).toBe('registry');
    expect(summarizePlayerIdentityTelemetry()).toMatchObject({
      resolverRequests:1,
      registryReuses:1,
      directIdRequests:1,
      directIdVerified:1,
      registryReuseRate:100,
      directIdVerificationRate:100,
      searchAvoidanceRate:100,
    });
  });

  it('invalidates a persisted mapping when direct canonical verification rejects it', async () => {
    storePlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani', identity });
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      found:false,
      invalidateBaseballReferenceId:true,
      identity:{ mlb:identity.mlb, baseballReference:null },
    }), { status:200, headers:{ 'content-type':'application/json' } })));

    await fetchPlayerProviderIdentity({ id:'660271', fullName:'Shohei Ohtani' });

    expect(getStoredPlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani' })).toBeNull();
    expect(summarizePlayerIdentityTelemetry()).toMatchObject({ directIdInvalidated:1, noMatch:1 });
  });

  it('expires persisted mappings and supports explicit invalidation', () => {
    const now = Date.parse('2026-08-17T00:00:00.000Z');
    storePlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani', identity, now });
    expect(getStoredPlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani', now:now + 31 * 24 * 60 * 60_000 })).toBeNull();
    storePlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani', identity, now });
    removeStoredPlayerProviderIdentity({ mlbId:'660271' });
    expect(getStoredPlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani', now:now + 1 })).toBeNull();
  });
});
