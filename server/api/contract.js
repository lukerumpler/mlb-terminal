/**
 * api/contract.js — Vercel Serverless: MLB Contract Data
 *
 * GET /api/contract?name=Shohei+Ohtani
 *
 * Ports the logic from github.com/Robbiedudz34/mlb-contract-data
 * (contract_value_assessment.py) to Node.js serverless:
 *
 *   1. Primary:  Spotrac /mlb/contracts/ — <table id="table"> (server-rendered HTML)
 *   2. Fallback: Baseball-Reference #largest_contracts table
 *   3. Final:    MLB Stats API service-time fields (always fetched, merged in)
 *
 * The Python script confirms Spotrac returns real HTML tables (not a React SPA)
 * when a browser User-Agent is supplied — replicating that here.
 *
 * Returns:
 *   { found:true, player, team, years, total, aav, salary, expiry, status,
 *     serviceTime, serviceStatus, debutDate, source }
 *   { found:false }
 *
 * LAUNCH-READINESS NOTE: sources 1 and 2 are HTML scrapes of Spotrac and
 * Baseball-Reference (with a spoofed browser User-Agent below), not official
 * APIs. That means: (a) this will silently start returning `found:false` or
 * partial data the moment either site changes its markup, with no advance
 * warning, and (b) scraping with a spoofed UA is worth checking against both
 * sites' current terms of service before leaning on this in a public
 * product — that's a legal/business call, not something to decide in code.
 * Source 3 (MLB Stats API) is the only official, stable source here.
 */
import { createHash } from "node:crypto";
import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";
import { readDurableCache, writeDurableCache } from "../durable-cache";
import { recordCacheOutcome } from "../cache-health";
import { hasAttemptedProviderToday, utcDayKey } from "./daily-provider-policy.js";

const SPOTRAC_CONTRACTS_URL = "https://www.spotrac.com/mlb/contracts/";
const BREF_CONTRACTS_URL =
  "https://www.baseball-reference.com/leaders/leaders_contract.shtml";
const MLB_BASE = "https://statsapi.mlb.com/api/v1";

const brefDailyAttemptDay = new Map();
const brefDailyCache = new Map();
const brefDailyInFlight = new Map();
const contractInFlight = new Map();
const CONTRACT_FRESH_TTL_MS = 6 * 60 * 60_000;
const CONTRACT_STALE_TTL_MS = 24 * 60 * 60_000;

// Mirror the User-Agent approach from the Python script (env var or hardcoded fallback)
const UA =
  process.env.USER_AGENT ||
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

// ─── Utilities ────────────────────────────────────────────────────────────────

