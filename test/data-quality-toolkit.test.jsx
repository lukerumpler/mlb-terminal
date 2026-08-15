import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { buildReconciliationRows, buildDataQualityPayload, buildDataQualityCsv, buildTeamDataQualityPayload, buildTeamDataQualityCsv } from '../client/src/lib/dataQuality.js';
import DataSourceStatusCenter from '../client/src/components/DataSourceStatusCenter.jsx';

describe('data-quality reconciliation and export helpers', () => {
  it('classifies verified aggregate and boxscore metrics without inventing missing values', () => {
    const rows = buildReconciliationRows({
      aggregate: { avg: 0.300, obp: 0.360, slg: 0.500, ops: 0.860, homeRuns: 20, plateAppearances: 300 },
      boxscore: { avg: 0.300, obp: 0.358, slg: 0.500, ops: 0.858, homeRuns: 19, plateAppearances: 295 },
      isPitcher: false,
    });
    expect(rows.find(row => row.metric === 'AVG').status).toBe('match');
    expect(rows.find(row => row.metric === 'OBP').status).toBe('variance');
    expect(rows.find(row => row.metric === 'Home Runs').variance).toBe(-1);
    const incomplete = buildReconciliationRows({ aggregate: { era: 3.4 }, boxscore: { era: null }, isPitcher: true });
    expect(incomplete.every(row => ['incomplete', 'match', 'variance'].includes(row.status))).toBe(true);
    expect(incomplete.find(row => row.metric === 'ERA').status).toBe('incomplete');
  });

  it('includes source and freshness metadata in both structured and CSV exports', () => {
    const payload = buildDataQualityPayload({
      player: { id: 7, fullName: 'Verified Player', statSeason: 2026, stats: {}, aggregateRetrievedAt: '2026-08-15T00:00:00.000Z', boxscoreSplits: { retrievedAt: '2026-08-15T00:05:00.000Z', source: 'MLB Stats API boxscores', games: 12, requestedGames: 20 } },
      rows: [{ metric: 'OPS', aggregate: 0.8, boxscore: 0.79, variance: -0.01, status: 'variance' }],
    });
    const csv = buildDataQualityCsv(payload);
    expect(payload.sources.aggregate.retrievedAt).toContain('2026-08-15');
    expect(payload.sources.boxscore.games).toBe(12);
    expect(csv).toContain('aggregate_retrieved_at');
    expect(csv).toContain('Verified Player');
    expect(csv).toContain('variance');
  });

  it('exports current team metrics with separate source timestamps', () => {
    const payload = buildTeamDataQualityPayload({
      team: { id: 119, abbr: 'LAD', name: 'Los Angeles Dodgers', season: 2026, ops: 0.755, era: 3.4, hr: 122 },
      liveTeamDataUpdatedAt: '2026-08-15T00:00:00.000Z',
      teamPlayersUpdatedAt: '2026-08-15T00:01:00.000Z',
      teamModelData: { teamWar: 28.6, source: 'FanGraphs', retrievedAt: '2026-08-15T00:02:00.000Z', freshness: 'live' },
      teamSavantData: { exitVelocity: 89.4, source: 'Baseball Savant', retrievedAt: '2026-08-15T00:03:00.000Z' },
    });
    const csv = buildTeamDataQualityCsv(payload);
    expect(payload.team.name).toBe('Los Angeles Dodgers');
    expect(payload.sources.teamModels.retrievedAt).toContain('00:02');
    expect(csv).toContain('teamWar');
    expect(csv).toContain('FanGraphs');
    expect(csv).toContain('2026-08-15T00:03:00.000Z');
  });
});

describe('data-source status center', () => {
  it('shows independent providers and dispatches only the selected retry event', async () => {
    const user = userEvent.setup();
    const retry = vi.fn();
    window.addEventListener('skip-provider-retry', retry);
    render(<DataSourceStatusCenter settings={{ enabled: true, displayMode: 'relative' }} successes={{}} />);
    expect(screen.getByText('MLB Stats API')).toBeInTheDocument();
    expect(screen.getByText('MLB boxscore feed')).toBeInTheDocument();
    expect(screen.getByText('NCAA feed')).toBeInTheDocument();
    expect(screen.getByText('FanGraphs')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry FanGraphs' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(retry.mock.calls[0][0].detail.provider).toBe('fangraphs');
    await user.click(screen.getByRole('button', { name: 'Retry NCAA feed' }));
    expect(retry.mock.calls[1][0].detail.provider).toBe('ncaa');
    await user.click(screen.getByRole('button', { name: 'Retry MLB boxscore feed' }));
    expect(retry.mock.calls[2][0].detail.provider).toBe('boxscore');
    expect(retry).toHaveBeenCalledTimes(3);
    window.removeEventListener('skip-provider-retry', retry);
  });
});
