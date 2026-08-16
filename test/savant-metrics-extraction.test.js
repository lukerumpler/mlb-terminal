import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getSavantData, getTeamSavantMetrics } from '../client/src/api/mlb.js';

describe('Savant metrics extraction and merging', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('merges expected statistics and statcast leaderboards to provide xBA, xSLG, hardHitPercent, and barrelPercent', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.includes('expected_statistics')) {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => name === 'X-Provider-Freshness' ? 'live' : 'MISS' },
          json: async () => [{ player_id: '123', team_abbr: 'LAD', est_ba: 0.310, est_slg: 0.540 }],
          text: async () => JSON.stringify([{ player_id: '123', team_abbr: 'LAD', est_ba: 0.310, est_slg: 0.540 }]),
        };
      }
      if (url.includes('statcast_leaderboard')) {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => name === 'X-Provider-Freshness' ? 'live' : 'MISS' },
          json: async () => [{ player_id: '123', team_abbr: 'LAD', hard_hit_percent: 48.5, brl_percent: 15.2 }],
          text: async () => JSON.stringify([{ player_id: '123', team_abbr: 'LAD', hard_hit_percent: 48.5, brl_percent: 15.2 }]),
        };
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    }));

    const savantRows = await getSavantData(2026);
    expect(Array.isArray(savantRows)).toBe(true);
    expect(savantRows.length).toBe(1);
    expect(savantRows[0].est_ba).toBe(0.310);
    expect(savantRows[0].hard_hit_percent).toBe(48.5);

    const metrics = await getTeamSavantMetrics('LAD', 2026);
    expect(metrics.expectedBA).toBe(0.310);
    expect(metrics.expectedSLG).toBe(0.540);
    expect(metrics.hardHitPercent).toBe(48.5);
    expect(metrics.barrelPercent).toBe(15.2);
  });
});