export function normalizeName(s) {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2018\u2019`.,-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a, b) {
  const m = a.length,
    n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export function isAcceptableMatch(target, candidate, dist) {
  if (!target || !candidate) return false;
  const maxLen = Math.max(target.length, candidate.length);
  const cap = Math.min(3, Math.max(1, Math.floor(maxLen * 0.12)));
  return dist <= cap;
}

function parseDollar(s) {
  if (!s) return null;
  const clean = s.replace(/[$,\s]/g, "");
  if (/[Mm]$/.test(clean)) return Math.round(parseFloat(clean) * 1_000_000);
  if (/[Kk]$/.test(clean)) return Math.round(parseFloat(clean) * 1_000);
  const n = parseFloat(clean);
  return isNaN(n) ? null : n;
}

function fmtExpiry(raw) {
  if (!raw) return null;
  const m = String(raw).match(/\d{4}/);
  return m ? m[0] : null;
}

function parseServiceTime(raw) {
  if (!raw) return null;
  const [y = "0", d = "0"] = String(raw).split(".");
  const days = parseInt(y, 10) * 172 + parseInt(d, 10);
  const yrs = days / 172;
  if (yrs >= 6) return "Free Agent Eligible";
  if (yrs >= 3) return "Arbitration Eligible";
  return "Pre-Arbitration";
}

function deriveStatus(expiry, svcStatus) {
  if (!expiry) return svcStatus || "Unknown";
  const yr = parseInt(expiry, 10);
  const cur = new Date().getFullYear();
  if (isNaN(yr)) return svcStatus || "Unknown";
  if (yr < cur) return "Expired";
  return "Under Contract";
}

// A resolved MLB person is not the same thing as a verified contract record.
// Spotrac/Baseball-Reference may fail or return only a player match, while the
// official MLB person response can still provide debut/service metadata. Keep
// those states separate so the UI never turns identity data into a salary claim.
export function hasVerifiedContractData(scraped, mlbData) {
  const scrapedFields = scraped && [
    scraped.salary,
    scraped.aav,
    scraped.total,
    scraped.years,
    scraped.expiry,
  ];
  const mlbFields = mlbData && [
    mlbData.mlbSalary,
    mlbData.mlbAav,
    mlbData.mlbYears,
    mlbData.mlbExpiry,
  ];
  return Boolean(
    (scrapedFields && scrapedFields.some(value => value != null)) ||
      (mlbFields && mlbFields.some(value => value != null))
  );
}

// Lightweight HTML tag stripper — mirrors BeautifulSoup .get_text()
function stripTags(html) {
  return (html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchHtml(url, timeoutMs = 10_000) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml,*/*",
      "Accept-Language": "en-US,en;q=0.9",
      Referer: new URL(url).origin + "/",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.text();
}

async function fetchBRefOnceDaily(playerName) {
  const key = normalizeName(playerName);
  const now = Date.now();
  const day = utcDayKey(now);
  const cached = brefDailyCache.get(key);
  if (cached?.day === day) return cached.data;

  const existing = brefDailyInFlight.get(key);
  if (existing) return existing;
  if (hasAttemptedProviderToday(brefDailyAttemptDay.get(key), now)) return null;

  brefDailyAttemptDay.set(key, day);
  const request = (async () => {
    let data = null;
    try {
      const brefHtml = await fetchHtml(BREF_CONTRACTS_URL, 12_000);
      data = parseBRefTable(brefHtml, playerName);
    } catch {
      // Preserve the once-daily failure result; do not reopen a blocked provider.
    }
    brefDailyCache.set(key, { day, data });
    return data;
  })();
  brefDailyInFlight.set(key, request);
  try {
    return await request;
  } finally {
    brefDailyInFlight.delete(key);
  }
}

export function __resetBRefContractStateForTests() {
  brefDailyAttemptDay.clear();
  brefDailyCache.clear();
  brefDailyInFlight.clear();
}

// ─── Source 1: Spotrac /mlb/contracts/ ────────────────────────────────────────
// The Python script finds soup.find("table", {"id": "table"}) and calls
// extract_table_format() which reads thead > th for headers and tbody > tr for rows.
// Column layout (confirmed from script + Spotrac page structure):
//   Rank | Player | Team | Pos | Years | Total | AAV | Expires
// The <th> in each row holds the rank; <td>s hold the rest.

export function parseSpotracTable(html, playerName) {
  const normTarget = normalizeName(playerName);

  // Extract the #table section
  const tableMatch = html.match(
    /<table[^>]*id=["']table["'][^>]*>([\s\S]*?)<\/table>/i
  );
  if (!tableMatch) return null;
  const tableHtml = tableMatch[1];

  // Extract tbody rows — mirrors: for tr in table.find("tbody").find_all("tr")
  const tbodyMatch = tableHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return null;

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let best = null,
    bestDist = Infinity;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(tbodyMatch[1])) !== null) {
    const rowHtml = rowMatch[1];

    // Python: first_col = tr.find("th") then cols = [td.text for td in tr.find_all("td")]
    // then cols.insert(0, first_col.text) if first_col
    const thMatch = rowHtml.match(/<th[^>]*>([\s\S]*?)<\/th>/i);
    const tds = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m =>
      stripTags(m[1])
    );
    if (thMatch) tds.unshift(stripTags(thMatch[1])); // rank goes first
    if (tds.length < 4) continue;

    // Player name is in column index 1 (after rank at index 0)
    // Python: if len(cols) == len(headers_list): rows.append(cols)
    const candidate = normalizeName(tds[1] || "");
    if (!candidate || candidate.length < 2) continue;

    const dist = levenshtein(normTarget, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = tds;
      bestCandidate = candidate;
    }
  }

  if (!best || !isAcceptableMatch(normTarget, bestCandidate, bestDist)) return null;

  // Map columns: Rank(0) Player(1) Team(2) Pos(3) Years(4) Total(5) AAV(6) Expires(7)
  const expiry = fmtExpiry(best[7]);
  return {
    found: true,
    source: "Spotrac",
    player: best[1] || playerName,
    team: best[2] || null,
    years: parseInt(best[4], 10) || null,
    total: parseDollar(best[5]),
    aav: parseDollar(best[6]),
    salary: null, // current-year salary not on this page; AAV used as proxy
    expiry,
  };
}

// ─── Source 2: Baseball-Reference #largest_contracts ─────────────────────────
// Python: soup.find("table", {"id": "largest_contracts"})
// extract_baseball_reference_format() + extract_player_urls()
// Uses data-stat attributes to locate each field robustly — no positional assumptions.

export function parseBRefTable(html, playerName) {
  const normTarget = normalizeName(playerName);

  const tableMatch = html.match(
    /<table[^>]*id=["']largest_contracts["'][^>]*>([\s\S]*?)<\/table>/i
  );
  if (!tableMatch) return null;

  const tbodyMatch = tableMatch[1].match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!tbodyMatch) return null;

  // Helper: pull a single data-stat field from a row's HTML
  const getStat = (rowHtml, stat) => {
    const m = rowHtml.match(
      new RegExp(
        `<td[^>]*data-stat=["']${stat}["'][^>]*>([\\s\\S]*?)<\\/td>`,
        "i"
      )
    );
    return m ? stripTags(m[1]) : "";
  };

  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let best = null,
    bestDist = Infinity;

  let rowMatch;
  while ((rowMatch = rowRegex.exec(tbodyMatch[1])) !== null) {
    const rowHtml = rowMatch[1];

    // Python: player_td = tr.find("td", {"data-stat": "player"})
    const playerCell = getStat(rowHtml, "player");
    if (!playerCell || playerCell.length < 2) continue;

    const dist = levenshtein(normTarget, normalizeName(playerCell));
    if (dist < bestDist) {
      bestDist = dist;
      best = { rowHtml, name: playerCell, normalizedName: normalizeName(playerCell) };
    }
  }

  if (!best || !isAcceptableMatch(normTarget, best.normalizedName, bestDist)) return null;

  const { rowHtml, name } = best;

  // Extract each field by data-stat — immune to column reordering
  const salary = parseDollar(
    getStat(rowHtml, "salary") || getStat(rowHtml, "annual_salary")
  );
  const total = parseDollar(
    getStat(rowHtml, "total_salary") ||
      getStat(rowHtml, "contract_length_salary")
  );
  const aav = parseDollar(
    getStat(rowHtml, "avg_annual_value") ||
      getStat(rowHtml, "aav") ||
      getStat(rowHtml, "salary_per_year")
  );
  const yearsRaw =
    getStat(rowHtml, "years") || getStat(rowHtml, "contract_length");
  const years = parseInt(yearsRaw, 10) || null;
  const expiryRaw =
    getStat(rowHtml, "year_end") || getStat(rowHtml, "end_year");
  const expiry = fmtExpiry(expiryRaw);
  const team =
    getStat(rowHtml, "team_ID") || getStat(rowHtml, "team_name") || null;

  // At minimum we need player name to declare found
  if (!name) return null;

  return {
    found: true,
    source: "Baseball-Reference",
    player: name,
    team,
    years,
    total: total || null,
    aav: aav || salary || null,
    salary: salary || null,
    expiry,
  };
}

