/**
 * /api/mlb.js  —  Vercel Serverless Proxy for MLB Stats API
 *
 * KEY FIX: Preserves special characters (parentheses, commas) in hydrate params
 * by forwarding the raw query string instead of re-encoding with URLSearchParams.
 *
 * Receives:  GET /api/mlb?path=/people/805299&hydrate=stats(type=season,group=hitting,season=2026)
 * Forwards:  GET https://statsapi.mlb.com/api/v1/people/805299?hydrate=stats(type=season,...)
 */
import { createHash } from "node:crypto";
import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";
import { readDurableCache, writeDurableCache } from "../durable-cache";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";

const CACHE_RULES = {
  "/standings": { s: 120, swr: 60 },
  "/schedule": { s: 90, swr: 60 },
  "/teams": { s: 300, swr: 120 },
  "/stats/leaders": { s: 300, swr: 120 },
  "/people": { s: 600, swr: 300 },
  default: { s: 180, swr: 90 },
};

// The browser has its own request cache, but local development and some
// serverless paths do not honor a shared CDN cache. Keep a small warm-instance
// cache here as a second line of defense so repeated reads do not consume the
// per-IP limiter or re-hit Stats API. This is intentionally best-effort; the
// client cache remains the source of truth for verified local snapshots.
const responseCache = new Map();
const MLB_FAILURE_COOLDOWN_MS = 15_000;
const UPSTREAM_TIMEOUT_MS = {
  "/schedule": 20_000,
  "/teams": 15_000,
  default: 12_000,
};

export function getUpstreamTimeoutMs(path) {
  for (const [prefix, timeoutMs] of Object.entries(UPSTREAM_TIMEOUT_MS)) {
    if (prefix !== "default" && path.startsWith(prefix)) return timeoutMs;
  }
  return UPSTREAM_TIMEOUT_MS.default;
}
const upstreamFailureUntil = new Map();
// Overview, ticker, and affiliate panels can request the same resource at
// nearly the same time. Share one upstream promise during a cache miss so a
// warm proxy instance does not create a burst of duplicate MLB requests.
const inFlightRequests = new Map();

export function __resetMlbProxyStateForTests() {
  responseCache.clear();
  inFlightRequests.clear();
  upstreamFailureUntil.clear();
}

function responseCacheKey(path, forwardedQs) {
  return `${path}?${forwardedQs}`;
}

function durableCacheKey(cacheKey) {
  return `mlb:${createHash("sha256").update(cacheKey).digest("hex")}`;
}

function setProxyHeaders(res, rule, source, cacheStatus, freshness = "live") {
  res.setHeader(
    "Cache-Control",
    `public, s-maxage=${rule.s}, stale-while-revalidate=${rule.swr}`
  );
  res.setHeader("X-Proxy-Source", source);
  res.setHeader("X-Proxy-Cache", cacheStatus);
  res.setHeader("X-Proxy-Freshness", freshness);
}

function getStaleEntry(entry) {
  return entry && entry.staleExpiresAt > Date.now() ? entry : null;
}

function serveStale(res, rule, entry, reason) {
  setProxyHeaders(res, rule, entry.source, "STALE", "stale-cached");
  res.setHeader("X-Proxy-Stale-Reason", reason);
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300"
  );
  return res.status(200).json(entry.data);
}

