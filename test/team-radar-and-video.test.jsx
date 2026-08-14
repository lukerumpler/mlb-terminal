import { describe, expect, it } from 'vitest';
import { buildTeamStrengthData } from '../client/src/pages/OverviewPage.jsx';
import { buildPlayerVideoLinks } from '../client/src/pages/PlayersPage.jsx';

describe('team strength radar data', () => {
  it('keeps the overall and specific-strength axes in a stable order', () => {
    expect(buildTeamStrengthData({
      offense: 92,
      power: 88,
      speed: 61,
      contact: 79,
      pitching: 84,
      command: 76,
    })).toEqual([
      { axis: 'Offense', val: 92 },
      { axis: 'Power', val: 88 },
      { axis: 'Speed', val: 61 },
      { axis: 'Contact', val: 79 },
      { axis: 'Pitching', val: 84 },
      { axis: 'Command', val: 76 },
    ]);
  });

  it('omits unavailable axes instead of converting missing data to zero', () => {
    expect(buildTeamStrengthData({ offense: 92, pitching: null, command: 'not available' })).toEqual([
      { axis: 'Offense', val: 92 },
    ]);
  });
});

describe('source-safe player video cards', () => {
  it('creates official MLB and YouTube search destinations with an MLB preview image', () => {
    const links = buildPlayerVideoLinks({
      id: 660271,
      fullName: 'Shohei Ohtani',
      teamName: 'Los Angeles Dodgers',
      teamAbbreviation: 'LAD',
    });

    expect(links).toHaveLength(2);
    expect(links.map(link => link.source)).toEqual(['MLB', 'YouTube']);
    expect(links.every(link => /^https:\/\/(www\.)?(mlb\.com|youtube\.com)\//.test(link.href))).toBe(true);
    expect(links.every(link => link.thumbnail.includes('/people/660271/headshot/67/current'))).toBe(true);
    expect(links[1].href).toContain(encodeURIComponent('Shohei Ohtani LAD Los Angeles Dodgers baseball MLB'));
  });

  it('returns no cards for an unverified player identity', () => {
    expect(buildPlayerVideoLinks()).toEqual([]);
  });
});
