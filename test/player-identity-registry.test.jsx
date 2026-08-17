import { afterEach, describe, expect, it } from 'vitest';
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

afterEach(() => __resetPlayerIdentityRegistryForTests());

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

  it('expires persisted mappings and supports explicit invalidation', () => {
    const now = Date.parse('2026-08-17T00:00:00.000Z');
    storePlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani', identity, now });
    expect(getStoredPlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani', now:now + 31 * 24 * 60 * 60_000 })).toBeNull();
    storePlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani', identity, now });
    removeStoredPlayerProviderIdentity({ mlbId:'660271' });
    expect(getStoredPlayerProviderIdentity({ mlbId:'660271', fullName:'Shohei Ohtani', now:now + 1 })).toBeNull();
  });
});
