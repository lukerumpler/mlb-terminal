import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';

vi.mock('../client/src/components/BallparkWeatherPanel.jsx', () => ({
  default: () => null,
}));

vi.mock('../client/src/api/mlb.js', async () => {
  const actual = await vi.importActual('../client/src/api/mlb.js');
  return {
    ...actual,
    getTeamModelSources: vi.fn(),
    getTeamAggregateWar: vi.fn(),
  };
});

import OverviewPage from '../client/src/pages/OverviewPage.jsx';
import * as mlbApi from '../client/src/api/mlb.js';
import { __resetFanGraphsLocalSnapshotForTests, __resetMlbClientStateForTests, __resetTeamScheduleSnapshotCacheForTests } from '../client/src/api/mlb.js';
import { __resetFeedClientStateForTests } from '../client/src/api/feed.js';

describe('Team WAR hero (HANDOFF §9-10)', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
    __resetMlbClientStateForTests();
    __resetFanGraphsLocalSnapshotForTests();
    __resetTeamScheduleSnapshotCacheForTests();
    __resetFeedClientStateForTests();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => ({}),
        text: async () => JSON.stringify({}),
      }))
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    __resetFeedClientStateForTests();
    __resetTeamScheduleSnapshotCacheForTests();
  });

  it('renders a large, dedicated hero value with real division-average context, and does not repeat Team WAR in the flat metrics strip', async () => {
    mlbApi.getTeamModelSources.mockResolvedValue({
      found: true,
      retrievedAt: '2026-08-14T02:02:00.000Z',
      source: 'FanGraphs',
      playoffOdds: 72.4,
      teamWar: 31.4,
      statuses: { playoffOdds: 'live', teamWar: 'live' },
    });
    mlbApi.getTeamAggregateWar.mockResolvedValue({
      teamWar: 31.4,
      divisionAverageWAR: 23.9,
      source: 'FanGraphs aggregate Team WAR',
      freshness: 'live',
      retrievedAt: '2026-08-14T02:02:00.000Z',
      status: 'live',
    });

    render(<OverviewPage />);

    const hero = await screen.findByRole('group', { name: 'Team WAR' });
    // The hero container itself renders immediately regardless of data
    // state (loading/unavailable/loaded all share the same role+label), so
    // wait for the actual resolved value rather than just the container.
    expect(await within(hero).findByText('31.4')).toBeInTheDocument();
    expect(within(hero).getByText(/\+7\.5 vs .* avg/)).toBeInTheDocument();

    // The flat "Season team metrics" strip should not carry a second,
    // duplicate Team WAR entry now that it has its own hero block.
    const metricsStrip = screen.getByLabelText('Season team metrics');
    expect(within(metricsStrip).queryByText('Team WAR')).not.toBeInTheDocument();
    expect(global.__consoleErrors.length).toBe(0);
  });

  it('shows the HANDOFF-specified unavailable state — an em dash, "Unavailable", and "Source data unavailable" — rather than a fabricated value', async () => {
    mlbApi.getTeamModelSources.mockResolvedValue({ found: false });
    mlbApi.getTeamAggregateWar.mockResolvedValue({ status: 'unavailable' });

    render(<OverviewPage />);

    const hero = await screen.findByRole('group', { name: 'Team WAR' });
    expect(within(hero).getByText('—')).toBeInTheDocument();
    expect(within(hero).getByText('Unavailable')).toBeInTheDocument();
    expect(within(hero).getByText('Source data unavailable')).toBeInTheDocument();
    expect(global.__consoleErrors.length).toBe(0);
  });
});
