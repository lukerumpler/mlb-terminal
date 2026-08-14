import { describe, expect, it } from 'vitest';
import { buildPlayerVideoLinks, shouldLoadPlayerVideoThumbnail } from '../client/src/pages/PlayersPage.jsx';
import { getTeamFinancialRows, getRepeaterTierSeverity } from '../client/src/pages/PlayersPage.jsx';

describe('player video descriptions', () => {
  it('provides concise source-specific descriptions for hover and keyboard tooltips', () => {
    const links = buildPlayerVideoLinks({ id:660271, fullName:'Shohei Ohtani', teamAbbreviation:'LAD' });
    expect(links[0].description).toContain('Official MLB video search');
    expect(links[1].description).toContain('YouTube search');
    expect(links.every(link => link.description.length < 150)).toBe(true);
    expect(shouldLoadPlayerVideoThumbnail({ saveData:false, thumbnail:links[0].thumbnail })).toBe(true);
    expect(shouldLoadPlayerVideoThumbnail({ saveData:true, thumbnail:links[0].thumbnail })).toBe(false);
  });
});

describe('team financial rows', () => {
  it('formats payroll and luxury-tax fields for contract valuation panels', () => {
    expect(getTeamFinancialRows({
      payroll: { payroll:311496026 },
      tax: { taxPayroll:430290578, taxThreshold:244000000, estimatedTaxBill:180319636, taxSpace:-186290578, repeaterTier:'History unavailable' },
    })).toEqual([
      { label:'Team Payroll', value:'$311.5M', color:expect.any(String) },
      { label:'Tax Payroll', value:'$430.3M', color:expect.any(String) },
      { label:'CBT Threshold', value:'$244.0M', color:expect.any(String) },
      { label:'Est. Tax Bill', value:'$180.3M', color:expect.any(String) },
      { label:'Tax Space', value:'−$186.3M', color:expect.any(String) },
      { label:'Repeater Tier', value:'History unavailable', color:expect.any(String) },
    ]);
  });

  it('uses increasing visual severity for first-, second-, and third-plus-year tiers', () => {
    expect(getRepeaterTierSeverity(1).key).toBe('lower');
    expect(getRepeaterTierSeverity(2).key).toBe('watch');
    expect(getRepeaterTierSeverity(3).key).toBe('severe');
    expect(getRepeaterTierSeverity(1).color).not.toBe(getRepeaterTierSeverity(3).color);
    expect(getRepeaterTierSeverity(null).key).toBe('unknown');
  });

  it('shows unavailable strings or em dashes when the financial feed is unavailable', () => {
    const rows = getTeamFinancialRows(null);
    expect(rows.some(row => row.value === 'History unavailable' || row.value === '—')).toBe(true);
  });
});
