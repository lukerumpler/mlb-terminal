import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseFanGraphsModelHtml } from '../server/api/fangraphs-models.js';

const overviewSource = readFileSync('/home/ubuntu/skip-baseball/client/src/pages/OverviewPage.jsx', 'utf8');

describe('FanGraphs model source adapter', () => {
  it('parses team playoff odds and team WAR when the upstream exposes HTML tables', () => {
    const oddsHtml = '<table><tr><th>Team</th><th>Playoff Odds</th></tr><tr><td>LAD</td><td>87.5%</td></tr></table>';
    const warHtml = '<table><tr><th>Team</th><th>WAR</th></tr><tr><td>LAD</td><td>42.7</td></tr></table>';
    const result = parseFanGraphsModelHtml({ oddsHtml, warHtml }, 'LAD', 2026);
    expect(result.playoffOdds).toBe(87.5);
    expect(result.teamWar).toBe(42.7);
    expect(result.source).toBe('FanGraphs');
    expect(result.season).toBe(2026);
  });

  it('returns null model values when the source markup is blocked or changed', () => {
    const result = parseFanGraphsModelHtml({ oddsHtml: '<html>challenge</html>', warHtml: '' }, 'LAD', 2026);
    expect(result.playoffOdds).toBeNull();
    expect(result.teamWar).toBeNull();
  });
});

describe('Overview model freshness and retry contract', () => {
  it('renders model freshness metadata and exposes a retry action for live-feed errors', () => {
    expect(overviewSource).toContain('getTeamModelSources');
    expect(overviewSource).toContain('FanGraphs');
    expect(overviewSource).toContain('retrieved');
    expect(overviewSource).toContain('setFeedRetryToken');
    expect(overviewSource).toContain('>RETRY</button>');
  });
});
