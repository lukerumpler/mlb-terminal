import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";

const BREF_ORIGIN = "https://www.baseball-reference.com";
const BREF_SEARCH_URL = `${BREF_ORIGIN}/search/search.fcgi`;
const BREF_ID_PATTERN = /^[a-z][a-z0-9]{8}$/;
const RESOLVER_CACHE_TTL_MS = 7 * 24 * 60 * 60_000;

// A warm server instance can serve a roster without repeating the same mapping
// search. Browser persistence is handled separately by playerIdentityRegistry.
const identityRegistry = new Map();
const identityInFlight = new Map();

const UA = process.env.USER_AGENT ||
  "Mozilla/5.0 (compatible; SKIPBaseball/1.0; +https://mlb-terminal.vercel.app)";

export function normalizeIdentityName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'\u2018\u2019`,-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function isExactIdentityNameMatch(expectedName, candidateName) {
  const expected = normalizeIdentityName(expectedName);
  const candidate = normalizeIdentityName(candidateName);
  return Boolean(expected && candidate && expected === candidate);
}

function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function stripTags(value) {
  return decodeHtml(String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim());
}

export function extractBaseballReferenceId(value) {
  const pathname = String(value || "").split(/[?#]/, 1)[0];
  const match = pathname.match(/^\/players\/[a-z]\/([a-z][a-z0-9]{8})\.shtml$/i);
  return match ? match[1].toLowerCase() : null;
}

export function buildBaseballReferencePlayerUrl(baseballReferenceId) {
  const id = String(baseballReferenceId || "").toLowerCase();
  if (!BREF_ID_PATTERN.test(id)) return null;
  return `${BREF_ORIGIN}/players/${id[0]}/${id}.shtml`;
}

/**
 * Parses only player-page links from Baseball-Reference search HTML. Candidate
 * names are retained so the caller can apply an exact normalized-name test.
 */
export function parseBaseballReferenceSearchCandidates(html) {
  const candidates = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = linkPattern.exec(String(html || ""))) !== null) {
    const id = extractBaseballReferenceId(match[1]);
    const name = stripTags(match[2]);
    if (!id || !name) continue;
    candidates.push({
      id,
      name,
      canonicalUrl: buildBaseballReferencePlayerUrl(id),
    });
  }
  return candidates;
}

export function selectExactBaseballReferenceCandidate(candidates, expectedName) {
  return (Array.isArray(candidates) ? candidates : []).find(candidate =>
    isExactIdentityNameMatch(expectedName, candidate?.name)
  ) || null;
}

/**
 * Player pages have kept their name in an h1 for years. The parser deliberately
 * declines any page where a readable player name cannot be extracted, rather
 * than accepting a requested identifier simply because the request succeeded.
 */
export function parseBaseballReferencePlayerPageName(html) {
  const source = String(html || "");
  const h1 = source.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) return stripTags(h1[1]) || null;
  const title = source.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (!title) return null;
  return stripTags(title[1]).replace(/\s+(?:Stats|Statistics|Career)\b.*$/i, "").trim() || null;
}

function buildIdentityRecord({ mlbId, expectedName, baseballReferenceId, matchedName, method }) {
  const canonicalUrl = buildBaseballReferencePlayerUrl(baseballReferenceId);
  if (!canonicalUrl) return null;
  const verifiedAt = new Date().toISOString();
  return {
    mlb: {
      id: String(mlbId),
      canonicalUrl: `https://www.mlb.com/player/${encodeURIComponent(String(mlbId))}`,
      confidence: "official-id",
      provenance: "MLB Stats API player identifier",
    },
    baseballReference: {
      id: baseballReferenceId,
      canonicalUrl,
      confidence: "exact-name",
      provenance: method === "direct-id"
        ? "Baseball-Reference canonical player page verified by exact normalized player name"
        : "Baseball-Reference search result verified by exact normalized player name",
      matchedName: matchedName || expectedName,
      verifiedAt,
    },
  };
}

