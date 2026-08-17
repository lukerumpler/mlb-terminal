/**
 * Team payroll and Competitive Balance Tax context.
 *
 * Spotrac publishes team-level 2026 payroll and tax tables, but does not expose
 * a stable public JSON API for them. This proxy keeps the browser same-origin,
 * parses only the requested club, labels the source, and returns explicit nulls
 * when the upstream page is unavailable or its markup changes.
 */
import { createHash } from "node:crypto";
import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";
import { readDurableCache, writeDurableCache } from "../durable-cache";
import { recordCacheOutcome } from "../cache-health";
import { getRepeaterTier, CBT_SOURCE_URL } from "../../shared/luxuryTax.js";

const DEFAULT_SEASON = 2026;
const TEAM_CODE = /^[A-Z]{2,3}$/;
const SPOTRAC_PAYROLL_URL = season =>
  `https://www.spotrac.com/mlb/payroll/_/year/${season}`;
const SPOTRAC_TAX_URL = season =>
  `https://www.spotrac.com/mlb/tax/_/year/${season}`;
const UA =
  "Mozilla/5.0 (compatible; SKIPBaseball/1.0; +https://skipbaseball.com)";
const FRESH_TTL_MS = 30 * 60_000;
const STALE_TTL_MS = 6 * 60 * 60_000;
const financialCache = new Map();
const financialInFlight = new Map();

export function __resetTeamFinancialsStateForTests() {
  financialCache.clear();
  financialInFlight.clear();
}

function financialCacheKey(team, season) {
  return `${team}:${season}`;
}

function durableFinancialCacheKey(team, season) {
  return `team-financials:${createHash("sha256").update(`${team}:${season}`).digest("hex")}`;
}

function setFinancialHeaders(res, freshness) {
  res.setHeader(
    "Cache-Control",
    freshness === "stale-cached"
      ? "public, s-maxage=60, stale-while-revalidate=300"
      : "public, s-maxage=1800, stale-while-revalidate=3600"
  );
  res.setHeader("X-Provider-Cache", freshness === "live" ? "MISS" : "STALE");
  res.setHeader("X-Provider-Freshness", freshness);
}

function stripTags(html) {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function parseMoney(value) {
  if (value == null || value === "" || value === "-") return null;
  const raw = String(value)
    .replace(/[,$\s]/g, "")
    .replace(/[()]/g, "");
  const sign = String(value).includes("-") ? -1 : 1;
  const multiplier = /m$/i.test(raw) ? 1_000_000 : /k$/i.test(raw) ? 1_000 : 1;
  const number = Number(raw.replace(/[^0-9.]/g, ""));
  return Number.isFinite(number)
    ? sign * Math.round(number * multiplier)
    : null;
}

function headerText(tableHtml) {
  const thead = tableHtml.match(/<thead[^>]*>([\s\S]*?)<\/thead>/i)?.[1] || "";
  const source =
    thead || tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i)?.[1] || "";
  return [...source.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(match =>
    stripTags(match[1]).toLowerCase()
  );
}

function tableRows(tableHtml) {
  const tbody =
    tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)?.[1] || tableHtml;
  return [...tbody.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map(match =>
      [...match[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell =>
        stripTags(cell[1])
      )
    )
    .filter(row => row.length > 1);
}

function findTable(html, predicate) {
  return [...String(html || "").matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)]
    .map(match => match[0])
    .find(table => predicate(headerText(table)));
}

function teamCodeFromCell(cell, requested) {
  const upper = String(cell || "").toUpperCase();
  if (
    upper.includes(` ${requested} `) ||
    upper.startsWith(`${requested} `) ||
    upper.endsWith(` ${requested}`) ||
    upper === requested
  )
    return requested;
  return null;
}

function indexOfHeader(headers, predicate) {
  return headers.findIndex(predicate);
}

export function parseTeamPayrollHtml(html, teamAbbr, season = DEFAULT_SEASON) {
  const table = findTable(html, headers =>
    headers.some(header => header.includes("total payroll"))
  );
  if (!table) return null;
  const headers = headerText(table);
  const teamIndex = indexOfHeader(
    headers,
    header => header === "team" || header.includes("team")
  );
  const payrollIndex = indexOfHeader(headers, header =>
    header.includes("total payroll")
  );
  // Spotrac renders “Allocations” as the second line of the Total Payroll
  // header, not as a separate data column. The row therefore proceeds directly
  // from Total Payroll to Active, Injured, Retained, and Buried.
  const combinedPayrollHeader =
    payrollIndex >= 0 && headers[payrollIndex].includes("allocation");
  const allocationIndex = combinedPayrollHeader
    ? -1
    : indexOfHeader(headers, header => header.includes("allocation"));
  const activeIndex = combinedPayrollHeader
    ? payrollIndex + 1
    : indexOfHeader(
        headers,
        header => header === "active 26-man" || header.includes("26-man")
      );
  const injuredIndex = combinedPayrollHeader
    ? payrollIndex + 2
    : indexOfHeader(headers, header => header.includes("injured"));
  const retainedIndex = combinedPayrollHeader
    ? payrollIndex + 3
    : indexOfHeader(headers, header => header.includes("retained"));
  const buriedIndex = combinedPayrollHeader
    ? payrollIndex + 4
    : indexOfHeader(headers, header => header.includes("buried"));
  const row = tableRows(table).find(cells =>
    teamCodeFromCell(cells[teamIndex], teamAbbr)
  );
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
    source: "Spotrac MLB Team Salary Payroll Tracker",
    sourceUrl: SPOTRAC_PAYROLL_URL(season),
  };
}

