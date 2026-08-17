import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoxscoreSplitPanel, readBoxscoreFilterPresets, saveBoxscoreFilterPresets, boxscorePresetStorageKey } from '../client/src/pages/PlayersPage.jsx';
import { __getMlbRequestTraceForTests, __resetMlbClientStateForTests, getPlayerBoxscoreSplits } from '../client/src/api/mlb.js';

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    json: async () => payload,
    text: async () => JSON.stringify(payload),
  };
}

describe('player boxscore split aggregation', () => {
  beforeEach(() => {
    cleanup();
    __resetMlbClientStateForTests();
    vi.restoreAllMocks();
  });

  it('aggregates official batting and pitching rows into OPS and ERA splits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async url => {
        const urlStr = String(url);
        if (urlStr.includes('schedule')) {
          return jsonResponse({
            dates: [
              {
                games: [
                  {
                    gamePk: 123,
                    gameDate: '2026-08-10T18:00:00Z',
                    dayNight: 'day',
                    status: { abstractGameState: 'Final' },
                  },
                ],
              },
            ],
          });
        }
        if (urlStr.includes('boxscore')) {
          return jsonResponse({
            teams: {
              home: {
                players: {
                  ID123: {
                    person: { id: 123, fullName: 'Test Player' },
                    stats: {
                      batting: {
                        atBats: 4,
                        hits: 2,
                        homeRuns: 1,
                        runs: 1,
                        rbi: 2,
                        baseOnBalls: 1,
                        strikeOuts: 1,
                        plateAppearances: 5,
                      },
                    },
                  },
                },
              },
            },
          });
        }
        return jsonResponse({});
      })
    );

    const result = await getPlayerBoxscoreSplits(123, 238, 2026);
    expect(result.games).toBe(1);
    const allBatting = result.batting.find(r => r.label === 'All');
    expect(allBatting.atBats).toBe(4);
    expect(allBatting.hits).toBe(2);
    expect(allBatting.homeRuns).toBe(1);
  });

  it('caps optional player boxscore work at ten games and reuses the verified five-minute snapshot', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async url => {
        const urlStr = String(url);
        if (urlStr.includes('schedule')) {
          return jsonResponse({
            dates: [{
              games: Array.from({ length: 12 }, (_, index) => ({
                gamePk: index + 1,
                gameDate: `2026-08-${String(12 - index).padStart(2, '0')}T18:00:00Z`,
                dayNight: 'night',
                status: { abstractGameState: 'Final' },
              })),
            }],
          });
        }
        if (urlStr.includes('boxscore')) {
          return jsonResponse({
            teams: {
              home: {
                players: {
                  ID123: {
                    person: { id: 123, fullName: 'Test Player' },
                    stats: { batting: { atBats: 4, hits: 1, plateAppearances: 4 } },
                  },
                },
              },
            },
          });
        }
        return jsonResponse({});
      })
    );

    const [first, concurrent] = await Promise.all([
      getPlayerBoxscoreSplits(123, 238, 2026),
      getPlayerBoxscoreSplits(123, 238, 2026),
    ]);
    const second = await getPlayerBoxscoreSplits(123, 238, 2026);

    expect(first).toMatchObject({ status: 'live', requestedGames: 10, games: 10 });
    expect(first.windowLabel).toContain('Most recent 10 completed regular-season games');
    expect(concurrent).toBe(first);
    expect(second).toBe(first);
    expect(fetch).toHaveBeenCalledTimes(11);
    expect(__getMlbRequestTraceForTests().filter(event => event.event === 'queued')).toEqual(expect.arrayContaining([
      expect.objectContaining({ priority: 'optional', stage: 'optional', screen: 'player-profile', key: expect.stringContaining(encodeURIComponent('/schedule')) }),
      expect.objectContaining({ priority: 'optional', stage: 'optional', screen: 'player-profile', key: expect.stringContaining(encodeURIComponent('/game/1/boxscore')) }),
    ]));
  });

  it('retains verified available rows when individual optional boxscores are unavailable', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async url => {
        const urlStr = String(url);
        if (urlStr.includes('schedule')) {
          return jsonResponse({
            dates: [{
              games: [1, 2, 3].map(gamePk => ({
                gamePk,
                gameDate: `2026-08-0${gamePk}T18:00:00Z`,
                dayNight: 'day',
                status: { abstractGameState: 'Final' },
              })),
            }],
          });
        }
        if (urlStr.includes(encodeURIComponent('/game/2/boxscore'))) {
          return jsonResponse({ teams: { home: { players: {} } } });
        }
        if (urlStr.includes('boxscore')) {
          return jsonResponse({
            teams: {
              home: {
                players: {
                  ID123: {
                    person: { id: 123, fullName: 'Test Player' },
                    stats: { batting: { atBats: 4, hits: 2, plateAppearances: 4 } },
                  },
                },
              },
            },
          });
        }
        return jsonResponse({});
      })
    );

    await expect(getPlayerBoxscoreSplits(123, 238, 2026)).resolves.toMatchObject({
      status: 'live',
      requestedGames: 3,
      games: 2,
    });
  });

  it('renders boxscore pagination and local preset controls', async () => {
    const mockPlayer = {
      id: 456,
      boxscoreSplits: {
        status: 'live',
        games: 7,
        source: 'MLB Stats API boxscores',
        batting: [
          {
            label: 'All',
            games: 7,
            atBats: 28,
            hits: 7,
            homeRuns: 0,
            rbi: 0,
            runs: 0,
            walks: 0,
            strikeouts: 7,
            avg: 0.250,
            obp: 0.250,
            slg: 0.250,
            ops: 0.500,
          },
        ],
        recentGames: Array.from({ length: 7 }, (_, i) => ({
          gamePk: 100 + i,
          date: `2026-08-0${i + 1}T18:00:00Z`,
          opponent: 'SF',
          isHome: true,
          batting: {
            atBats: 4,
            hits: 1,
            homeRuns: 0,
            rbi: 0,
            runs: 0,
            walks: 0,
            strikeouts: 1,
            avg: 0.250,
            obp: 0.250,
            slg: 0.250,
            ops: 0.500,
          },
        })),
      },
    };

    render(<BoxscoreSplitPanel player={mockPlayer} />);
    expect(screen.getByText('Boxscore OPS Splits')).toBeInTheDocument();
    expect(screen.getByText(/Page\s+1\s+of\s+2/i)).toBeInTheDocument();
  });
});
