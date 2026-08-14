import { describe, expect, it } from 'vitest';
import { buildTeamStrengthData, deriveTeamPlayerRollups } from '../client/src/pages/OverviewPage.jsx';
import { buildPlayerVideoLinks, buildPlayerHighlightSearches, normalizeEmbeddableVideoUrl, loadPlayerPlaylists, savePlayerPlaylists } from '../client/src/pages/PlayersPage.jsx';

describe('team strength radar data', () => {
  it('derives verified baserunning and position-depth rollups from player rows', () => {
    const rollups = deriveTeamPlayerRollups({
      hitting: [
        { position:'OF', stat:{ stolenBases:8, caughtStealing:2, hits:100, doubles:20, triples:2, homeRuns:10, plateAppearances:420 } },
        { position:'SS', stat:{ stolenBases:4, caughtStealing:1, hits:90, doubles:14, triples:1, homeRuns:8, plateAppearances:380 } },
      ],
      pitching: [{ position:'SP', stat:{ inningsPitched:150 } }],
    });
    expect(rollups.stolenBases).toBe(12);
    expect(rollups.caughtStealing).toBe(3);
    expect(rollups.stolenBaseAttempts).toBe(15);
    expect(rollups.extraBaseHits).toBe(55);
    expect(rollups.positions.map(row => row.position)).toEqual(['OF', 'SP', 'SS']);
  });
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

  it('creates interactive key-play searches without fabricating clip timestamps', () => {
    const highlights = buildPlayerHighlightSearches({ fullName:'Shohei Ohtani', teamName:'Los Angeles Dodgers', teamAbbreviation:'LAD' });
    expect(highlights).toHaveLength(4);
    expect(highlights.map(item => item.id)).toEqual(['power','contact','defense','pitching']);
    expect(highlights.every(item => item.href.startsWith('https://www.youtube.com/results?search_query='))).toBe(true);
    expect(highlights.every(item => !item.href.includes('#t='))).toBe(true);
  });

  it('returns no key-play searches without a verified player name', () => {
    expect(buildPlayerHighlightSearches()).toEqual([]);
  });

  it('normalizes verified YouTube URLs for compact embedding', () => {
    expect(normalizeEmbeddableVideoUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toMatchObject({ videoId:'dQw4w9WgXcQ', embedUrl:'https://www.youtube.com/embed/dQw4w9WgXcQ' });
    expect(normalizeEmbeddableVideoUrl('https://www.youtube.com/results?search_query=baseball')).toBeNull();
  });

  it('persists player-specific playlists in local storage', () => {
    localStorage.clear();
    const playlists = [{ id:'my-highlights', name:'My Highlights', clips:[{ id:'clip-1', title:'Opening blast' }] }];
    savePlayerPlaylists(660271, playlists);
    expect(loadPlayerPlaylists(660271)).toEqual(playlists);
  });
});
