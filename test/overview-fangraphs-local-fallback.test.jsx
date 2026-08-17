import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import OverviewPage from '../client/src/pages/OverviewPage.jsx';

const modelKey = 'skip-fangraphs-model-snapshot-v1:/api/fangraphs-models?team=LAD&season=2026';
const aggregateKey = 'skip-fangraphs-aggregate-snapshot-v1:/api/fangraphs-models?mode=aggregate&season=2026';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('rendered FanGraphs local fallback', () => {
  beforeEach(() => {
    cleanup();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('shows verified stale model values and readable local-cache freshness after provider failure', async () => {
    const savedAt = Date.now() - 2 * 60 * 60 * 1000;
    localStorage.setItem(modelKey, JSON.stringify({
      savedAt,
      data: {
        found: true,
        retrievedAt: new Date(savedAt).toISOString(),
        source: 'FanGraphs',
        playoffOdds: 88.1,
        teamWar: 42.4,
        statuses: { playoffOdds: 'live', teamWar: 'live' },
        advancedMetrics: { projectedWins: 95.4, projectedLosses: 66.6, offenseWar: 29.1, defenseWar: 8.4 },
      },
    }));
    localStorage.setItem(aggregateKey, JSON.stringify({
      savedAt,
      data: { teams: [], statuses: { batting: 'unavailable', pitching: 'unavailable' } },
    }));

    vi.stubGlobal('fetch', vi.fn(async url => {
      if (String(url).includes('/api/fangraphs-models')) return jsonResponse({ error: 'FanGraphs unavailable' }, 502);
      return jsonResponse({});
    }));

    render(<OverviewPage />);

    expect((await screen.findAllByText('42.4')).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText(/local cached/i)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('88.1%').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('FanGraphs').length).toBeGreaterThan(0);
  });
});
