import { describe, expect, it } from 'vitest';
import { buildTeamScheduleSnapshot } from '../client/src/api/mlb.js';

const finalGame = ({ gamePk, gameDate, homeId, awayId, homeScore, awayScore, homeWon, dayNight = 'night' }) => ({
  gamePk,
  gameDate,
  dayNight,
  status: { abstractGameState: 'Final' },
  teams: {
    home: { team: { id: homeId, name: homeId === 135 ? 'San Diego Padres' : 'Opponent', abbreviation: homeId === 135 ? 'SD' : 'OPP' }, score: homeScore, isWinner: homeWon },
    away: { team: { id: awayId, name: awayId === 135 ? 'San Diego Padres' : 'Opponent', abbreviation: awayId === 135 ? 'SD' : 'OPP' }, score: awayScore, isWinner: !homeWon },
  },
});

describe('official team schedule snapshot', () => {
  it('derives splits and the five latest completed results from one schedule payload', () => {
    const snapshot = buildTeamScheduleSnapshot([
      finalGame({ gamePk: 1, gameDate: '2026-08-17T01:00:00Z', homeId: 135, awayId: 100, homeScore: 5, awayScore: 3, homeWon: true }),
      finalGame({ gamePk: 2, gameDate: '2026-08-18T01:00:00Z', homeId: 100, awayId: 135, homeScore: 4, awayScore: 2, homeWon: true, dayNight: 'day' }),
      { gamePk: 3, gameDate: '2026-08-19T01:00:00Z', status: { abstractGameState: 'Preview' }, teams: {} },
      finalGame({ gamePk: 4, gameDate: '2026-08-19T01:00:00Z', homeId: 101, awayId: 100, homeScore: 2, awayScore: 1, homeWon: true }),
    ], 135);

    expect(snapshot.splitRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ split: 'Home', w: 1, l: 0 }),
      expect.objectContaining({ split: 'Away', w: 0, l: 1 }),
      expect.objectContaining({ split: 'Day', w: 0, l: 1 }),
      expect.objectContaining({ split: 'Night', w: 1, l: 0 }),
    ]));
    expect(snapshot.recentGames).toEqual([
      expect.objectContaining({ gamePk: 2, location: '@', result: 'L', score: '2–4', opponentAbbr: 'OPP' }),
      expect.objectContaining({ gamePk: 1, location: 'vs', result: 'W', score: '5–3', opponentAbbr: 'OPP' }),
    ]);
  });

  it('does not infer an outcome when a completed schedule entry lacks an official score', () => {
    const snapshot = buildTeamScheduleSnapshot([
      finalGame({ gamePk: 5, gameDate: '2026-08-20T01:00:00Z', homeId: 135, awayId: 100, homeScore: null, awayScore: null, homeWon: true }),
    ], 135);

    expect(snapshot.recentGames[0]).toEqual(expect.objectContaining({ result: 'Final', score: '—', isWin: null }));
  });
});
