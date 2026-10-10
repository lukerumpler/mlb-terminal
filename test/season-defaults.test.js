import { afterEach, describe, expect, it, vi } from 'vitest';

// The season helpers must follow the calendar, not a year baked into the source.
// January still belongs to the prior season; February starts the new one.
async function clientSeasonAt(iso) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
  vi.resetModules();
  const mod = await import('../client/src/constants/data.js');
  return mod.SEASON;
}

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe('client SEASON follows the calendar', () => {
  it('keeps January in the previous season', async () => {
    expect(await clientSeasonAt('2027-01-15T12:00:00Z')).toBe(2026);
    expect(await clientSeasonAt('2028-01-01T00:00:00Z')).toBe(2027);
  });

  it('rolls to the new season in February and stays through December', async () => {
    expect(await clientSeasonAt('2027-02-01T00:00:00Z')).toBe(2027);
    expect(await clientSeasonAt('2027-12-31T23:00:00Z')).toBe(2027);
  });
});

describe('defaults derive from SEASON instead of a literal year', () => {
  it('buildCbtHistorySeasons ends on the current season by default', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-06-01T00:00:00Z'));
    vi.resetModules();
    const { buildCbtHistorySeasons } = await import('../client/src/lib/cbtHistory.js');
    expect(buildCbtHistorySeasons(5)).toEqual([2023, 2024, 2025, 2026, 2027]);
  });

  it('buildHistoricalTaxTrendRows defaults to the three most recent seasons', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-06-01T00:00:00Z'));
    vi.resetModules();
    const { buildHistoricalTaxTrendRows } = await import('../client/src/pages/OverviewPage.jsx');
    expect(buildHistoricalTaxTrendRows([]).map(row => row.season)).toEqual([2025, 2026, 2027]);
  });
});