// ─── Source 3: MLB Stats API — service time + basic contract hydration ────────
async function fetchMLBData(mlbId) {
  try {
    const res = await fetch(
      `${MLB_BASE}/people/${mlbId}?hydrate=currentTeam,contracts`,
      {
        headers: {
          "User-Agent": "SKIPBaseball/1.0",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(6_000),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const person = data.people?.[0];
    if (!person) return null;

    const contracts = Array.isArray(person.contracts) ? person.contracts : [];
    const active = contracts.find(c => c.active) || contracts[0] || null;

    return {
      serviceTime: person.serviceTime || null,
      serviceStatus: parseServiceTime(person.serviceTime),
      debutDate: person.mlbDebutDate || null,
      mlbSalary: active?.salary || null,
      mlbAav: active?.annualAvgValue || null,
      mlbYears: active?.years || null,
      mlbExpiry: fmtExpiry(active?.endDate),
    };
  } catch {
    return null;
  }
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  if (isRateLimited(req, "contract")) return rateLimitResponse(res);

  const urlObj = new URL(req.url, "https://placeholder.invalid");
  const name = (urlObj.searchParams.get("name") || "").trim();
  const mlbId = (urlObj.searchParams.get("id") || "").trim();

  if (!name || name.length < 2) {
    return res.status(400).json({ error: "Missing required param: name" });
  }

  const cacheKey = `${name.toLowerCase()}::${mlbId}`;
  const durableKey = `contract:${createHash("sha256").update(cacheKey).digest("hex")}`;
  const now = Date.now();
  let durableStale = null;
  if (!process.env.VITEST && process.env.DATABASE_URL) {
    const durable = await readDurableCache(durableKey);
    if (durable && new Date(durable.freshUntil).getTime() > now) {
      recordCacheOutcome("contract", "durable-hit");
      res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=3600");
      res.setHeader("X-Provider-Cache", "DURABLE-HIT");
      res.setHeader("X-Provider-Freshness", "cached");
      return res.status(200).json(durable.data);
    }
    if (durable && new Date(durable.staleUntil).getTime() > now && durable.data?.found) {
      durableStale = durable.data;
    }
  }

  const existing = contractInFlight.get(cacheKey);
  if (existing) {
    const result = await existing;
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=3600");
    res.setHeader("X-Provider-Cache", "COALESCED");
    res.setHeader("X-Provider-Freshness", "live");
    return res.status(200).json(result);
  }

  const request = (async () => {
    // MLB Stats API always runs in parallel; Spotrac remains the primary
    // contract source and Baseball-Reference remains the once-daily fallback.
    const [spotracResult, mlbData] = await Promise.all([
      (async () => {
        try {
          const html = await fetchHtml(SPOTRAC_CONTRACTS_URL);
          return parseSpotracTable(html, name);
        } catch {
          return null;
        }
      })(),
      mlbId ? fetchMLBData(mlbId) : Promise.resolve(null),
    ]);

    let scraped = spotracResult;
    if (!scraped) scraped = await fetchBRefOnceDaily(name);

    const svcStatus = mlbData?.serviceStatus || null;
    const expiry = scraped?.expiry || mlbData?.mlbExpiry || null;
    const contractAvailable = hasVerifiedContractData(scraped, mlbData);
    if (!scraped && !mlbData) return { found: false };

    return {
      found: true,
      contractAvailable,
      source: scraped?.source || "MLB Stats API",
      player: scraped?.player || name,
      team: scraped?.team || null,
      years: scraped?.years || mlbData?.mlbYears || null,
      total: scraped?.total || null,
      aav: scraped?.aav || mlbData?.mlbAav || null,
      salary: scraped?.salary || mlbData?.mlbSalary || null,
      expiry,
      status: deriveStatus(expiry, svcStatus),
      serviceTime: mlbData?.serviceTime || null,
      serviceStatus: svcStatus,
      debutDate: mlbData?.debutDate || null,
    };
  })();
  contractInFlight.set(cacheKey, request);
  try {
    const result = await request;
    if (!result?.found && durableStale) {
      const staleResult = { ...durableStale, freshness: "stale-cached", staleReason: "Contract providers unavailable" };
      recordCacheOutcome("contract", "stale-hit");
      res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
      res.setHeader("X-Provider-Cache", "STALE");
      res.setHeader("X-Provider-Freshness", "stale-cached");
      return res.status(200).json(staleResult);
    }
    recordCacheOutcome("contract", "upstream-miss");
    if (!process.env.VITEST && process.env.DATABASE_URL) {
      const freshUntil = Date.now() + CONTRACT_FRESH_TTL_MS;
      void writeDurableCache({
        cacheKey: durableKey,
        source: result.source || "MLB Stats API",
        data: result,
        freshUntil: new Date(freshUntil),
        staleUntil: new Date(freshUntil + CONTRACT_STALE_TTL_MS),
      });
    }
    res.setHeader("Cache-Control", "public, s-maxage=21600, stale-while-revalidate=3600");
    res.setHeader("X-Provider-Cache", "MISS");
    res.setHeader("X-Provider-Freshness", "live");
    return res.status(200).json(result);
  } finally {
    if (contractInFlight.get(cacheKey) === request) contractInFlight.delete(cacheKey);
  }
}
