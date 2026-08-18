import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import OverviewPage from '../client/src/pages/OverviewPage.jsx';
import { __resetProviderJsonCacheForTests } from '../client/src/api/mlb.js';

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
    __resetProviderJsonCacheForTests();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
    __resetProviderJsonCacheForTests();
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
      if (String(url).includes('/api/intelligence-calculations')) return jsonResponse({
        source:'MLB Stats API', provenance:'calculated-from-verified-standings', freshness:'calculated',
        metrics:{ projectedWins:95.9, projectedLosses:66.1, calculatedPlayoffOdds:90.6, calculatedWarProxy:51.2 },
      });
      return jsonResponse({});
    }));

    render(<OverviewPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));

    expect((await screen.findAllByText('42.4')).length).toBeGreaterThanOrEqual(1);
    expect((await screen.findAllByText(/local cached/i)).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('88.1%')).toBeInTheDocument();
    expect(screen.getAllByText('FanGraphs').length).toBeGreaterThan(0);
  });

it('does not fabricate playoff odds when FanGraphs is unavailable while retaining clearly labeled MLB pace and WAR proxies', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (String(url).includes('/api/fangraphs-models')) return jsonResponse({ found:false, playoffOdds:null, teamWar:null, statuses:{ playoffOdds:'unavailable', teamWar:'unavailable' } });
      if (String(url).includes('/api/intelligence-calculations')) return jsonResponse({
        source:'MLB Stats API', provenance:'calculated-from-verified-standings', freshness:'calculated',
        metrics:{ projectedWins:95.9, projectedLosses:66.1, pythagoreanProjectedWins:91.2, pythagoreanProjectedLosses:70.8, calculatedWarProxy:51.2 },
      });
      return jsonResponse({});
    }));

    render(<OverviewPage />);
    fireEvent.click(screen.getByRole('button', { name: 'Performance' }));

    expect((await screen.findAllByText('Unavailable')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('51.2').length).toBeGreaterThan(0);
    expect(screen.getByText('WAR Proxy')).toBeInTheDocument();
    expect(screen.getByText('Pythag W')).toBeInTheDocument();
    expect(screen.getByText('Pythag L')).toBeInTheDocument();
    expect(screen.getAllByText('91.2').length).toBeGreaterThan(0);
    expect(screen.getAllByText('70.8').length).toBeGreaterThan(0);
    expect(screen.getByText(/Playoff odds: Provider unavailable/i)).toBeInTheDocument();
    expect(screen.getByText(/MLB calculated · pace: record · pythag: RS\/RA · WAR: proxy · playoff odds: FanGraphs only/i)).toBeInTheDocument();
  });

  it('fills blank headline standings values from the verified backend official-standings response', async () => {
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (String(url).includes('/api/fangraphs-models')) return jsonResponse({ found:false, playoffOdds:null, teamWar:null, statuses:{ playoffOdds:'unavailable', teamWar:'unavailable' } });
      if (String(url).includes('/api/intelligence-calculations')) return jsonResponse({
        source:'MLB Stats API', provenance:'calculated-from-verified-standings', freshness:'calculated',
        metrics:{ wins:81, losses:45, winPct:0.643, runsScored:700, runsAllowed:600, runDifferential:100, projectedWins:104.1, projectedLosses:57.9, pythagoreanProjectedWins:92.4, pythagoreanProjectedLosses:69.6, calculatedPlayoffOdds:99, calculatedWarProxy:44.4 },
      });
      return jsonResponse({});
    }));

    render(<OverviewPage />);

    expect(await screen.findByText('81–45')).toBeInTheDocument();
    expect(screen.getByText('700')).toBeInTheDocument();
    expect(screen.getByTestId('calculated-standings-headline-note')).toHaveTextContent(/verified, not projected/i);
  });
});
