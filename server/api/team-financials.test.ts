import { describe, expect, it } from 'vitest';
import { parseTeamPayrollHtml, parseTeamTaxHtml } from './team-financials.js';

const payrollHtml = `
  <table>
    <thead><tr><th>Rank</th><th>Team</th><th>Record</th><th>Avg Age Team</th><th>Total Payroll Allocations</th><th>Active 26-Man</th><th>Injured</th><th>Retained</th><th>Buried</th></tr></thead>
    <tbody><tr><td>1</td><td>LAD LAD</td><td>73-48</td><td>30.2</td><td>$311,496,026</td><td>$228,969,455</td><td>$69,776,556</td><td>$1,639,408</td><td>$11,110,607</td></tr></tbody>
  </table>`;

const taxHtml = `
  <table>
    <thead><tr><th>Rank</th><th>Team</th><th>Record</th><th>Roster</th><th>Status</th><th>Tax Payroll</th><th>Space</th><th>Tax Bill Estimated</th><th>Total Tax Payroll + Est. Bill</th><th>Active</th><th>Injured</th><th>Retained</th><th>Minor</th></tr></thead>
    <tbody><tr><td>1</td><td>LAD LAD</td><td>73-48</td><td>40</td><td>3+-Time</td><td>$430,290,578</td><td>$-186,290,578</td><td>$180,319,636</td><td>$610,610,214</td><td>$336,387,938</td><td>$61,402,625</td><td>-</td><td>$11,193,941</td></tr></tbody>
  </table>
  <table>
    <thead><tr><th>Salaries</th><th>Level Tax Tier</th><th>Amount Over</th></tr></thead>
    <tbody><tr><td>$430,290,578</td><td>$244,000,000</td><td>$186,290,578</td></tr></tbody>
  </table>`;

describe('team financial Spotrac parsers', () => {
  it('maps payroll fields for the requested team and preserves null-safe values', () => {
    expect(parseTeamPayrollHtml(payrollHtml, 'LAD', 2026)).toMatchObject({
      teamAbbr: 'LAD',
      season: 2026,
      payroll: 311496026,
      allocations: null,
      active: 228969455,
      injured: 69776556,
      retained: 1639408,
      buried: 11110607,
      source: 'Spotrac MLB Team Salary Payroll Tracker',
    });
    expect(parseTeamPayrollHtml(payrollHtml, 'NYM', 2026)).toBeNull();
  });

  it('maps tax payroll, tax space, estimated bill, and CBT threshold', () => {
    expect(parseTeamTaxHtml(taxHtml, 'LAD', 2026)).toMatchObject({
      teamAbbr: 'LAD',
      taxPayroll: 430290578,
      taxSpace: -186290578,
      estimatedTaxBill: 180319636,
      totalTaxPayroll: 610610214,
      taxThreshold: 244000000,
      source: 'Spotrac MLB Team Tax Tracker',
    });
  });
});
