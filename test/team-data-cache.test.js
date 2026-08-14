import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readTeamAggregateCache, readTeamPlayersCache, saveTeamAggregateCache, saveTeamPlayersCache } from '../client/src/lib/teamDataCache.js';
import { formatDataAge } from '../client/src/pages/OverviewPage.jsx';

describe('team data cache and freshness helpers', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

  it('stores only season-matched aggregate snapshots', () => {
    const data = { byAbbr:{ LAD:{ standings:{ w:73, l:48 } } }, byId:{} };
    saveTeamAggregateCache(data, 2026);
    expect(readTeamAggregateCache(2026)).toMatchObject({ season:2026, data });
    expect(readTeamAggregateCache(2025)).toBeNull();
  });

  it('stores team-specific player rows independently', () => {
    saveTeamPlayersCache(119, 2026, { hitting:[{ id:1 }], pitching:[] });
    saveTeamPlayersCache(147, 2026, { hitting:[{ id:2 }], pitching:[] });
    expect(readTeamPlayersCache(119, 2026)?.data.hitting[0].id).toBe(1);
    expect(readTeamPlayersCache(147, 2026)?.data.hitting[0].id).toBe(2);
    expect(readTeamPlayersCache(119, 2025)).toBeNull();
  });

  it('formats honest age labels without calling fresh data stale', () => {
    const now = 1_700_000_000_000;
    expect(formatDataAge(now - 30_000, now)).toBe('just now');
    expect(formatDataAge(now - 5 * 60_000, now)).toBe('5m ago');
    expect(formatDataAge(null, now)).toBeNull();
  });
});
