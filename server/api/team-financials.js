/**
 * Team payroll and Competitive Balance Tax context.
 *
 * Spotrac publishes team-level 2026 payroll and tax tables, but does not expose
 * a stable public JSON API for them. This proxy keeps the browser same-origin,
 * parses only the requested club, labels the source, and returns explicit nulls
 * when the upstream page is unavailable or its markup changes.
 */
import { applyCors, isRateLimited, rateLimitResponse } from './_shared.js';
import { getRepeaterTier, CBT_SOURCE_URL } from '../../shared/luxuryTax.js';

const DEFAULT_SEASON = 2026;
const TEAM_CODE = /^[A-Z]{2,3}$/;
const SPOTRAC_PAYROLL_URL = season => `https://www.spotrac.com/mlb/payroll/_/year/${season}`;
const SPOTRAC_TAX_URL = 'https://www.spotrac.com/mlb/tax';
const PAYROLL_SOURCE_URL = 'https://www.spotrac.com/mlb/payroll/_/year/2026';
const TAX_SOURCE_URL = 'https://www.spotrac.com/mlb/tax';
const UA = 'Mozilla/5.0 (compatible; SKIPBaseball/1.0; +https://skipbaseball.com)';

function stripTags(html) {
  return (html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseMoney(value) {
  if (value == null || value === '' || value === '-') return null;
  const raw = String(value).replace(/[,$\s]/g, '').replace(/[()]/g, '');
  const sign = String(value).includes('-') ? -1 : 1;
  const multiplier = /m$/i.test(raw) ? 1_000_000 : /k$/i.test(raw) ? 1_000 : 1;
  const number = Number(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(number) ? sign * Math.round(number * multiplier) : null;
}

function headerText(tableHtml) {
  const thead = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i)?.[1] || '';
  const source = thead || tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1] || '';
  return [...source.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)]
    .map(match => stripTags(match[1]).toLowerCase());
}

function tableRows(tableHtml) {
  const tbody = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || tableHtml;
  return [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(match => [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => stripTags(cell[1])))
    .filter(row => row.length > 1);
}

function findTable(html, predicate) {
  return [...String(html || '').matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)]
    .map(match => match[0])
    .find(table => predicate(headerText(table)));
}

function teamCodeFromCell(cell, requested) {
  const upper = String(cell || '').toUpperCase();
  if (upper.includes(` ${requested} `) || upper.startsWith(`${requested} `) || upper.endsWith(` ${requested}`) || upper === requested) return requested;
  return null;
}

function indexOfHeader(headers, predicate) {
  return headers.findIndex(predicate);
}

export function parseTeamPayrollHtml(html, teamAbbr, season = DEFAULT_SEASON) {
  const table = findTable(html, headers => headers.some(header => header.includes('total payroll')));
  if (!table) return null;
  const headers = headerText(table);
  const teamIndex = indexOfHeader(headers, header => header === 'team' || header.includes('team'));
  const payrollIndex = indexOfHeader(headers, header => header.includes('total payroll'));
  // Spotrac renders “Allocations” as the second line of the Total Payroll
  // header, not as a separate data column. The row therefore proceeds directly
  // from Total Payroll to Active, Injured, Retained, and Buried.
  const combinedPayrollHeader = payrollIndex >= 0 && headers[payrollIndex].includes('allocation');
  const allocationIndex = combinedPayrollHeader ? -1 : indexOfHeader(headers, header => header.includes('allocation'));
  const activeIndex = combinedPayrollHeader ? payrollIndex + 1 : indexOfHeader(headers, header => header === 'active 26-man' || header.includes('26-man'));
  const injuredIndex = combinedPayrollHeader ? payrollIndex + 2 : indexOfHeader(headers, header => header.includes('injured'));
  const retainedIndex = combinedPayrollHeader ? payrollIndex + 3 : indexOfHeader(headers, header => header.includes('retained'));
  const buriedIndex = combinedPayrollHeader ? payrollIndex + 4 : indexOfHeader(headers, header => header.includes('buried'));
  const row = tableRows(table).find(cells => teamCodeFromCell(cells[teamIndex], teamAbbr));
  if (!row || payrollIndex < 0) return null;
  return {
    teamAbbr,
    season,
    payroll: parseMoney(row[payrollIndex]),
    allocations: parseMoney(row[allocationIndex]),
    active: parseMoney(row[activeIndex]),
    injured: parseMoney(row[injuredIndex]),
    retained: parseMoney(row[retainedIndex]),
    buried: parseMoney(row[buriedIndex]),
    source: 'Spotrac MLB Team Salary Payroll Tracker',
    sourceUrl: SPOTRAC_PAYROLL_URL(season),
  };
}

