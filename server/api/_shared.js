/**
 * Shared CORS + rate-limit helpers for the API proxies.
 *
 * Previously every proxy set `Access-Control-Allow-Origin: *` with no
 * throttling — meaning any third-party site could call these endpoints
 * directly and ride this project's Vercel function quota / the upstream
 * APIs' rate limits. This tightens both, while staying safe to deploy
 * with zero configuration.
 */

// --- CORS ---------------------------------------------------------------
// Set ALLOWED_ORIGIN in your Vercel project's environment variables to a
// comma-separated list of the domain(s) this app is actually served from,
// e.g.  ALLOWED_ORIGIN=https://skip.yourdomain.com,https://www.yourdomain.com
// In local development and tests, keep the permissive behavior for convenience.
// In production, an unset allowlist means no cross-origin browser access is
// granted. Same-origin requests do not need a CORS header.
function configuredCorsOrigins() {
  return (process.env.ALLOWED_ORIGIN || "")
    .split(",")
    .map(s => s.trim().replace(/\/$/, ""))
    .filter(Boolean);
}

export function applyCors(req, res) {
  const allowedOrigins = configuredCorsOrigins();
  const isProduction = process.env.NODE_ENV === "production";
  const origin = String(req.headers.origin || "").replace(/\/$/, "");
  if (allowedOrigins.length === 0 && !isProduction) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  } else if (!origin && allowedOrigins.length > 0) {
    // Same-origin navigation / server-to-server calls send no Origin header.
    // The first configured origin is safe for preflight-compatible clients.
    res.setHeader("Access-Control-Allow-Origin", allowedOrigins[0]);
  } else if (origin) {
    // Origin present but not on the allowlist: omit the header so browsers
    // block the response from being read by an unrelated site.
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept");
}

// --- Rate limiting --------------------------------------------------------
// Best-effort, in-memory, per-warm-instance limiter. Vercel functions are
// ephemeral and can run as multiple concurrent instances, so this is NOT a
// hard global guarantee — a determined caller spread across enough cold
// starts can still get through. For a real production ceiling, back this
// with a shared store (Vercel KV, Upstash Redis) keyed the same way. This
// version costs nothing extra to run and stops the common case: a single
// script hammering one endpoint.
const hits = new Map(); // `${bucket}:${ip}` -> { stamps: number[], expiresAt: number }
const DEFAULT_WINDOW_MS = 10_000;
const DEFAULT_MAX_PER_WINDOW = 30;

function envPositiveInt(name, fallback) {
  const parsed = Number(process.env[name]);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Which address identifies the caller. By default this is the first
 * `x-forwarded-for` entry (the long-standing behavior). That entry is supplied
 * by the client whenever the edge APPENDS to the header instead of replacing
 * it, so it can be spoofed to dodge the limiter. If you know how many trusted
 * proxies sit in front of the app, set RATE_LIMIT_TRUSTED_PROXY_HOPS=N: the
 * client is then the Nth address from the RIGHT, which only trusted proxies
 * wrote. (Vercel: 1. Confirm the hop count for any other host before setting.)
 */
export function clientAddress(req) {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "")
    .split(",")
    .map(part => part.trim())
    .filter(Boolean);
  const hops = envPositiveInt("RATE_LIMIT_TRUSTED_PROXY_HOPS", 0);
  if (forwarded.length > 0) {
    if (hops > 0) return forwarded[Math.max(0, forwarded.length - hops)];
    return forwarded[0];
  }
  return req.socket?.remoteAddress || "unknown";
}

/**
 * Routes that call a paid LLM get a much tighter budget than the general proxies.
 * Override with LLM_RATE_LIMIT_MAX / LLM_RATE_LIMIT_WINDOW_MS.
 */
export function llmRateLimit() {
  return {
    max: envPositiveInt("LLM_RATE_LIMIT_MAX", 8),
    windowMs: envPositiveInt("LLM_RATE_LIMIT_WINDOW_MS", 60_000),
  };
}

const MAX_TRACKED_CLIENTS = 5000;

// Keep memory bounded without handing anyone a reset. The old guard called
// hits.clear() at 5,000 keys, which wiped EVERY client's counters at once (so a
// burst of distinct addresses, or just busy traffic, un-throttled heavy callers).
// Now: drop only entries whose window has already passed, then, if still over,
// drop the least recently used until there is headroom.
function trimTrackedClients(now) {
  if (hits.size <= MAX_TRACKED_CLIENTS) return;
  for (const [key, entry] of hits) {
    if (entry.expiresAt <= now) hits.delete(key);
  }
  const target = Math.floor(MAX_TRACKED_CLIENTS * 0.9);
  for (const key of hits.keys()) {
    if (hits.size <= target) break;
    hits.delete(key);
  }
}

export function isRateLimited(req, bucket = "shared", overrides = {}) {
  const windowMs =
    overrides.windowMs ??
    envPositiveInt("RATE_LIMIT_WINDOW_MS", DEFAULT_WINDOW_MS);
  const maxPerWindow =
    overrides.max ?? envPositiveInt("RATE_LIMIT_MAX", DEFAULT_MAX_PER_WINDOW);
  const key = `${bucket}:${clientAddress(req)}`;
  const now = Date.now();
  const recent = (hits.get(key)?.stamps || []).filter(t => now - t < windowMs);
  recent.push(now);
  // Delete then set so Map order tracks recency (oldest first).
  hits.delete(key);
  hits.set(key, { stamps: recent, expiresAt: now + windowMs });
  trimTrackedClients(now);
  return recent.length > maxPerWindow;
}

export function rateLimitResponse(res) {
  res.setHeader("Retry-After", "10");
  return res.status(429).json({
    error: "Too many requests — please slow down and try again shortly.",
  });
}