export function parseTeamTaxHtml(html, teamAbbr, season = DEFAULT_SEASON) {
  const table = findTable(
    html,
    headers =>
      headers.some(header => header.includes("tax payroll")) &&
      headers.some(header => header.includes("tax bill"))
  );
  if (!table) return null;
  const headers = headerText(table);
  const teamIndex = indexOfHeader(
    headers,
    header => header === "team" || header.includes("team")
  );
  const taxPayrollIndex = indexOfHeader(headers, header =>
    header.includes("tax payroll")
  );
  const spaceIndex = indexOfHeader(
    headers,
    header => header === "space" || header.includes("space")
  );
  const taxBillIndex = indexOfHeader(headers, header =>
    header.includes("tax bill")
  );
  const totalIndex = indexOfHeader(headers, header =>
    header.includes("total tax payroll")
  );
  const row = tableRows(table).find(cells =>
    teamCodeFromCell(cells[teamIndex], teamAbbr)
  );
  if (!row || taxPayrollIndex < 0) return null;

  const thresholdTable = findTable(html, headers =>
    headers.some(header => header.includes("level tax tier"))
  );
  const thresholdRow = thresholdTable ? tableRows(thresholdTable)[0] : null;
  const thresholdHeaders = thresholdTable ? headerText(thresholdTable) : [];
  const thresholdIndex = thresholdHeaders.findIndex(header =>
    header.includes("level tax tier")
  );
  return {
    teamAbbr,
    season,
    taxPayroll: parseMoney(row[taxPayrollIndex]),
    taxSpace: parseMoney(row[spaceIndex]),
    estimatedTaxBill: parseMoney(row[taxBillIndex]),
    totalTaxPayroll: parseMoney(row[totalIndex]),
    taxThreshold:
      thresholdRow && thresholdIndex >= 0
        ? parseMoney(thresholdRow[thresholdIndex])
        : null,
    // Spotrac’s public 2026 table reports current payroll/tax estimates but not
    // a verified consecutive-year history. Keep the tier explicitly unknown;
    // downstream projections must not silently assume a first-year rate.
    repeaterYears: null,
    repeaterTier: getRepeaterTier(null).label,
    source: "Spotrac MLB Team Tax Tracker",
    sourceUrl: SPOTRAC_TAX_URL(season),
    repeaterSourceUrl: CBT_SOURCE_URL,
  };
}

