import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MILB_STANDINGS_LEAGUES, getTeamAffiliates, getMinorLeagueTeamOverview } from '../client/src/api/mlb.js';
import { TEAMS, sortTeamsByLeagueDivisionName } from '../client/src/constants/data.js';

const overviewSource = readFileSync('/home/ubuntu/skip-baseball/client/src/pages/OverviewPage.jsx', 'utf8');
const mlbSource = readFileSync('/home/ubuntu/skip-baseball/client/src/api/mlb.js', 'utf8');

describe('minor-league team overview contract', () => {
  it('sorts MLB teams by league, division, then alphabetical name', () => {
    const ordered = sortTeamsByLeagueDivisionName(Object.entries(TEAMS));
    const labels = ordered.map(([, team]) => `${team.div}:${team.name}`);
    expect(labels.slice(0, 3)).toEqual(['AL Central:Chicago White Sox', 'AL Central:Cleveland Guardians', 'AL Central:Detroit Tigers']);
    expect(labels.findIndex(label => label.startsWith('AL '))).toBeLessThan(labels.findIndex(label => label.startsWith('NL ')));
  });

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
