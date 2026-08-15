import { describe, expect, it, vi } from 'vitest';
import { humanizeAffiliateOverviewState, resolveTeamSavantSnapshot, savantFreshnessLabel } from '../client/src/pages/OverviewPage.jsx';
import { isSameUtcDay } from '../client/src/lib/teamDataCache.js';

describe('nightly Savant refresh policy', () => {
  it('uses a two-hour-old team snapshot without making provider requests', async () => {
    const now = Date.parse('2026-08-15T18:00:00.000Z');
    const getTeamExitVelocityFn = vi.fn();
    const getTeamBattedBallsFn = vi.fn();
    const result = await resolveTeamSavantSnapshot({
      teamAbbr: 'LAD',
      season: 2026,
      now,
      cached: {
        updatedAt: now - 2 * 60 * 60 * 1000,
        data: { exitVelocityRows: [{ launch_speed: 97 }], battedBallRows: [], pitchRows: [] },
      },
      getTeamExitVelocityFn,
      getTeamBattedBallsFn,
    });

    expect(result.cacheHit).toBe(true);
    expect(getTeamExitVelocityFn).not.toHaveBeenCalled();
    expect(getTeamBattedBallsFn).not.toHaveBeenCalled();
  });

  it('reuses same-day cache even when a manual retry token changes', () => {
    const morning = Date.parse('2026-08-15T02:00:00.000Z');
    const lateNight = Date.parse('2026-08-15T23:00:00.000Z');
    expect(isSameUtcDay(morning, lateNight)).toBe(true);
    expect(isSameUtcDay(morning, Date.parse('2026-08-16T00:00:00.000Z'))).toBe(false);
  });

  it('shows an explicit cached age instead of only the fused provider badge', () => {
    const retrievedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(savantFreshnessLabel({ status: 'cached', retrievedAt })).toMatch(/^cached 2h ago$/);
  });

  it('humanizes affiliate state-machine values instead of exposing raw states', () => {
    expect(humanizeAffiliateOverviewState('error')).toBe('live overview unavailable');
    expect(humanizeAffiliateOverviewState('loading')).toBe('stats loading');
    expect(humanizeAffiliateOverviewState('identity-ready')).toBe('stats loading');
    expect(humanizeAffiliateOverviewState('idle')).toBe('status unavailable');
    expect(humanizeAffiliateOverviewState('error')).not.toBe('error');
  });
});
