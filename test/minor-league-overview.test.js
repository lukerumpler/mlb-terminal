import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MILB_STANDINGS_LEAGUES, getTeamAffiliates, getMinorLeagueTeamOverview } from '../client/src/api/mlb.js';

const overviewSource = readFileSync('/home/ubuntu/skip-baseball/client/src/pages/OverviewPage.jsx', 'utf8');
const mlbSource = readFileSync('/home/ubuntu/skip-baseball/client/src/api/mlb.js', 'utf8');

describe('minor-league team overview contract', () => {
  it('keeps Triple-A on the MLB Stats API sport and standings mapping', () => {
    expect(MILB_STANDINGS_LEAGUES[11]).toBe('117,112');
    expect(mlbSource).toContain('/teams/${mlbTeamId}/affiliates');
    expect(mlbSource).toContain('getMinorLeagueTeamOverview');
  });

  it('exposes affiliate selection and preserves the MLB parent overview', () => {
    expect(overviewSource).toContain('Select minor league affiliate');
    expect(overviewSource).toContain('Minor-League Affiliate Overview');
    expect(overviewSource).toContain('Affiliated with {team.name}');
    expect(overviewSource).toContain('The MLB parent overview remains available above.');
    expect(typeof getTeamAffiliates).toBe('function');
    expect(typeof getMinorLeagueTeamOverview).toBe('function');
  });
});
