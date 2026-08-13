// api/ncaa.js — Vercel Serverless Proxy for NCAA API (henrygd/ncaa-api)
// Proxies requests to https://ncaa-api.henrygd.me to avoid CORS.
// Public API: 5 req/sec per IP — use self-hosted instance for production.
//
// Frontend calls: GET /api/ncaa?path=/scoreboard/baseball/d1/2026/05/all-conf
// This proxy strips `path=` and forwards everything else as-is.
import { applyCors, isRateLimited, rateLimitResponse } from './_shared.js';

// NOTE: the per-IP limiter below only throttles a single caller hammering
// this proxy — it can't protect the *upstream's* 5 req/sec-per-IP cap
// (line 3) from being exceeded in aggregate once many different users hit
// this endpoint concurrently, since Vercel functions share/rotate egress
// IPs. If NCAA data starts getting rate-limited under real traffic, that's
// why — the real fix is a shared counter (Vercel KV / Upstash) across all
// invocations, not per-client throttling.

const NCAA_BASE = 'https://ncaa-api.henrygd.me';

const CACHE_RULES = {
  '/scoreboard': { s: 30,  swr: 15  }, // live scores — short TTL
  '/game':       { s: 60,  swr: 30  }, // box scores / PBP
  '/stats':      { s: 300, swr: 120 }, // stat leaders
  '/standings':  { s: 300, swr: 120 },
  '/rankings':   { s: 600, swr: 300 },
  '/schedule':   { s: 600, swr: 300 },
  '/news':       { s: 300, swr: 120 },
  '/brackets':   { s: 60,  swr: 30  },
  default:       { s: 180, swr: 90  },
};

function getCacheRule(path) {
  for (const [prefix, rule] of Object.entries(CACHE_RULES)) {
    if (prefix !== 'default' && path.startsWith(prefix)) return rule;
  }
  return CACHE_RULES.default;
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (isRateLimited(req)) return rateLimitResponse(res);

  const urlObj = new URL(req.url, 'https://placeholder.invalid');
  const path   = urlObj.searchParams.get('path');

  if (!path) {
    return res.status(400).json({
      error: 'Missing required query param: path',
      example: '/api/ncaa?path=/scoreboard/baseball/d1/2026/05/all-conf',
    });
  }

  if (!path.startsWith('/') || path.includes('://')) {
    return res.status(400).json({ error: 'Invalid path parameter' });
  }

  // Forward extra params (e.g. page=2) stripping the path= param
  const rawQuery   = req.url.includes('?') ? req.url.split('?')[1] : '';
  const forwardedQs = rawQuery
    .split('&')
    .filter(p => !p.startsWith('path='))
    .join('&');

  const ncaaUrl = `${NCAA_BASE}${path}${forwardedQs ? '?' + forwardedQs : ''}`;

  let ncaaRes;
  try {
    ncaaRes = await fetch(ncaaUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SKIPBaseball/1.0)',
        'Accept':     'application/json',
      },
      signal: AbortSignal.timeout(12_000),
    });
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    console.error('[ncaa-proxy] fetch error:', err.message);
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'NCAA API timed out' : 'Failed to reach NCAA API',
      detail: err.message,
      url: ncaaUrl,
    });
  }

  if (!ncaaRes.ok) {
    const body = await ncaaRes.text().catch(() => '');
    return res.status(ncaaRes.status).json({
      error: `NCAA API responded with ${ncaaRes.status}`,
      url: ncaaUrl,
      body: body.slice(0, 500),
    });
  }

  let data;
  try {
    data = await ncaaRes.json();
  } catch (err) {
    return res.status(502).json({ error: 'NCAA API returned non-JSON response', url: ncaaUrl });
  }

  const rule = getCacheRule(path);
  res.setHeader('Cache-Control', `public, s-maxage=${rule.s}, stale-while-revalidate=${rule.swr}`);
  res.setHeader('X-Proxy-Source', ncaaUrl);

  return res.status(200).json(data);
}
