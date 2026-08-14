import { describe, expect, it } from 'vitest';
import { getExtensionTaxWarning } from '../client/src/pages/PlayersPage.jsx';
import { buildTeamFinancialCsv, buildTeamFinancialCsvRows } from '../client/src/lib/csvExports.js';

describe('player extension surcharge warnings', () => {
  it('warns when current tax payroll is above the CBT threshold', () => {
    const warning = getExtensionTaxWarning({ teamFinancials:{ tax:{ taxPayroll:430_000_000, taxThreshold:244_000_000, estimatedTaxBill:180_000_000, repeaterYears:3, repeaterTier:'Third consecutive year or more' } } });
    expect(warning.kind).toBe('warning');
    expect(warning.overage).toBe(186_000_000);
    expect(warning.severity.key).toBe('severe');
    expect(warning.message).toContain('above the CBT threshold');
    expect(warning.message).toContain('surcharge');
  });

  it('does not fabricate a warning when verified payroll fields are unavailable', () => {
    expect(getExtensionTaxWarning({ teamFinancials:{ tax:{ taxPayroll:null, taxThreshold:null } } })).toBeNull();
  });
});

describe('team financial CSV export', () => {
  const financials = {
    season:2026,
    source:'Spotrac payroll tracker',
    sourceUrls:{ tax:'https://www.spotrac.com/mlb/tax' },
    payroll:{ payroll:311_496_026 },
    tax:{ taxPayroll:430_290_578, taxThreshold:244_000_000, estimatedTaxBill:180_319_636, taxSpace:-186_290_578, repeaterTier:'History unavailable' },
  };
  const projection = { source:'https://www.mlb.com/glossary/transactions/competitive-balance-tax', rows:[{ season:2026, projectedAav:25_000_000, projectedTaxPayroll:455_000_000, overage:211_000_000, repeaterTier:'History unavailable', surchargeBand:'+$60M or more surcharge', estimatedTax:null }] };

  it('includes payroll, CBT, repeater, and projection records with source URLs', () => {
    const rows = buildTeamFinancialCsvRows({ teamName:'Los Angeles Dodgers', teamFinancials:financials, taxProjection:projection });
    expect(rows[0]).toEqual(['record_type','team','season','metric','value','source']);
    expect(rows.some(row => row[3] === 'repeater_tier')).toBe(true);
    expect(rows.some(row => row[3] === 'surcharge_band')).toBe(true);
    expect(rows.at(-1)?.at(-1)).toContain('mlb.com/glossary/transactions/competitive-balance-tax');
  });

  it('returns a valid CSV with a header and escaped team names', () => {
    const csv = buildTeamFinancialCsv({ teamName:'Club, Test', teamFinancials:financials, taxProjection:projection });
    expect(csv.startsWith('record_type,team,season,metric,value,source\n')).toBe(true);
    expect(csv).toContain('"Club, Test"');
    expect(csv).toContain('estimated_tax');
  });
});
