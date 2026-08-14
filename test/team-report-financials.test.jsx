import { describe, expect, it } from 'vitest';
import { buildPlayerVideoLinks, shouldLoadPlayerVideoThumbnail } from '../client/src/pages/PlayersPage.jsx';
import { getTeamFinancialRows } from '../client/src/pages/PlayersPage.jsx';

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
      tax: { taxPayroll:430290578, taxThreshold:244000000, estimatedTaxBill:180319636, taxSpace:-186290578 },
    })).toEqual([
      { label:'Team Payroll', value:'$311.5M', color:expect.any(String) },
      { label:'Tax Payroll', value:'$430.3M', color:expect.any(String) },
      { label:'CBT Threshold', value:'$244.0M', color:expect.any(String) },
      { label:'Est. Tax Bill', value:'$180.3M', color:expect.any(String) },
      { label:'Tax Space', value:'−$186.3M', color:expect.any(String) },
    ]);
  });

  it('shows em dashes when the financial feed is unavailable', () => {
    expect(getTeamFinancialRows(null).every(row => row.value === '—')).toBe(true);
  });
});
