import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const savantHelpers = vi.hoisted(() => ({
  getTeamSavantMetrics: vi.fn(async () => ({ status:'live', source:'Baseball Savant', retrievedAt:new Date().toISOString() })),
  getTeamExitVelocity: vi.fn(async () => []),
  getTeamBattedBalls: vi.fn(async () => []),
  getTeamBattedBallsAgainst: vi.fn(async () => []),
  getPlayerContactPoints: vi.fn(async () => []),
  getPitcherPitches: vi.fn(async () => []),
}));

vi.mock('../client/src/api/mlb.js', async () => {
  const actual = await vi.importActual('../client/src/api/mlb.js');
  return { ...actual, ...savantHelpers };
});

import OverviewPage from '../client/src/pages/OverviewPage.jsx';

describe('OverviewPage Savant retry helper policy', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok:true, status:200, headers:{ get:() => null }, json:async()=>({}), text:async()=>JSON.stringify({}) })));
  });

  it('does not call Savant helpers again when retry is dispatched during the same UTC day', async () => {
    const updatedAt = Date.now() - 2 * 60 * 60 * 1000;
    localStorage.setItem('skip-team-savant-summary-cache-v1', JSON.stringify({
      '2026:LAD': { updatedAt, data:{ status:'cached', source:'Baseball Savant', retrievedAt:new Date(updatedAt).toISOString() } },
    }));
    localStorage.setItem('skip-team-savant-cache-v1', JSON.stringify({
      '2026:LAD': { updatedAt, data:{ exitVelocityRows:[{ launch_speed:97 }], battedBallRows:[], pitchRows:[] } },
    }));
    localStorage.setItem('skip-team-savant-against-cache-v1', JSON.stringify({
      '2026:LAD': { updatedAt, data:[] },
    }));

    render(<OverviewPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));
    await screen.findByText('cached 2h ago');
    const before = {
      summary: savantHelpers.getTeamSavantMetrics.mock.calls.length,
      exit: savantHelpers.getTeamExitVelocity.mock.calls.length,
      batted: savantHelpers.getTeamBattedBalls.mock.calls.length,
      against: savantHelpers.getTeamBattedBallsAgainst.mock.calls.length,
    };

    fireEvent(window, new CustomEvent('skip-provider-retry', { detail:{ provider:'savant' } }));
    await waitFor(() => {
      expect(savantHelpers.getTeamSavantMetrics).toHaveBeenCalledTimes(before.summary);
      expect(savantHelpers.getTeamExitVelocity).toHaveBeenCalledTimes(before.exit);
      expect(savantHelpers.getTeamBattedBalls).toHaveBeenCalledTimes(before.batted);
      expect(savantHelpers.getTeamBattedBallsAgainst).toHaveBeenCalledTimes(before.against);
    });
  });
});
