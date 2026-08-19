import { describe, expect, it } from 'vitest';
import { buildOperationalAlerts, countActionableAlerts, summarizeCacheTelemetry } from '../client/src/lib/operationalAlerts.js';

describe('operational alert sources', () => {
  it('summarizes observed telemetry without treating upstream reads as provider errors', () => {
    const summary = summarizeCacheTelemetry({
      day: '2026-08-18',
      providers: {
        contract: { 'durable-hit': 6, 'stale-hit': 1, 'upstream-miss': 2 },
        'team-financials': { 'durable-hit': 4, 'stale-hit': 0, 'upstream-miss': 3 },
      },
    });

    expect(summary.totals).toEqual({ durableHits: 10, staleHits: 1, upstreamMisses: 5, servedFromCache: 11, total: 16 });
    expect(summary.cacheReusePercent).toBe(69);
    expect(summary.providers.map(provider => provider.label)).toEqual(['Contract', 'Team Financials']);
  });

  it('creates transparent operational alerts from cache and workspace state rather than illustrative player claims', () => {
    const alerts = buildOperationalAlerts({
      cacheHealthStatus: 'ready',
      cacheHealth: {
        day: '2026-08-18',
        providers: { contract: { 'durable-hit': 2, 'stale-hit': 1, 'upstream-miss': 1 } },
      },
      feedFreshnessSummary: { successful: 1, total: 2 },
      lowDataMode: true,
    });

    expect(alerts.map(alert => alert.id)).toEqual(expect.arrayContaining([
      'stale-cache-served',
      'cache-reuse-active',
      'controlled-upstream-reads',
      'feed-freshness-pending',
      'low-data-mode-active',
    ]));
    expect(alerts.every(alert => alert.source)).toBe(true);
    expect(alerts.some(alert => /Ricky Tiedemann|Jordan Walker|Gerrit Cole|Roman Anthony|Ethan Holliday/i.test(`${alert.title} ${alert.body}`))).toBe(false);
    expect(countActionableAlerts(alerts)).toBe(2);
  });

  it('keeps a cache-health read failure clearly distinct from provider freshness', () => {
    const alerts = buildOperationalAlerts({ cacheHealthStatus: 'error' });
    expect(alerts).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'cache-health-unavailable', type: 'warn', source: 'SKIP cache telemetry' }),
    ]));
  });
});