async function fetchHtml(url, timeoutMs = 10_000) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "en-US,en;q=0.9",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Baseball-Reference responded ${response.status}`);
  return response.text();
}

function cachedIdentity(mlbId, expectedName) {
  const cached = identityRegistry.get(String(mlbId));
  if (!cached || cached.expiresAt <= Date.now()) {
    if (cached) identityRegistry.delete(String(mlbId));
    return null;
  }
  if (!isExactIdentityNameMatch(expectedName, cached.expectedName)) return null;
  return cached.identity;
}

function storeIdentity(mlbId, expectedName, identity) {
  if (!identity?.baseballReference?.id) return;
  identityRegistry.set(String(mlbId), {
    expectedName,
    identity,
    expiresAt: Date.now() + RESOLVER_CACHE_TTL_MS,
  });
}

async function resolveDirectBaseballReferenceIdentity({ mlbId, expectedName, baseballReferenceId }) {
  const canonicalUrl = buildBaseballReferencePlayerUrl(baseballReferenceId);
  if (!canonicalUrl) return null;
  const html = await fetchHtml(canonicalUrl, 10_000);
  const pageName = parseBaseballReferencePlayerPageName(html);
  if (!isExactIdentityNameMatch(expectedName, pageName)) return null;
  return buildIdentityRecord({
    mlbId,
    expectedName,
    baseballReferenceId,
    matchedName: pageName,
    method: "direct-id",
  });
}

async function resolveSearchBaseballReferenceIdentity({ mlbId, expectedName }) {
  const url = `${BREF_SEARCH_URL}?search=${encodeURIComponent(expectedName)}`;
  const html = await fetchHtml(url, 10_000);
  const candidate = selectExactBaseballReferenceCandidate(
    parseBaseballReferenceSearchCandidates(html),
    expectedName,
  );
  if (!candidate) return null;
  return buildIdentityRecord({
    mlbId,
    expectedName,
    baseballReferenceId: candidate.id,
    matchedName: candidate.name,
    method: "exact-search",
  });
}

export async function resolvePlayerProviderIdentity({ mlbId, name, baseballReferenceId } = {}) {
  const normalizedMlbId = String(mlbId || "").trim();
  const expectedName = String(name || "").trim();
  if (!/^\d+$/.test(normalizedMlbId) || !expectedName || expectedName.length < 2) return null;

  const cached = cachedIdentity(normalizedMlbId, expectedName);
  if (cached) return cached;

  const inFlightKey = `${normalizedMlbId}:${normalizeIdentityName(expectedName)}`;
  const pending = identityInFlight.get(inFlightKey);
  if (pending) return pending;

  const request = (async () => {
    let identity = null;
    const normalizedBRefId = String(baseballReferenceId || "").toLowerCase();
    if (BREF_ID_PATTERN.test(normalizedBRefId)) {
      try {
        identity = await resolveDirectBaseballReferenceIdentity({
          mlbId: normalizedMlbId,
          expectedName,
          baseballReferenceId: normalizedBRefId,
        });
      } catch {
        // A stored ID may be stale or the provider may be temporarily blocked.
        // Do not fall back to a name search during this direct-ID request.
      }
    }

    if (!identity && !normalizedBRefId) {
      try {
        identity = await resolveSearchBaseballReferenceIdentity({
          mlbId: normalizedMlbId,
          expectedName,
        });
      } catch {
        identity = null;
      }
    }

    if (identity) storeIdentity(normalizedMlbId, expectedName, identity);
    return identity;
  })();
  identityInFlight.set(inFlightKey, request);
  try {
    return await request;
  } finally {
    identityInFlight.delete(inFlightKey);
  }
}

export function __resetPlayerIdentityStateForTests() {
  identityRegistry.clear();
  identityInFlight.clear();
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (isRateLimited(req, "player-identity")) return rateLimitResponse(res);

  const url = new URL(req.url, "https://placeholder.invalid");
  const mlbId = (url.searchParams.get("mlbId") || "").trim();
  const name = (url.searchParams.get("name") || "").trim();
  const baseballReferenceId = (url.searchParams.get("baseballReferenceId") || "").trim();
  if (!/^\d+$/.test(mlbId) || !name || name.length < 2) {
    return res.status(400).json({ error: "Valid mlbId and name parameters are required" });
  }

  const identity = await resolvePlayerProviderIdentity({ mlbId, name, baseballReferenceId });
  const directRequest = Boolean(baseballReferenceId);
  const result = {
    found: Boolean(identity),
    identity: identity || {
      mlb: {
        id: mlbId,
        canonicalUrl: `https://www.mlb.com/player/${encodeURIComponent(mlbId)}`,
        confidence: "official-id",
        provenance: "MLB Stats API player identifier",
      },
      baseballReference: null,
    },
    invalidateBaseballReferenceId: directRequest && !identity,
  };

  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).json(result);
}
