import { createHash } from "node:crypto";
import { readDurableCache, writeDurableCache } from "../durable-cache";
import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";

const SOURCE = "PlayoffStatus";
const SOURCE_URL = "https://www.playoffstatus.com/mlb/mlbpostseasonprob.html";
const CACHE_TTL_MS = 15 * 60_000;
const STALE_TTL_MS = 24 * 60 * 60_000;
const TEAM_NAME_ALIASES = {
  ARI: ["Diamondbacks", "D. Backs"], ATH: ["Athletics"], ATL: ["Braves"],
  BAL: ["Orioles"], BOS: ["Red Sox"], CHC: ["Cubs"], CIN: ["Reds"],
  CLE: ["Guardians"], COL: ["Rockies"], CWS: ["White Sox"], DET: ["Tigers"],
  HOU: ["Astros"], KC: ["Royals"], KCR: ["Royals"], LAA: ["Angels"],
  LAD: ["Dodgers"], MIA: ["Marlins"], MIL: ["Brewers"], MIN: ["Twins"],
  NYM: ["Mets"], NYY: ["Yankees"], OAK: ["Athletics"], PHI: ["Phillies"],
  PIT: ["Pirates"], SD: ["Padres"], SEA: ["Mariners"], SF: ["Giants"],
  STL: ["Cardinals"], TB: ["Rays"], TEX: ["Rangers"], TOR: ["Blue Jays"],
  WSH: ["Nationals"],
};
const memoryCache = new Map();

function stripTags(value) {
  return String(value || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function cellsFromRow(row) {
  return [...String(row || "").matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map(match => stripTags(match[1]));
}

function matchesTeamName(value, teamAbbr) {
  const aliases = [String(teamAbbr || "").toUpperCase(), ...(TEAM_NAME_ALIASES[String(teamAbbr || "").toUpperCase()] || [])];
  return aliases.some(alias => new RegExp(`(?:^|\\s)${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s|$)`, "i").test(String(value || "")));
}

function parseProviderUpdatedText(html) {
  const text = stripTags(html);
  const match = text.match(/\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{1,2}:\d{2}\s+(?:am|pm)\b/i);
  return match ? match[0] : null;
}

export function parsePlayoffStatusOddsHtml(html, teamAbbr) {
  const table = [...String(html || "").matchAll(/<table[^>]*>([\s\S]*?)<\/table>/gi)]
    .map(match => match[1])
    .find(candidate => /Wildcard Series|WC Series/i.test(stripTags(candidate)));
  if (!table) return null;
  for (const row of table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = cellsFromRow(row[1]);
    if (!cells.length || !cells.some(cell => matchesTeamName(cell, teamAbbr))) continue;
    const playoffOddsDisplay = [...cells].reverse().find(cell => /^(?:>|<)?\s*\d+(?:\.\d+)?%$/i.test(cell.replace(/\s/g, ""))) || null;
    if (!playoffOddsDisplay) return null;
    return {
      found: true,
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      teamAbbr: String(teamAbbr || "").toUpperCase(),
      teamName: cells[0] || null,
      playoffOddsDisplay,
      providerUpdatedText: parseProviderUpdatedText(html),
      methodology: "Published PlayoffStatus probability that the team proceeds to the Wild Card Series; displayed as provided and not converted into a new estimate.",
    };
  }
  return null;
}

function cacheKey(teamAbbr) {
  return `playoffstatus:${createHash("sha256").update(String(teamAbbr || "").toUpperCase()).digest("hex")}`;
}

function toResponse(data, freshness, extra = {}) {
  return { ...data, freshness, servedAt: new Date().toISOString(), ...extra };
}

async function fetchOdds(teamAbbr) {
  const response = await fetch(SOURCE_URL, {
    headers: { "User-Agent": "SKIPBaseball/1.0", Accept: "text/html" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new Error(`${SOURCE} responded with ${response.status}`);
  const parsed = parsePlayoffStatusOddsHtml(await response.text(), teamAbbr);
  if (!parsed) throw new Error(`${SOURCE} did not expose a team-specific Wild Card Series probability`);
  const retrievedAt = new Date().toISOString();
  return { ...parsed, retrievedAt, lastVerifiedAt: retrievedAt };
}

export function __resetPlayoffStatusOddsStateForTests() {
  memoryCache.clear();
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (isRateLimited(req, "playoffstatus-odds")) return rateLimitResponse(res);

  const url = new URL(req.url, "https://placeholder.invalid");
  const teamAbbr = String(url.searchParams.get("team") || "").toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(teamAbbr)) return res.status(400).json({ error: "Valid team abbreviation is required" });

  const key = cacheKey(teamAbbr);
  const now = Date.now();
  let cached = memoryCache.get(key);
  if (!cached) {
    const durable = await readDurableCache(key);
    if (durable) {
      cached = { data: durable.data, freshUntil: new Date(durable.freshUntil).getTime(), staleUntil: new Date(durable.staleUntil).getTime() };
      memoryCache.set(key, cached);
    }
  }
  if (cached?.freshUntil > now) {
    res.setHeader("X-Provider-Cache", "HIT");
    return res.status(200).json(toResponse(cached.data, "cached"));
  }

  try {
    const data = await fetchOdds(teamAbbr);
    const record = { data, freshUntil: now + CACHE_TTL_MS, staleUntil: now + STALE_TTL_MS };
    memoryCache.set(key, record);
    void writeDurableCache({
      cacheKey: key,
      source: SOURCE,
      data,
      freshUntil: new Date(record.freshUntil),
      staleUntil: new Date(record.staleUntil),
    });
    res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=1800");
    res.setHeader("X-Provider-Cache", "MISS");
    return res.status(200).json(toResponse(data, "live"));
  } catch (error) {
    if (cached?.staleUntil > now) {
      res.setHeader("X-Provider-Cache", "STALE");
      return res.status(200).json(toResponse(cached.data, "stale-cached", { staleReason: error.message }));
    }
    return res.status(502).json({
      found: false,
      source: SOURCE,
      sourceUrl: SOURCE_URL,
      teamAbbr,
      playoffOddsDisplay: null,
      freshness: "unavailable",
      error: "Secondary postseason probability provider unavailable",
    });
  }
}
