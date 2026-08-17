import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getMinorLeagueTeamSchedule, __resetMlbClientStateForTests } from '../client/src/api/mlb.js';

describe('Schedule fallback caching mechanism', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-15T12:00:00Z'));
    __resetMlbClientStateForTests();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('serves previously fetched schedule data when the API returns a transient 502 error', async () => {
    // 1. First fetch succeeds with games
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        dates: [
          {
            games: [
              {
                gamePk: 101,
                gameDate: '2026-08-15T18:00:00Z',
                status: { abstractGameState: 'Preview' },
                teams: {
                  home: { team: { id: 1, name: 'Oklahoma City Comets' }, score: 0 },
                  away: { team: { id: 2, name: 'Tacoma Rainiers' }, score: 0 },
                },
              },
            ],
          },
        ],
      }),
      text: async () => '',
    });

    const res1 = await getMinorLeagueTeamSchedule(999, 11, 2026, 14);
    expect(res1.games.length).toBe(1);
    expect(fetch).toHaveBeenCalledTimes(1);

    // Advance time past the 60s TTL but within stale TTL (10 mins)
    vi.advanceTimersByTime(70_000);

    // 2. Second fetch returns 502 error
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 502,
      json: async () => ({ error: 'Bad Gateway' }),
      text: async () => 'Bad Gateway',
    });

    const res2 = await getMinorLeagueTeamSchedule(999, 11, 2026, 14);
    expect(res2.games.length).toBe(1);
    expect(res2.games[0].gamePk).toBe(101);
  });
});
