import { describe, expect, it } from 'vitest';
import { normalizeEfficiencyRecord, selectWarSplit } from '../server/api/team-efficiency.js';

const financials = { payroll: { totalPayroll: 200_000_000 }, freshness: 'live' };

describe('WAR offensive/pitching split provider', () => {
  it('prefers FanGraphs when it has the split', () => {
    expect(
      selectWarSplit(
        { battingWAR: 20, pitchingWAR: 15 },
        { battingWAR: 22, pitchingWAR: 13 }
      )
    ).toEqual({ offensive: 20, pitching: 15, provider: 'FanGraphs' });
  });

  it('does not mix providers when FanGraphs only has one side', () => {
    expect(
      selectWarSplit({ battingWAR: 20, pitchingWAR: null }, { battingWAR: 22, pitchingWAR: 13 })
    ).toEqual({ offensive: 20, pitching: null, provider: 'FanGraphs' });
  });

  it('falls back to Baseball-Reference when FanGraphs is blocked', () => {
    expect(selectWarSplit(null, { battingWAR: 22, pitchingWAR: 13 })).toEqual({
      offensive: 22,
      pitching: 13,
      provider: 'Baseball-Reference',
    });
  });

  it('reports nothing when neither provider has a split', () => {
    expect(selectWarSplit({ battingWAR: null }, { totalWAR: 30 })).toEqual({
      offensive: null,
      pitching: null,
      provider: null,
    });
  });

  it('populates the efficiency record split from Baseball-Reference alone', () => {
    const record = normalizeEfficiencyRecord({
      team: 'ATL',
      season: 2026,
      payrollBasis: 'totalPayroll',
      financials,
      warData: { source: 'Baseball-Reference', freshness: 'live', teams: [] },
      warRow: { team: 'Atlanta Braves', battingWAR: 22.1, pitchingWAR: 14.3, totalWAR: 39.6 },
    });
    expect(record.war).toMatchObject({
      offensive: 22.1,
      pitching: 14.3,
      splitProvider: 'Baseball-Reference',
      bWAR: 39.6,
      total: 39.6,
    });
    expect(record.found).toBe(true);
  });
});