async function fetchHtml(url, timeoutMs = 12_000) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,*/*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.text();
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  const url = new URL(req.url, "https://placeholder.invalid");
  const team = String(url.searchParams.get("team") || "")
    .trim()
    .toUpperCase();
  const parsedSeason = Number(url.searchParams.get("season") || DEFAULT_SEASON);
  const season =
    Number.isInteger(parsedSeason) &&
    parsedSeason >= 2024 &&
    parsedSeason <= 2030
      ? parsedSeason
      : DEFAULT_SEASON;
  if (!TEAM_CODE.test(team))
    return res
      .status(400)
      .json({ error: "Missing or invalid team abbreviation" });

  const key = financialCacheKey(team, season);
  const now = Date.now();
  let cached = financialCache.get(key);
  if (cached?.freshUntil > now) {
    setFinancialHeaders(res, cached.freshness);
    return res.status(200).json(cached.payload);
  }

  if (!process.env.VITEST && process.env.DATABASE_URL) {
    const durable = await readDurableCache(durableFinancialCacheKey(team, season));
    if (durable) {
      cached = {
        payload: durable.data,
        freshness: durable.data?.freshness || "live",
        freshUntil: new Date(durable.freshUntil).getTime(),
        staleUntil: new Date(durable.staleUntil).getTime(),
      };
      financialCache.set(key, cached);
      if (cached.freshUntil > now) {
        recordCacheOutcome("team-financials", "durable-hit");
        res.setHeader("Cache-Control", "public, s-maxage=1800, stale-while-revalidate=3600");
        res.setHeader("X-Provider-Cache", "DURABLE-HIT");
        res.setHeader("X-Provider-Freshness", "cached");
        return res.status(200).json(cached.payload);
      }
    }
  }

  const existing = financialInFlight.get(key);
  if (existing) {
    const payload = await existing;
    setFinancialHeaders(res, payload.freshness || "live");
    return res.status(200).json(payload);
  }

  if (isRateLimited(req, "team-financials")) return rateLimitResponse(res);

  const request = (async () => {
    const [payrollResult, taxResult] = await Promise.allSettled([
      fetchHtml(SPOTRAC_PAYROLL_URL(season)).then(html =>
        parseTeamPayrollHtml(html, team, season)
      ),
      fetchHtml(SPOTRAC_TAX_URL(season)).then(html =>
        parseTeamTaxHtml(html, team, season)
      ),
    ]);
    const payroll =
      payrollResult.status === "fulfilled" ? payrollResult.value : null;
    const tax = taxResult.status === "fulfilled" ? taxResult.value : null;
    const stale = cached?.staleUntil > Date.now() ? cached : null;
    if (!payroll && !tax && stale) {
      recordCacheOutcome("team-financials", "stale-hit");
      return {
        ...stale.payload,
        freshness: "stale-cached",
        staleReason: "Spotrac upstream unavailable",
      };
    }
    const payload = payroll || tax
      ? {
          found: true,
          teamAbbr: team,
          season,
          payroll,
          tax,
          source: "Spotrac",
          sourceUrls: {
            payroll: SPOTRAC_PAYROLL_URL(season),
            tax: SPOTRAC_TAX_URL(season),
          },
          freshness: "live",
        }
      : { found: false, teamAbbr: team, season, freshness: "live" };
    const freshUntil = Date.now() + FRESH_TTL_MS;
    const staleUntil = freshUntil + STALE_TTL_MS;
    financialCache.set(key, {
      payload,
      freshness: payload.freshness,
      freshUntil,
      staleUntil,
    });
    recordCacheOutcome("team-financials", "upstream-miss");
    if (!process.env.VITEST && process.env.DATABASE_URL) {
      void writeDurableCache({
        cacheKey: durableFinancialCacheKey(team, season),
        source: "Spotrac",
        data: payload,
        freshUntil: new Date(freshUntil),
        staleUntil: new Date(staleUntil),
      });
    }
    return payload;
  })();
  financialInFlight.set(key, request);
  request.finally(() => financialInFlight.delete(key)).catch(() => {});
  const payload = await request;
  setFinancialHeaders(res, payload.freshness || "live");
  return res.status(200).json(payload);
}
