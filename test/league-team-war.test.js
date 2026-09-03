import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLeagueTeamsWar, __resetProviderJsonCacheForTests } from '../client/src/api/mlb.js';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('getLeagueTeamsWar (League page Team WAR column)', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetProviderJsonCacheForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    __resetProviderJsonCacheForTests();
  });

  it('normalizes team names and totals from the FanGraphs aggregate endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      expect(String(url)).toContain('/api/fangraphs-models?mode=aggregate');
      return jsonResponse({
        teams: [
          { team: 'San Diego Padres', battingWAR: 20.1, pitchingWAR: 18.3, totalWAR: 38.4 },
          { team: 'Los Angeles Dodgers', battingWAR: 24.3, pitchingWAR: 18.1, totalWAR: 42.4 },
        ],
      });
    }));
    const rows = await getLeagueTeamsWar(2026);
    expect(rows).toContainEqual({ team: 'san diego padres', totalWAR: 38.4 });
    expect(rows).toContainEqual({ team: 'los angeles dodgers', totalWAR: 42.4 });
  });

  it('excludes rows with no verified total WAR instead of coercing to 0', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({
      teams: [
        { team: 'Miami Marlins', battingWAR: null, pitchingWAR: null, totalWAR: null },
        { team: 'Boston Red Sox', battingWAR: 15.2, pitchingWAR: 14.8, totalWAR: 30.0 },
      ],
    })));
    const rows = await getLeagueTeamsWar(2026);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ team: 'boston red sox', totalWAR: 30.0 });
  });

  it('resolves to an empty array rather than throwing when the provider is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    await expect(getLeagueTeamsWar(2026)).resolves.toEqual([]);
  });

  it('resolves to an empty array on a malformed (non-JSON) response body', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>not json</html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    })));
    await expect(getLeagueTeamsWar(2026)).resolves.toEqual([]);
  });
});
