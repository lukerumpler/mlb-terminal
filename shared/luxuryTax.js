export const CBT_THRESHOLDS = Object.freeze({
  2024: 237_000_000,
  2025: 241_000_000,
  2026: 244_000_000,
});

export const CBT_SOURCE_URL = 'https://www.mlb.com/glossary/transactions/competitive-balance-tax';

function numeric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function getCbtThreshold(season) {
  return CBT_THRESHOLDS[Number(season)] ?? null;
}

export function getRepeaterTier(consecutiveYears) {
  const years = numeric(consecutiveYears);
  if (years == null || years < 1) return { key: 'unknown', label: 'History unavailable', baseRate: null };
  if (years === 1) return { key: 'first-year', label: 'First-year CBT payer', baseRate: 0.20 };
  if (years === 2) return { key: 'second-year', label: 'Second consecutive year', baseRate: 0.30 };
  return { key: 'third-plus-year', label: 'Third consecutive year or more', baseRate: 0.50 };
}

export function getSurchargeBand(overage) {
  const amount = numeric(overage);
  if (amount == null || amount < 0) return { key: 'unknown', label: 'Unavailable', rate: null };
  if (amount < 20_000_000) return { key: 'base', label: 'Base threshold to +$20M', rate: 0 };
  if (amount < 40_000_000) return { key: 'twenty-to-forty', label: '+$20M to +$40M surcharge', rate: 0.12 };
  if (amount < 60_000_000) return { key: 'forty-to-sixty', label: '+$40M to +$60M surcharge', rate: null };
  return { key: 'sixty-plus', label: '+$60M or more surcharge', rate: 0.60 };
}

export function calculateCbtTax(overage, consecutiveYears) {
  const amount = numeric(overage);
  const years = numeric(consecutiveYears);
  if (amount == null || years == null || amount <= 0 || years < 1) return null;

  const tier = getRepeaterTier(years);
  let remaining = amount;
  let tax = 0;
  const bands = [
    { width: 20_000_000, rate: tier.baseRate },
    { width: 20_000_000, rate: tier.baseRate + 0.12 },
    { width: 20_000_000, rate: tier.baseRate + (years === 1 ? 0.425 : 0.45) },
    { width: Infinity, rate: tier.baseRate + 0.60 },
  ];
  for (const band of bands) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, band.width);
    tax += taxable * band.rate;
    remaining -= taxable;
  }
  return Math.round(tax);
}

export function inferConsecutiveTaxYears(history, currentSeason) {
  if (!Array.isArray(history) || !history.length) return null;
  const current = Number(currentSeason);
  if (!Number.isInteger(current)) return null;
  const bySeason = new Map(history.map(row => [Number(row.season), row]));
  let consecutive = 0;
  for (let season = current; season >= current - 10; season -= 1) {
    const row = bySeason.get(season);
    const payroll = numeric(row?.taxPayroll);
    const threshold = numeric(row?.taxThreshold) ?? getCbtThreshold(season);
    if (payroll == null || threshold == null || payroll <= threshold) break;
    consecutive += 1;
  }
  return consecutive || 0;
}

export function buildMultiYearTaxProjection({
  baseAav,
  currentPlayerAav = 0,
  currentTaxPayroll,
  currentSeason = 2026,
  years = 5,
  salaryGrowth = 0.03,
  payrollGrowth = 0.03,
  repeaterYears = null,
} = {}) {
  const aav = numeric(baseAav);
  const playerAav = numeric(currentPlayerAav) ?? 0;
  const payroll = numeric(currentTaxPayroll);
  const count = Math.max(1, Math.min(10, Number(years) || 5));
  const rows = [];
  for (let i = 0; i < count; i += 1) {
    const season = Number(currentSeason) + i;
    const threshold = getCbtThreshold(season);
    const projectedAav = aav == null ? null : Math.round(aav * ((1 + salaryGrowth) ** i));
    const projectedPayroll = payroll == null ? null : Math.round(payroll * ((1 + payrollGrowth) ** i) + (projectedAav ?? 0) - playerAav);
    const overage = projectedPayroll != null && threshold != null ? Math.max(0, projectedPayroll - threshold) : null;
    const seasonRepeaterYears = repeaterYears == null ? null : Number(repeaterYears) + i;
    const tier = getRepeaterTier(seasonRepeaterYears);
    rows.push({
      season,
      projectedAav,
      projectedTaxPayroll: projectedPayroll,
      threshold,
      overage,
      repeaterYears: seasonRepeaterYears,
      repeaterTier: tier.label,
      surchargeBand: getSurchargeBand(overage).label,
      estimatedTax: calculateCbtTax(overage, seasonRepeaterYears),
    });
  }
  return {
    source: CBT_SOURCE_URL,
    assumptions: { salaryGrowth, payrollGrowth, currentPlayerAav: playerAav, years: count },
    status: aav != null && payroll != null ? 'available' : 'unavailable',
    rows,
  };
}
