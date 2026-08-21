import { describe, expect, it } from 'vitest';
import { fmtScorebookRate, fmtWinPct } from '../client/src/lib/formatting.js';
import { filterActivePlayerSearchResults } from '../client/src/api/mlb.js';

describe('baseball winning-percentage formatting', () => {
  it('uses scorebook-style leading-decimal notation for fractional record percentages', () => {
    expect(fmtWinPct(0.598)).toBe('.598');
    expect(fmtWinPct('0.625')).toBe('.625');
    expect(fmtWinPct(0.5946)).toBe('.595');
  });

  it('preserves valid boundary values and reports unavailable or invalid input honestly', () => {
    expect(fmtWinPct(0)).toBe('.000');
    expect(fmtWinPct(1)).toBe('1.000');
    expect(fmtWinPct(null)).toBe('—');
    expect(fmtWinPct(1.2)).toBe('—');
  });
});

describe('baseball AVG and OPS formatting', () => {
  it('uses scorebook notation for batting average and OPS while retaining values above one', () => {
    expect(fmtScorebookRate(0.276)).toBe('.276');
    expect(fmtScorebookRate('0.845')).toBe('.845');
    expect(fmtScorebookRate(1.017)).toBe('1.017');
    expect(fmtScorebookRate(0)).toBe('.000');
  });
});

describe('active player search filtering', () => {
  it('keeps active and status-unspecified player matches while removing known inactive records', () => {
    const rows = filterActivePlayerSearchResults([
      { id: 1, fullName: 'Active Player', active: true },
      { id: 2, fullName: 'Inactive Player', active: false },
      { id: 3, fullName: 'Retired Player', rosterStatus: 'Retired' },
      { id: 4, fullName: 'Inactive Flag Player', active: 'N' },
      { id: 5, fullName: 'Status Unspecified Player' },
    ]);
    expect(rows.map(row => row.id)).toEqual([1, 5]);
  });
});
