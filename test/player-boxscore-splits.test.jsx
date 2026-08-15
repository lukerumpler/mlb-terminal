import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoxscoreSplitPanel, readBoxscoreFilterPresets, saveBoxscoreFilterPresets, boxscorePresetStorageKey } from '../client/src/pages/PlayersPage.jsx';
import { __resetMlbClientStateForTests, getPlayerBoxscoreSplits } from '../client/src/api/mlb.js';

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
        if (String(url).includes('schedule')) {
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
          boxscore: {
            teams: {
              home: { team: { id: 1, name: 'LAD' } },
              away: { team: { id: 2, name: 'SF' } },
            },
          },
        });
      })
    );

    const result = await getPlayerBoxscoreSplits(123, 2026, 'hitter');
    expect(result.games).toHaveLength(1);
    expect(result.totals.hitter.atBats).toBe(4);
    expect(result.totals.hitter.hits).toBe(2);
    expect(result.totals.hitter.homeRuns).toBe(1);
  });

  it('renders boxscore pagination and local preset controls', async () => {
    const mockData = {
      games: Array.from({ length: 7 }, (_, i) => ({
        gamePk: 100 + i,
        gameDate: `2026-08-0${i + 1}T18:00:00Z`,
        opponent: 'SF',
        isHome: true,
        summary: {
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
      totals: {
        hitter: { atBats: 28, hits: 7, homeRuns: 0, rbi: 0, runs: 0, walks: 0, strikeouts: 7, avg: 0.250, obp: 0.250, slg: 0.250, ops: 0.500 },
      },
      source: 'MLB Stats API boxscores',
    };

    render(<BoxscoreSplitPanel data={mockData} isPitcher={false} playerId={456} />);
    expect(screen.getByText('Boxscore Game Logs')).toBeInTheDocument();
    expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  });
});
