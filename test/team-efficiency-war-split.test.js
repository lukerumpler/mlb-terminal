import { describe, expect, it } from 'vitest';
import { calculateEfficiencyRange, normalizeEfficiencyRecord } from '../server/api/team-efficiency.js';

const financials = { payroll: { totalPayroll: 200_000_000 }, freshness: 'live' };
const base = { team: 'ATL', season: 2026, payrollBasis: 'totalPayroll', financials };
const fg = { team: 'Atlanta Braves', totalWAR: 40, battingWAR: 25, pitchingWAR: 15, defensiveWAR: 4 };
const br = { team: 'Atlanta Braves', totalWAR: 36, pitchingWAR: 13, defensiveWAR: 2 };

describe('team efficiency crowd view', () => {
  it('keeps the headline total as the fWAR/bWAR mean and exposes the crowd detail', () => {
    const record = normalizeEfficiencyRecord({
      ...base,
      warData: { freshness: 'live', teams: [] },
      warRow: fg,
      fanGraphsRow: fg,
      baseballReferenceRow: br,
    });
    expect(record.war.total).toBe(38);
    expect(record.war.consensus).toMatchObject({
      agreement: 'moderate',
      providerCount: 2,
      total: { value: 38, min: 36, max: 40, spread: 4, n: 2 },
      pitching: { value: 14, n: 2 },
      batting: { value: 25, n: 1, providers: ['FanGraphs'] },
      defensive: { value: 3, n: 2 },
    });
    expect(record.war.consensus.agreementLabel).toMatch(/Sources differ/);
    expect(record.war.pitching).toBe(14);
    expect(record.war.offensive).toBe(25);
    expect(record.war.splitProvider).toBe('FanGraphs (batting) · FanGraphs + Baseball-Reference (pitching)');
  });

  it('adds a WAR/$100M range across providers', () => {
    const record = normalizeEfficiencyRecord({ ...base, warData: { freshness: 'live', teams: [] }, warRow: fg, fanGraphsRow: fg, baseballReferenceRow: br });
    expect(record.efficiency.range).toEqual({
      warPer100mLow: 18,
      warPer100mHigh: 20,
      dollarsPerWarLow: 5_000_000,
      dollarsPerWarHigh: 5_555_556,
    });
  });

  it('warns when the providers diverge widely', () => {
    const far = { ...br, totalWAR: 28 };
    const record = normalizeEfficiencyRecord({ ...base, warData: { freshness: 'live', teams: [] }, warRow: fg, fanGraphsRow: fg, baseballReferenceRow: far });
    expect(record.war.consensus.agreement).toBe('low');
    expect(record.warnings.join(' ')).toMatch(/differs by 12\.0.*approximate/);
  });

  it('has no range or cross-check from a single provider', () => {
    const record = normalizeEfficiencyRecord({ ...base, warData: { source: 'FanGraphs', freshness: 'live', teams: [] }, warRow: fg });
    expect(record.war.consensus.agreement).toBe('single-source');
    expect(record.efficiency.range).toBeNull();
    expect(record.war.consensus.defensive).toBeNull();
  });

  it('does not average a team that is at or below replacement into a range', () => {
    expect(calculateEfficiencyRange({ payrollUsd: 100_000_000, totalSummary: { n: 2, min: -1, max: 5 } })).toBeNull();
    expect(calculateEfficiencyRange({ payrollUsd: 100_000_000, totalSummary: { n: 1, min: 5, max: 5 } })).toBeNull();
  });

  it('populates the split from Baseball-Reference alone', () => {
    const record = normalizeEfficiencyRecord({
      ...base,
      warData: { source: 'Baseball-Reference', freshness: 'live', teams: [] },
      warRow: { team: 'Atlanta Braves', battingWAR: 22.1, pitchingWAR: 14.3, totalWAR: 39.6 },
    });
    expect(record.war).toMatchObject({ offensive: 22.1, pitching: 14.3, splitProvider: 'Baseball-Reference', bWAR: 39.6, total: 39.6 });
    expect(record.found).toBe(true);
  });
});
