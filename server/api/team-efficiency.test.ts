import { describe, expect, it } from 'vitest';
import { calculateBlendedWar, calculateSalaryWarEfficiency, normalizeEfficiencyRecord } from './team-efficiency.js';

describe('team salary-to-WAR efficiency', () => {
  it('calculates both reciprocal efficiency measures', () => {
    expect(calculateSalaryWarEfficiency({ payrollUsd: 200_000_000, totalWar: 40 })).toEqual({
      dollarsPerWar: 5_000_000,
      warPer100m: 20,
    });
  });

  it('returns explicit nulls for invalid denominators', () => {
    expect(calculateSalaryWarEfficiency({ payrollUsd: 200_000_000, totalWar: 0 })).toEqual({ dollarsPerWar: null, warPer100m: null });
    expect(calculateSalaryWarEfficiency({ payrollUsd: null, totalWar: 40 })).toEqual({ dollarsPerWar: null, warPer100m: null });
  });

  it('averages fWAR and bWAR and averages defense only when both fields are comparable', () => {
    expect(calculateBlendedWar({ fanGraphsWar: 40, baseballReferenceWar: 36, fanGraphsDefensiveWar: 4, baseballReferenceDefensiveWar: 2 })).toEqual({
      fWAR: 40,
      bWAR: 36,
      blendedWAR: 38,
      defensiveAverage: 3,
      defensiveMethodology: 'Average of comparable FanGraphs and Baseball-Reference defensive WAR',
    });
    expect(calculateBlendedWar({ fanGraphsWar: 40, baseballReferenceWar: null, fanGraphsDefensiveWar: 4 })).toMatchObject({ blendedWAR: 40, defensiveAverage: null });
  });

  it('preserves payroll and WAR source attribution and methodology', () => {
    const row = normalizeEfficiencyRecord({
      team: 'SD',
      season: 2026,
      payrollBasis: 'payroll',
      financials: {
        found: true,
        source: 'Spotrac',
        sourceUrls: { payroll: 'https://spotrac.example/payroll' },
        retrievedAt: '2026-09-23T00:00:00.000Z',
        freshness: 'live',
        payroll: { payroll: 200_000_000 },
      },
      warData: {
        source: 'Baseball-Reference',
        fallback: true,
        sourceUrls: { aggregate: 'https://baseball-reference.example/war' },
        retrievedAt: '2026-09-23T00:05:00.000Z',
        freshness: 'live',
      },
      warRow: { team: 'San Diego Padres', totalWAR: 40, battingWAR: null, pitchingWAR: null },
    });
    expect(row).toMatchObject({
      found: true,
      teamAbbreviation: 'SD',
      efficiency: { dollarsPerWar: 5_000_000, warPer100m: 20, calculationVersion: 'salary-war-v2-blended-fwar-bwar' },
      payroll: { amountUsd: 200_000_000, basis: 'payroll', source: 'Spotrac' },
      war: { total: 40, provider: 'Baseball-Reference', methodology: 'bWAR/rWAR', fallback: true },
    });
    expect(row.sourceUrls).toEqual({
      payroll: 'https://spotrac.example/payroll',
      tax: null,
      war: 'https://baseball-reference.example/war',
    });
  });

  it('uses the blended total for salary efficiency when both provider rows are present', () => {
    const row = normalizeEfficiencyRecord({
      team: 'SD',
      season: 2026,
      payrollBasis: 'payroll',
      financials: { found: true, source: 'Spotrac', sourceUrls: { payroll: 'https://spotrac.example/payroll' }, freshness: 'live', payroll: { payroll: 200_000_000 } },
      warData: {
        source: 'FanGraphs',
        sourceUrls: { batting: 'https://fangraphs.example/batting', pitching: 'https://fangraphs.example/pitching' },
        providerSnapshots: {
          fanGraphs: { sourceUrls: { batting: 'https://fangraphs.example/batting' } },
          baseballReference: { sourceUrls: { aggregate: 'https://baseball-reference.example/war' } },
        },
        freshness: 'live',
      },
      fanGraphsRow: { team: 'San Diego Padres', totalWAR: 40, defensiveWAR: 4 },
      baseballReferenceRow: { team: 'San Diego Padres', totalWAR: 36, defensiveWAR: 2 },
    });
    expect(row).toMatchObject({
      found: true,
      war: { total: 38, fWAR: 40, bWAR: 36, defensive: 3, methodology: 'Blended fWAR/bWAR average' },
      efficiency: { dollarsPerWar: 5_263_158, warPer100m: 19 },
    });
  });
});
