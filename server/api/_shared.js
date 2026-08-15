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
  return (process.env.ALLOWED_ORIGIN || '')
    .split(',')
    .map(s => s.trim().replace(/\/$/, ''))
    .filter(Boolean);
}

export function applyCors(req, res) {
  const allowedOrigins = configuredCorsOrigins();
  const isProduction = process.env.NODE_ENV === 'production';
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  if (allowedOrigins.length === 0 && !isProduction) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin && allowedOrigins.length > 0) {
    // Same-origin navigation / server-to-server calls send no Origin header.
    // The first configured origin is safe for preflight-compatible clients.
    res.setHeader('Access-Control-Allow-Origin', allowedOrigins[0]);
  } else if (origin) {
    // Origin present but not on the allowlist: omit the header so browsers
    // block the response from being read by an unrelated site.
    res.setHeader('Vary', 'Origin');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
}

// --- Rate limiting --------------------------------------------------------
// Best-effort, in-memory, per-warm-instance limiter. Vercel functions are
// ephemeral and can run as multiple concurrent instances, so this is NOT a
// hard global guarantee — a determined caller spread across enough cold
// starts can still get through. For a real production ceiling, back this
// with a shared store (Vercel KV, Upstash Redis) keyed the same way. This
// version costs nothing extra to run and stops the common case: a single
// script hammering one endpoint.
const hits = new Map(); // `${bucket}:${ip}` -> timestamps[]
const WINDOW_MS = 10_000;
const MAX_PER_WINDOW = 30;

export function isRateLimited(req, bucket = 'shared') {
  const ip = (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
    .split(',')[0].trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) || []).filter(t => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) hits.clear(); // cheap guard against unbounded growth
  return recent.length > MAX_PER_WINDOW;
}

export function rateLimitResponse(res) {
  res.setHeader('Retry-After', '10');
  return res.status(429).json({ error: 'Too many requests — please slow down and try again shortly.' });
}