export function parseTeamTaxHtml(html, teamAbbr, season = DEFAULT_SEASON) {
  const table = findTable(html, headers => headers.some(header => header.includes('tax payroll')) && headers.some(header => header.includes('tax bill')));
  if (!table) return null;
  const headers = headerText(table);
  const teamIndex = indexOfHeader(headers, header => header === 'team' || header.includes('team'));
  const taxPayrollIndex = indexOfHeader(headers, header => header.includes('tax payroll'));
  const spaceIndex = indexOfHeader(headers, header => header === 'space' || header.includes('space'));
  const taxBillIndex = indexOfHeader(headers, header => header.includes('tax bill'));
  const totalIndex = indexOfHeader(headers, header => header.includes('total tax payroll'));
  const row = tableRows(table).find(cells => teamCodeFromCell(cells[teamIndex], teamAbbr));
  if (!row || taxPayrollIndex < 0) return null;

  const thresholdTable = findTable(html, headers => headers.some(header => header.includes('level tax tier')));
  const thresholdRow = thresholdTable ? tableRows(thresholdTable)[0] : null;
  const thresholdHeaders = thresholdTable ? headerText(thresholdTable) : [];
  const thresholdIndex = thresholdHeaders.findIndex(header => header.includes('level tax tier'));
  return {
    teamAbbr,
    season,
    taxPayroll: parseMoney(row[taxPayrollIndex]),
    taxSpace: parseMoney(row[spaceIndex]),
    estimatedTaxBill: parseMoney(row[taxBillIndex]),
    totalTaxPayroll: parseMoney(row[totalIndex]),
    taxThreshold: thresholdRow && thresholdIndex >= 0 ? parseMoney(thresholdRow[thresholdIndex]) : null,
    // Spotrac’s public 2026 table reports current payroll/tax estimates but not
    // a verified consecutive-year history. Keep the tier explicitly unknown;
    // downstream projections must not silently assume a first-year rate.
    repeaterYears: null,
    repeaterTier: getRepeaterTier(null).label,
    source: 'Spotrac MLB Team Tax Tracker',
    sourceUrl: TAX_SOURCE_URL,
    repeaterSourceUrl: CBT_SOURCE_URL,
  };
}

async function fetchHtml(url, timeoutMs = 12_000) {
  const response = await fetch(url, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.text();
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error:'Method not allowed' });
  if (isRateLimited(req)) return rateLimitResponse(res);

  const url = new URL(req.url, 'https://placeholder.invalid');
  const team = String(url.searchParams.get('team') || '').trim().toUpperCase();
  const parsedSeason = Number(url.searchParams.get('season') || DEFAULT_SEASON);
  const season = Number.isInteger(parsedSeason) && parsedSeason >= 2024 && parsedSeason <= 2030 ? parsedSeason : DEFAULT_SEASON;
  if (!TEAM_CODE.test(team)) return res.status(400).json({ error:'Missing or invalid team abbreviation' });

  const [payrollResult, taxResult] = await Promise.allSettled([
    fetchHtml(SPOTRAC_PAYROLL_URL(season)).then(html => parseTeamPayrollHtml(html, team, season)),
    fetchHtml(SPOTRAC_TAX_URL).then(html => parseTeamTaxHtml(html, team, season)),
  ]);
  const payroll = payrollResult.status === 'fulfilled' ? payrollResult.value : null;
  const tax = taxResult.status === 'fulfilled' ? taxResult.value : null;
  if (!payroll && !tax) {
    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1800');
    return res.status(200).json({ found:false, teamAbbr:team, season });
  }
  res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=3600');
  return res.status(200).json({ found:true, teamAbbr:team, season, payroll, tax, source:'Spotrac', sourceUrls:{ payroll:PAYROLL_SOURCE_URL, tax:TAX_SOURCE_URL } });
}
