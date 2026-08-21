import { describe, expect, it } from 'vitest';
import { getLeaders, isHittingLeaderRow, isPitchingLeaderRow } from '../client/src/pages/OverviewPage.jsx';

describe('Team Leaders role separation', () => {
  const qualifiedHitter = {
    id: 1,
    name: 'Verified Hitter',
    stat: { plateAppearances: 520, homeRuns: 29, avg: '.303', ops: '.941', rbi: 83, stolenBases: 18 },
  };
  const pitchingRowInHittingData = {
    id: 2,
    name: 'Pitcher In Batting Data',
    stat: { inningsPitched: '121.0', homeRuns: 99, avg: '.500', ops: '1.400', rbi: 120, stolenBases: 40 },
  };
  const qualifiedPitcher = {
    id: 3,
    name: 'Verified Pitcher',
    stat: { inningsPitched: '142.1', era: '2.76', strikeOuts: 166, whip: '0.94', wins: 15, saves: 0 },
  };
  const hitterInPitchingData = {
    id: 4,
    name: 'Hitter In Pitching Data',
    stat: { plateAppearances: 540, era: '0.01', strikeOuts: 999, whip: '0.01', wins: 99, saves: 99 },
  };
  const smallSamplePitcher = {
    id: 5,
    name: 'Small Sample Pitcher',
    stat: { inningsPitched: '2.0', era: '0.00', strikeOuts: 6, whip: '0.25', wins: 1, saves: 2 },
  };

  it('uses PA-only rows for batting leaders and IP-only rows for pitching leaders', () => {
    expect(isHittingLeaderRow(qualifiedHitter)).toBe(true);
    expect(isHittingLeaderRow(pitchingRowInHittingData)).toBe(false);
    expect(isPitchingLeaderRow(qualifiedPitcher)).toBe(true);
    expect(isPitchingLeaderRow(hitterInPitchingData)).toBe(false);
  });

  it('shows five verified categories per group and protects rate leaders from small pitcher samples', () => {
    const leaders = getLeaders(
      [qualifiedHitter, pitchingRowInHittingData],
      [qualifiedPitcher, hitterInPitchingData, smallSamplePitcher],
    );

    expect(leaders.batting.map(row => row.cat)).toEqual(['HR', 'AVG', 'OPS', 'RBI', 'SB']);
    expect(leaders.pitching.map(row => row.cat)).toEqual(['ERA', 'K', 'WHIP', 'W', 'SV']);
    expect(leaders.batting.every(row => row.player === 'Verified Hitter')).toBe(true);
    expect(leaders.pitching.slice(0, 4).every(row => row.player === 'Verified Pitcher')).toBe(true);
    expect(leaders.pitching.find(row => row.cat === 'SV')).toMatchObject({ player: 'Small Sample Pitcher', val: '2' });
    expect(leaders.batting.find(row => row.cat === 'AVG')).toMatchObject({ val: '.303' });
    expect(leaders.batting.find(row => row.cat === 'OPS')).toMatchObject({ val: '.941' });
  });
});
