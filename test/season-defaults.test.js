/*
Our goal is to make sure our season numbers follow the calendar instead of a year typed into the code. Several places used to
say 2026 directly, so they would have kept showing 2026 data after the season changed. MLB's season rule for us is: January
still belongs to the season that just ended, and February is when the new season starts.

To solve this we are going to:
  1. Move our clock to different dates (only the date is faked) and load our code fresh each time
  2. Check the season number the browser code picks: January stays in the old season, February moves to the new one
  3. Check that the helper functions which used to have 2026 typed in now build their seasons from that number
  4. Cross-check around the edges: January 1st, February 1st and December 31st
*/
import { afterEach, describe, expect, it, vi } from 'vitest';

// Section A: Setting our clock

async function clientSeasonAt(iso) {
  /*
  Our "clientSeasonAt" is a function that asks "what season is it" on a date we pick. When we give it:
                  a date and time as text, like '2027-02-01T00:00:00Z'
  it returns to us:
                  the season number our browser code decides on at that moment
  */
  vi.useFakeTimers();                                             // Take control of the clock
  vi.setSystemTime(new Date(iso));                                // Pretend it is this date
  vi.resetModules();                                              // Load our code fresh, since it picks the season when it first loads
  const mod = await import('../client/src/constants/data.js');
  return mod.SEASON;
}

afterEach(() => {
  vi.useRealTimers();                                             // Put the real clock back
  vi.resetModules();
});


// Section B: Our checks

describe('client SEASON follows the calendar', () => {
  it('keeps January in the previous season', async () => {
    expect(await clientSeasonAt('2027-01-15T12:00:00Z')).toBe(2026);    // Mid January 2027 is still the 2026 season
    expect(await clientSeasonAt('2028-01-01T00:00:00Z')).toBe(2027);    // And so is the very first day of 2028
  });

  it('rolls to the new season in February and stays through December', async () => {
    expect(await clientSeasonAt('2027-02-01T00:00:00Z')).toBe(2027);    // February 1st starts the new season
    expect(await clientSeasonAt('2027-12-31T23:00:00Z')).toBe(2027);    // And it lasts until the end of the year
  });
});

describe('defaults derive from SEASON instead of a literal year', () => {
  it('buildCbtHistorySeasons ends on the current season by default', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-06-01T00:00:00Z'));           // June 2027, so the current season is 2027
    vi.resetModules();
    const { buildCbtHistorySeasons } = await import('../client/src/lib/cbtHistory.js');
    expect(buildCbtHistorySeasons(5)).toEqual([2023, 2024, 2025, 2026, 2027]);    // Five seasons, ending on this one
  });

  it('buildHistoricalTaxTrendRows defaults to the three most recent seasons', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2027-06-01T00:00:00Z'));
    vi.resetModules();
    const { buildHistoricalTaxTrendRows } = await import('../client/src/pages/OverviewPage.jsx');
    expect(buildHistoricalTaxTrendRows([]).map(row => row.season)).toEqual([2025, 2026, 2027]);   // Three seasons, ending on this one
  });
});
