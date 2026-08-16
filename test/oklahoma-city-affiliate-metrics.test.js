import { describe, expect, it, vi, beforeEach } from 'vitest';
import { getMinorLeagueTeamOverview, getTeamSavantMetrics } from '../client/src/api/mlb.js';

describe('Oklahoma City affiliate metrics normalization', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('normalizes affiliate hitting/pitching and Savant metrics without returning dashes when data is present', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.includes('/api/mlb')) {
        if (url.includes(encodeURIComponent('/teams/119/stats')) && url.includes('group=hitting')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'MISS' },
            json: async () => ({
              stats: [
                {
                  group: { displayName: 'hitting' },
                  splits: [{ stat: { ops: 0.833, homeRuns: 142 } }],
                },
              ],
            }),
            text: async () => JSON.stringify({ stats: [] }),
          };
        }
        if (url.includes(encodeURIComponent('/teams/119/stats')) && url.includes('group=pitching')) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'MISS' },
            json: async () => ({
              stats: [
                {
                  group: { displayName: 'pitching' },
                  splits: [{ stat: { era: 3.85, strikeOuts: 1046 } }],
                },
              ],
            }),
            text: async () => JSON.stringify({ stats: [] }),
          };
        }
        if (url.includes(encodeURIComponent('/teams/119'))) {
          return {
            ok: true,
            status: 200,
            headers: { get: () => 'MISS' },
            json: async () => ({ teams: [{ id: 119, name: 'Oklahoma City Comets', abbreviation: 'OKC', sport: { name: 'Triple-A' }, league: { name: 'Pacific Coast League' }, venue: { name: 'Chickasaw Bricktown Ballpark' } }] }),
            text: async () => JSON.stringify({ teams: [] }),
          };
        }
      }
      if (url.includes('expected_statistics') || url.includes('statcast_leaderboard')) {
        return {
          ok: true,
          status: 200,
          headers: { get: (name) => name === 'X-Provider-Freshness' ? 'live' : 'MISS' },
          json: async () => [{ player_id: '999', team_abbr: 'OKC', est_ba: 0.280, est_slg: 0.470, hard_hit_percent: 42.1, brl_percent: 11.5 }],
          text: async () => JSON.stringify([{ player_id: '999', team_abbr: 'OKC', est_ba: 0.280, est_slg: 0.470, hard_hit_percent: 42.1, brl_percent: 11.5 }]),
        };
      }
      return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
    }));

    const overview = await getMinorLeagueTeamOverview(119, 11, 2026);
    expect(overview.hitting.ops).toBe(0.833);
    expect(overview.hitting.homeRuns).toBe(142);

    const savant = await getTeamSavantMetrics('OKC', 2026);
    expect(savant.expectedBA).toBe(0.280);
    expect(savant.expectedSLG).toBe(0.470);
    expect(savant.hardHitPercent).toBe(42.1);
    expect(savant.barrelPercent).toBe(11.5);
  });
});
