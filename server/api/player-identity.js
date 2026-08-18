import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";

const BREF_ORIGIN = "https://www.baseball-reference.com";
const BREF_ID_PATTERN = /^[a-z][a-z0-9]{8}$/;
const IDENTITY_TTL_MS = 7 * 24 * 60 * 60_000;
const identityCache = new Map();
const identityInFlight = new Map();

export function normalizeIdentityName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[.'\u2018\u2019`,-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildBaseballReferencePlayerUrl(value) {
  const id = String(value || "").toLowerCase();
  return BREF_ID_PATTERN.test(id)
    ? `${BREF_ORIGIN}/players/${id[0]}/${id}.shtml`
    : null;
}

function cleanText(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseBaseballReferenceSearchCandidates(html) {
  return [...String(html || "").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
    .map(match => {
      const path = match[1].split(/[?#]/, 1)[0];
      const id = path.match(/^\/players\/[a-z]\/([a-z][a-z0-9]{8})\.shtml$/i)?.[1]?.toLowerCase();
      return id ? { id, name: cleanText(match[2]) } : null;
    })
    .filter(Boolean);
}

export function selectExactBaseballReferenceCandidate(candidates, expectedName) {
  const expected = normalizeIdentityName(expectedName);
  return (candidates || []).find(candidate => normalizeIdentityName(candidate?.name) === expected) || null;
}

export function parseBaseballReferencePlayerPageName(html) {
  const match = String(html || "").match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return match ? cleanText(match[1]) || null : null;
}

function readCached(mlbId, name) {
  const entry = identityCache.get(mlbId);
  if (!entry || entry.expiresAt <= Date.now()) {
    identityCache.delete(mlbId);
    return null;
  }
  return normalizeIdentityName(entry.name) === normalizeIdentityName(name)
    ? entry.identity
    : null;
}

function buildIdentity(mlbId, name, brefId, matchedName, method) {
  const canonicalUrl = buildBaseballReferencePlayerUrl(brefId);
  if (!canonicalUrl) return null;
  return {
    mlb: {
      id: String(mlbId),
      canonicalUrl: `https://www.mlb.com/player/${encodeURIComponent(mlbId)}`,
      confidence: "official-id",
      provenance: "MLB Stats API player identifier",
    },
    baseballReference: {
      id: brefId,
      canonicalUrl,
      confidence: "exact-name",
      provenance:
        method === "direct-id"
          ? "Baseball-Reference canonical player page verified by exact normalized player name"
          : "Baseball-Reference search result verified by exact normalized player name",
      matchedName,
      verifiedAt: new Date().toISOString(),
    },
  };
}

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; SKIPBaseball/1.0)",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Baseball-Reference responded ${response.status}`);
  return response.text();
}

export async function resolvePlayerProviderIdentity({ mlbId, name, baseballReferenceId } = {}) {
  const normalizedId = String(mlbId || "").trim();
  const expectedName = String(name || "").trim();
  if (!/^\d+$/.test(normalizedId) || expectedName.length < 2) return null;
  const directId = String(baseballReferenceId || "").toLowerCase();
  const cacheKey = `${normalizedId}:${normalizeIdentityName(expectedName)}:${directId || "search"}`;
  const cached = readCached(normalizedId, expectedName);
  if (cached && (!directId || cached.baseballReference.id === directId)) return cached;
  if (identityInFlight.has(cacheKey)) return identityInFlight.get(cacheKey);

  const request = (async () => {
    try {
      if (BREF_ID_PATTERN.test(directId)) {
        const pageName = parseBaseballReferencePlayerPageName(
          await fetchHtml(buildBaseballReferencePlayerUrl(directId))
        );
        if (normalizeIdentityName(pageName) !== normalizeIdentityName(expectedName)) return null;
        return buildIdentity(normalizedId, expectedName, directId, pageName, "direct-id");
      }
      const html = await fetchHtml(
        `${BREF_ORIGIN}/search/search.fcgi?search=${encodeURIComponent(expectedName)}`
      );
      const candidate = selectExactBaseballReferenceCandidate(
        parseBaseballReferenceSearchCandidates(html),
        expectedName
      );
      return candidate
        ? buildIdentity(normalizedId, expectedName, candidate.id, candidate.name, "search")
        : null;
    } catch {
      return null;
    }
  })();
  identityInFlight.set(cacheKey, request);
  try {
    const identity = await request;
    if (identity) {
      identityCache.set(normalizedId, {
        name: expectedName,
        identity,
        expiresAt: Date.now() + IDENTITY_TTL_MS,
      });
    }
    return identity;
  } finally {
    identityInFlight.delete(cacheKey);
  }
}

export function __resetPlayerIdentityStateForTests() {
  identityCache.clear();
  identityInFlight.clear();
}

export default async function playerIdentityHandler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (isRateLimited(req, "player-identity")) return rateLimitResponse(res);

  const url = new URL(req.url, "https://placeholder.invalid");
  const mlbId = url.searchParams.get("mlbId")?.trim() || "";
  const name = url.searchParams.get("name")?.trim() || "";
  const baseballReferenceId = url.searchParams.get("baseballReferenceId")?.trim() || "";
  if (!/^\d+$/.test(mlbId) || name.length < 2) {
    return res.status(400).json({ error: "Valid mlbId and name parameters are required" });
  }
  const identity = await resolvePlayerProviderIdentity({ mlbId, name, baseballReferenceId });
  const directRequest = BREF_ID_PATTERN.test(baseballReferenceId.toLowerCase());
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  return res.status(200).json({
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
  });
}