function getCacheRule(path) {
  for (const [prefix, rule] of Object.entries(CACHE_RULES)) {
    if (prefix !== "default" && path.startsWith(prefix)) return rule;
  }
  return CACHE_RULES.default;
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  // Extract path param (URL-decoded) for validation and cache lookup
  const urlObj = new URL(req.url, "https://placeholder.invalid");
  const path = urlObj.searchParams.get("path");

  if (!path) {
    return res.status(400).json({
      error: "Missing required query param: path",
      example:
        "/api/mlb?path=/people/805299&hydrate=stats(type=season,group=hitting,season=2026)",
    });
  }

  if (!path.startsWith("/") || path.includes("://")) {
    return res.status(400).json({ error: "Invalid path parameter" });
  }

  // Forward the raw query string (minus "path=...") so that special characters
  // like parentheses and commas in hydrate=stats(type=season,...) reach MLB intact.
  const rawQuery = req.url.includes("?") ? req.url.split("?")[1] : "";
  const forwardedQs = rawQuery
    .split("&")
    .filter(part => !part.startsWith("path="))
    .join("&");

  const rule = getCacheRule(path);
  const cacheKey = responseCacheKey(path, forwardedQs);
  let cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    setProxyHeaders(res, rule, cached.source, "HIT", "fresh");
    return res.status(200).json(cached.data);
  }

  // Warm instances are fastest, but the database-backed record lets separate
  // server instances and user sessions reuse the same verified response.
  if (!process.env.VITEST && process.env.DATABASE_URL && (!cached || cached.expiresAt <= Date.now())) {
    const durable = await readDurableCache(durableCacheKey(cacheKey));
    if (durable) {
      cached = {
        data: durable.data,
        source: durable.source,
        expiresAt: new Date(durable.freshUntil).getTime(),
        staleExpiresAt: new Date(durable.staleUntil).getTime(),
      };
      responseCache.set(cacheKey, cached);
      if (cached.expiresAt > Date.now()) {
        setProxyHeaders(res, rule, cached.source, "DURABLE-HIT", "fresh");
        return res.status(200).json(cached.data);
      }
    }
  }
  if (cached && !getStaleEntry(cached)) responseCache.delete(cacheKey);

  const existingRequest = inFlightRequests.get(cacheKey);
  if (existingRequest) {
    try {
      const result = await existingRequest;
      setProxyHeaders(res, rule, result.source, "COALESCED");
      return res.status(200).json(result.data);
    } catch (error) {
      if (getStaleEntry(cached))
        return serveStale(
          res,
          rule,
          cached,
          error?.status === 429 ? "upstream-rate-limit" : "upstream-unavailable"
        );
      if (error?.retryAfter) res.setHeader("Retry-After", error.retryAfter);
      return res
        .status(error?.status || 502)
        .json(error?.payload || { error: "MLB upstream request failed" });
    }
  }

  const failureUntil = upstreamFailureUntil.get(cacheKey) || 0;
  if (failureUntil > Date.now()) {
    if (getStaleEntry(cached))
      return serveStale(res, rule, cached, "recent-upstream-failure");
    const retryAfter = Math.ceil((failureUntil - Date.now()) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return res
      .status(503)
      .json({
        error: "MLB resource temporary upstream cooldown active",
        retryAfter,
        path,
      });
  }
  if (failureUntil) upstreamFailureUntil.delete(cacheKey);

  // Count only cache misses that will create an upstream request. Requests
  // arriving while that miss is in flight share the same promise and do not
  // spend additional rate-limit budget.
  if (isRateLimited(req, "mlb")) return rateLimitResponse(res);

  const mlbUrl = `${MLB_BASE}${path}${forwardedQs ? "?" + forwardedQs : ""}`;
  const upstreamRequest = (async () => {
    let mlbRes;
    try {
      mlbRes = await fetch(mlbUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; MLBDashboard/1.0)",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(getUpstreamTimeoutMs(path)),
      });
    } catch (err) {
      const isTimeout =
        err.name === "TimeoutError" || err.name === "AbortError";
      console.error("[mlb-proxy] fetch error:", err.message);
      throw {
        status: isTimeout ? 504 : 502,
        payload: {
          error: isTimeout ? "MLB API timed out" : "Failed to reach MLB API",
          detail: err.message,
          url: mlbUrl,
        },
      };
    }

    if (!mlbRes.ok) {
      const body = await mlbRes.text().catch(() => "");
      const retryAfter = mlbRes.headers?.get?.("Retry-After");
      console.error(
        "[mlb-proxy] MLB returned",
        mlbRes.status,
        "| url:",
        mlbUrl
      );
      throw {
        status: mlbRes.status,
        retryAfter,
        payload: {
          error: `MLB API responded with ${mlbRes.status}`,
          url: mlbUrl,
          body: body.slice(0, 500),
        },
      };
    }

    let data;
    try {
      const body = await mlbRes.text();
      if (!body.trim())
        throw Object.assign(new Error("empty response"), { emptyBody: true });
      data = JSON.parse(body);
    } catch (err) {
      console.error(
        "[mlb-proxy] JSON parse error | url:",
        mlbUrl,
        "| detail:",
        err.message
      );
      throw {
        status: 502,
        payload: {
          error: err.emptyBody
            ? "MLB API returned an empty response"
            : "MLB API returned non-JSON response",
          url: mlbUrl,
        },
      };
    }
    return { data, source: mlbUrl };
  })();

  inFlightRequests.set(cacheKey, upstreamRequest);
  try {
    const result = await upstreamRequest;
    upstreamFailureUntil.delete(cacheKey);
    const expiresAt = Date.now() + rule.s * 1000;
    const staleExpiresAt = expiresAt + Math.max(rule.swr * 1000, 60_000);
    responseCache.set(cacheKey, {
      data: result.data,
      source: result.source,
      expiresAt,
      staleExpiresAt,
    });
    void writeDurableCache({
      cacheKey: durableCacheKey(cacheKey),
      source: "MLB Stats API",
      data: result.data,
      freshUntil: new Date(expiresAt),
      staleUntil: new Date(staleExpiresAt),
    });
    if (responseCache.size > 500) {
      const oldestKey = responseCache.keys().next().value;
      if (oldestKey) responseCache.delete(oldestKey);
    }
    setProxyHeaders(res, rule, result.source, "MISS", "fresh");
    return res.status(200).json(result.data);
  } catch (error) {
    if (error?.status >= 500)
      upstreamFailureUntil.set(cacheKey, Date.now() + MLB_FAILURE_COOLDOWN_MS);
    if (getStaleEntry(cached))
      return serveStale(
        res,
        rule,
        cached,
        error?.status === 429 ? "upstream-rate-limit" : "upstream-unavailable"
      );
    if (error?.retryAfter) res.setHeader("Retry-After", error.retryAfter);
    return res
      .status(error?.status || 502)
      .json(error?.payload || { error: "MLB upstream request failed" });
  } finally {
    if (inFlightRequests.get(cacheKey) === upstreamRequest)
      inFlightRequests.delete(cacheKey);
  }
}
