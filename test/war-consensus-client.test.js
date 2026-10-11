import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getLeagueTeamsWar, getTeamAggregateWar, teamWarConsensus, __resetProviderJsonCacheForTests } from '../client/src/api/mlb.js';

const json = data => new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
const fg = [
  { team: 'San Diego Padres', battingWAR: 25, pitchingWAR: 15, totalWAR: 40 },
  { team: 'Los Angeles Dodgers', battingWAR: 28, pitchingWAR: 17, totalWAR: 45 },
];
const br = [
  { team: 'San Diego Padres', pitchingWAR: 13, totalWAR: 36 },
  { team: 'Los Angeles Dodgers', pitchingWAR: 16, totalWAR: 44 },
];
const both = { source: 'FanGraphs', teams: fg, providerSnapshots: { fanGraphs: { teams: fg }, baseballReference: { teams: br } } };
const fgBlocked = { source: 'Baseball-Reference', teams: br, providerSnapshots: { fanGraphs: null, baseballReference: { teams: br } } };

describe('client crowd consensus', () => {
  beforeEach(() => { localStorage.clear(); __resetProviderJsonCacheForTests(); });
  afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); __resetProviderJsonCacheForTests(); });

  it('teamWarConsensus reports agreement and per-component providers', () => {
    const c = teamWarConsensus(fg[0], br[0]);
    expect(c).toMatchObject({
      agreement: 'moderate',
      providerCount: 2,
      total: { value: 38, spread: 4 },
      pitching: { value: 14, n: 2 },
      batting: { value: 25, n: 1, providers: ['FanGraphs'] },
    });
    expect(c.agreementLabel).toMatch(/Sources differ/);
  });

  it('getTeamAggregateWar exposes the crowd view for the selected team', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(both)));
    const result = await getTeamAggregateWar('San Diego Padres', ['San Diego Padres', 'Los Angeles Dodgers'], 2026);
    expect(result.teamWar).toBe(38);
    expect(result.warConsensus).toMatchObject({ agreement: 'moderate', providerCount: 2 });
    const padres = result.divisionTeams.find(row => row.team === 'San Diego Padres');
    expect(padres).toMatchObject({ fWAR: 40, bWAR: 36, totalWAR: 38, agreement: 'moderate', spread: 4 });
    expect(result.divisionTeams.find(row => row.team === 'Los Angeles Dodgers')).toMatchObject({ agreement: 'high', spread: 1 });
  });

  it('with FanGraphs blocked, division rows do not call a bWAR value "fWAR" or claim a blend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(fgBlocked)));
    const result = await getTeamAggregateWar('San Diego Padres', ['San Diego Padres', 'Los Angeles Dodgers'], 2026);
    const padres = result.divisionTeams.find(row => row.team === 'San Diego Padres');
    expect(padres).toMatchObject({ fWAR: null, bWAR: 36, totalWAR: 36, agreement: 'single-source', spread: null, methodology: 'bWAR/rWAR' });
    expect(result.warConsensus.agreement).toBe('single-source');
  });

  it('league rows get the same honest labelling when FanGraphs is blocked', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(fgBlocked)));
    const rows = await getLeagueTeamsWar(2026);
    expect(rows.find(row => row.team === 'san diego padres')).toEqual({ team: 'san diego padres', totalWAR: 36, fWAR: null, bWAR: 36, methodology: 'bWAR/rWAR' });
  });
});
