function csvCell(value) {
  const text = value == null || value === '' ? '—' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : '—';
}

export function buildTeamFinancialCsvRows({ teamName, teamFinancials, taxProjection } = {}) {
  const payroll = teamFinancials?.payroll || {};
  const tax = teamFinancials?.tax || {};
  const season = teamFinancials?.season || taxProjection?.rows?.[0]?.season || '—';
  const rows = [
    ['record_type','team','season','metric','value','source'],
    ['team_financials', teamName || 'Team unavailable', season, 'team_payroll', money(payroll.payroll), teamFinancials?.source || 'Unavailable'],
    ['team_financials', teamName || 'Team unavailable', season, 'tax_payroll', money(tax.taxPayroll), teamFinancials?.source || 'Unavailable'],
    ['team_financials', teamName || 'Team unavailable', season, 'cbt_threshold', money(tax.taxThreshold), teamFinancials?.sourceUrls?.tax || 'https://www.mlb.com/glossary/transactions/competitive-balance-tax'],
    ['team_financials', teamName || 'Team unavailable', season, 'estimated_tax_bill', money(tax.estimatedTaxBill), teamFinancials?.sourceUrls?.tax || 'Unavailable'],
    ['team_financials', teamName || 'Team unavailable', season, 'tax_space', money(tax.taxSpace), teamFinancials?.sourceUrls?.tax || 'Unavailable'],
    ['team_financials', teamName || 'Team unavailable', season, 'repeater_tier', tax.repeaterTier || 'History unavailable', teamFinancials?.sourceUrls?.tax || 'Unavailable'],
  ];
  (taxProjection?.rows || []).forEach(row => rows.push([
    'multi_year_projection',
    teamName || 'Team unavailable',
    row.season,
    'projected_aav',
    money(row.projectedAav),
    taxProjection?.source || 'https://www.mlb.com/glossary/transactions/competitive-balance-tax',
  ], [
    'multi_year_projection', teamName || 'Team unavailable', row.season, 'projected_tax_payroll', money(row.projectedTaxPayroll), taxProjection?.source || 'Unavailable',
  ], [
    'multi_year_projection', teamName || 'Team unavailable', row.season, 'cbt_overage', money(row.overage), taxProjection?.source || 'Unavailable',
  ], [
    'multi_year_projection', teamName || 'Team unavailable', row.season, 'repeater_tier', row.repeaterTier || 'History unavailable', taxProjection?.source || 'Unavailable',
  ], [
    'multi_year_projection', teamName || 'Team unavailable', row.season, 'surcharge_band', row.surchargeBand || 'Unavailable', taxProjection?.source || 'Unavailable',
  ], [
    'multi_year_projection', teamName || 'Team unavailable', row.season, 'estimated_tax', money(row.estimatedTax), taxProjection?.source || 'Unavailable',
  ]));
  return rows;
}

export function buildTeamFinancialCsv({ teamName, teamFinancials, taxProjection } = {}) {
  return buildTeamFinancialCsvRows({ teamName, teamFinancials, taxProjection }).map(row => row.map(csvCell).join(',')).join('\n') + '\n';
}

export function downloadTeamFinancialCsv({ teamName, teamFinancials, taxProjection } = {}) {
  const csv = buildTeamFinancialCsv({ teamName, teamFinancials, taxProjection });
  const blob = new Blob([csv], { type:'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const safeName = String(teamName || 'team').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'team';
  anchor.href = url;
  anchor.download = `skip-${safeName}-financials-${teamFinancials?.season || taxProjection?.rows?.[0]?.season || 'current'}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
