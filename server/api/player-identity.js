import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";

const BREF_ORIGIN = "https://www.baseball-reference.com";
const BREF_SEARCH_URL = `${BREF_ORIGIN}/search/search.fcgi`;
const BREF_ID_PATTERN = /^[a-z][a-z0-9]{8}$/;
const RESOLVER_CACHE_TTL_MS = 7 * 24 * 60 * 60_000;

// A warm server instance can serve a roster without repeating the same mapping
// search. Browser persistence is handled separately by playerIdentityRegistry.
const identityRegistry = new Map();
const identityInFlight = new Map();

// Aggregate counters only: no player names, MLB IDs, Baseball-Reference IDs,
// IP addresses, or request payloads are retained in this process-level view.
const telemetryCounters = {
  resolverRequests: 0,
  directIdRequests: 0,
  browserRegistryReuses: 0,
  serverRegistryHits: 0,
  directCanonicalRequests: 0,
  directCanonicalVerified: 0,
  directCanonicalRejected: 0,
  directCanonicalErrors: 0,
  nameSearchRequests: 0,
  nameSearchExactMatches: 0,
  nameSearchRejected: 0,
  resolved: 0,
  unresolved: 0,
  directIdInvalidations: 0,
};

const telemetryLatency = {
  directCanonical: { samples:0, totalMs:0, minMs:null, maxMs:0 },
  nameSearch: { samples:0, totalMs:0, minMs:null, maxMs:0 },
  serverRegistryHit: { samples:0, totalMs:0, minMs:null, maxMs:0 },
};

function recordLatency(bucket, startedAtMs) {
  const entry = telemetryLatency[bucket];
  if (!entry) return;
  const durationMs = Math.max(0, Date.now() - Number(startedAtMs || Date.now()));
  entry.samples += 1;
  entry.totalMs += durationMs;
  entry.minMs = entry.minMs == null ? durationMs : Math.min(entry.minMs, durationMs);
  entry.maxMs = Math.max(entry.maxMs, durationMs);
}

function summarizeLatency(entry) {
  return {
    samples:entry.samples,
    totalMs:Math.round(entry.totalMs),
    averageMs:entry.samples ? Number((entry.totalMs / entry.samples).toFixed(1)) : null,
    minMs:entry.minMs == null ? null : Math.round(entry.minMs),
    maxMs:entry.samples ? Math.round(entry.maxMs) : null,
  };
}

function recordTelemetry(key) {
  if (Object.prototype.hasOwnProperty.call(telemetryCounters, key)) telemetryCounters[key] += 1;
}

function percentage(numerator, denominator) {
  return denominator > 0 ? Number((100 * numerator / denominator).toFixed(1)) : null;
}

export function getPlayerIdentityTelemetry() {
  const counters = { ...telemetryCounters };
  return {
    counters,
    directIdRequestRate: percentage(counters.directIdRequests, counters.resolverRequests),
    browserRegistryReuseRate: percentage(counters.browserRegistryReuses, counters.directIdRequests),
    serverRegistryHitRate: percentage(counters.serverRegistryHits, counters.resolverRequests),
    directCanonicalVerificationRate: percentage(counters.directCanonicalVerified, counters.directCanonicalRequests),
    nameSearchExactMatchRate: percentage(counters.nameSearchExactMatches, counters.nameSearchRequests),
    latencyMs: Object.fromEntries(Object.entries(telemetryLatency).map(([key, value]) => [key, summarizeLatency(value)])),
  };
}

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
  const startedAt = Date.now();
  const canonicalUrl = buildBaseballReferencePlayerUrl(baseballReferenceId);
  if (!canonicalUrl) return null;
  recordTelemetry('directCanonicalRequests');
  try {
    const html = await fetchHtml(canonicalUrl, 10_000);
    const pageName = parseBaseballReferencePlayerPageName(html);
    if (!isExactIdentityNameMatch(expectedName, pageName)) {
      recordTelemetry('directCanonicalRejected');
      return null;
    }
    recordTelemetry('directCanonicalVerified');
    return buildIdentityRecord({
      mlbId,
      expectedName,
      baseballReferenceId,
      matchedName: pageName,
      method: "direct-id",
    });
  } catch (error) {
    recordTelemetry('directCanonicalErrors');
    throw error;
  } finally {
    recordLatency('directCanonical', startedAt);
  }
}

