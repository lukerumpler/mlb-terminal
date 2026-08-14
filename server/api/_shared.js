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
// Until that's set, this falls back to the previous permissive behavior
// so nothing breaks — but it should be set before a public launch.
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.length === 0) {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  } else if (!origin) {
    // Same-origin navigation / server-to-server calls send no Origin header.
    res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGINS[0]);
  }
  // else: Origin present but not on the allowlist — omit the header
  // entirely so the browser blocks the response from being read.
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
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
