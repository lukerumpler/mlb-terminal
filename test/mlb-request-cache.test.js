import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getStandings,
  getTeamAffiliates,
  getTodaysGames,
  getMiLBGames,
  getAllTeamStats,
  getTeamPlayerStats,
  getMinorLeagueTeamSchedule,
} = await import('../client/src/api/mlb.js');

describe('MLB request cache optimization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ records: [], teams: [] }),
      text: async () => '',
    }));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps standings cached for repeated reads within the five-minute window', async () => {
    await getStandings(2098);
    vi.advanceTimersByTime(60_000);
    await getStandings(2098);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('keeps affiliate metadata cached for repeated reads within the ten-minute window', async () => {
    await getTeamAffiliates(9998, 2098);
    vi.advanceTimersByTime(5 * 60_000);
    await getTeamAffiliates(9998, 2098);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('caches MLB and MiLB daily schedule helpers for one minute', async () => {
    await getTodaysGames('2098-08-01');
    await getTodaysGames('2098-08-01');
    await getMiLBGames('2098-08-01', [11, 12]);
    await getMiLBGames('2098-08-01', [11, 12]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('caches aggregate and player team-stat helpers for one minute', async () => {
    await getAllTeamStats('hitting', 2098);
    await getAllTeamStats('hitting', 2098);
    await getTeamPlayerStats(9997, 'hitting', 2098);
    await getTeamPlayerStats(9997, 'hitting', 2098);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('caches affiliate schedule windows for one minute', async () => {
    await getMinorLeagueTeamSchedule(9996, 11, 2098, 14);
    await getMinorLeagueTeamSchedule(9996, 11, 2098, 14);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