async function resolveSearchBaseballReferenceIdentity({ mlbId, expectedName }) {
  const startedAt = Date.now();
  recordTelemetry('nameSearchRequests');
  try {
    const url = `${BREF_SEARCH_URL}?search=${encodeURIComponent(expectedName)}`;
    const html = await fetchHtml(url, 10_000);
    const candidate = selectExactBaseballReferenceCandidate(
      parseBaseballReferenceSearchCandidates(html),
      expectedName,
    );
    if (!candidate) {
      recordTelemetry('nameSearchRejected');
      return null;
    }
    recordTelemetry('nameSearchExactMatches');
    return buildIdentityRecord({
      mlbId,
      expectedName,
      baseballReferenceId: candidate.id,
      matchedName: candidate.name,
      method: "exact-search",
    });
  } finally {
    recordLatency('nameSearch', startedAt);
  }
}

export async function resolvePlayerProviderIdentity({ mlbId, name, baseballReferenceId } = {}) {
  const startedAt = Date.now();
  const normalizedMlbId = String(mlbId || "").trim();
  const expectedName = String(name || "").trim();
  if (!/^\d+$/.test(normalizedMlbId) || !expectedName || expectedName.length < 2) return null;
  recordTelemetry('resolverRequests');

  const normalizedBRefId = String(baseballReferenceId || "").toLowerCase();
  const hasDirectId = BREF_ID_PATTERN.test(normalizedBRefId);
  const cached = cachedIdentity(normalizedMlbId, expectedName);
  // A direct request must validate the requested canonical ID, not reuse a
  // differently keyed warm entry from an earlier name search.
  if (cached && (!hasDirectId || cached.baseballReference?.id === normalizedBRefId)) {
    recordTelemetry('serverRegistryHits');
    recordLatency('serverRegistryHit', startedAt);
    recordTelemetry('resolved');
    return cached;
  }

  const inFlightKey = `${normalizedMlbId}:${normalizeIdentityName(expectedName)}:${hasDirectId ? normalizedBRefId : 'search'}`;
  const pending = identityInFlight.get(inFlightKey);
  if (pending) return pending;

  const request = (async () => {
    let identity = null;
    if (hasDirectId) {
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

    if (!identity && !hasDirectId) {
      try {
        identity = await resolveSearchBaseballReferenceIdentity({
          mlbId: normalizedMlbId,
          expectedName,
        });
      } catch {
        identity = null;
      }
    }

    if (identity) {
      storeIdentity(normalizedMlbId, expectedName, identity);
      recordTelemetry('resolved');
    } else {
      recordTelemetry('unresolved');
    }
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
  Object.keys(telemetryCounters).forEach(key => { telemetryCounters[key] = 0; });
  Object.values(telemetryLatency).forEach(entry => {
    entry.samples = 0;
    entry.totalMs = 0;
    entry.minMs = null;
    entry.maxMs = 0;
  });
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const url = new URL(req.url, "https://placeholder.invalid");
  if (url.searchParams.get('mode') === 'metrics') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ scope:'process', telemetry:getPlayerIdentityTelemetry() });
  }
  if (isRateLimited(req, "player-identity")) return rateLimitResponse(res);

  const mlbId = (url.searchParams.get("mlbId") || "").trim();
  const name = (url.searchParams.get("name") || "").trim();
  const baseballReferenceId = (url.searchParams.get("baseballReferenceId") || "").trim();
  if (!/^\d+$/.test(mlbId) || !name || name.length < 2) {
    return res.status(400).json({ error: "Valid mlbId and name parameters are required" });
  }

  const directRequest = BREF_ID_PATTERN.test(String(baseballReferenceId).toLowerCase());
  if (directRequest) {
    recordTelemetry('directIdRequests');
    if (url.searchParams.get('identitySource') === 'registry') recordTelemetry('browserRegistryReuses');
  }
  const identity = await resolvePlayerProviderIdentity({ mlbId, name, baseballReferenceId });
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
  if (result.invalidateBaseballReferenceId) recordTelemetry('directIdInvalidations');

  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).json(result);
}
