/**
 * /api/mlb.js  —  Vercel Serverless Proxy for MLB Stats API
 *
 * KEY FIX: Preserves special characters (parentheses, commas) in hydrate params
 * by forwarding the raw query string instead of re-encoding with URLSearchParams.
 *
 * Receives:  GET /api/mlb?path=/people/805299&hydrate=stats(type=season,group=hitting,season=2026)
 * Forwards:  GET https://statsapi.mlb.com/api/v1/people/805299?hydrate=stats(type=season,...)
 */
import { applyCors, isRateLimited, rateLimitResponse } from './_shared.js';

const MLB_BASE = 'https://statsapi.mlb.com/api/v1';

const CACHE_RULES = {
  '/standings':     { s: 120, swr: 60  },
  '/schedule':      { s: 90, swr: 60  },
  '/teams':         { s: 300, swr: 120 },
  '/stats/leaders': { s: 300, swr: 120 },
  '/people':        { s: 600, swr: 300 },
  default:          { s: 180, swr: 90  },
};

// The browser has its own request cache, but local development and some
// serverless paths do not honor a shared CDN cache. Keep a small warm-instance
// cache here as a second line of defense so repeated reads do not consume the
// per-IP limiter or re-hit Stats API. This is intentionally best-effort; the
// client cache remains the source of truth for verified local snapshots.
const responseCache = new Map();

function responseCacheKey(path, forwardedQs) {
  return `${path}?${forwardedQs}`;
}

function setProxyHeaders(res, rule, source, cacheStatus) {
  res.setHeader('Cache-Control', `public, s-maxage=${rule.s}, stale-while-revalidate=${rule.swr}`);
  res.setHeader('X-Proxy-Source', source);
  res.setHeader('X-Proxy-Cache', cacheStatus);
}


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
  // Extract path param (URL-decoded) for validation and cache lookup
  const urlObj = new URL(req.url, 'https://placeholder.invalid');
  const path = urlObj.searchParams.get('path');

  if (!path) {
    return res.status(400).json({
      error: 'Missing required query param: path',
      example: '/api/mlb?path=/people/805299&hydrate=stats(type=season,group=hitting,season=2026)',
    });
  }

  if (!path.startsWith('/') || path.includes('://')) {
    return res.status(400).json({ error: 'Invalid path parameter' });
  }

  // Forward the raw query string (minus "path=...") so that special characters
  // like parentheses and commas in hydrate=stats(type=season,...) reach MLB intact.
  const rawQuery = req.url.includes('?') ? req.url.split('?')[1] : '';
  const forwardedQs = rawQuery
    .split('&')
    .filter(part => !part.startsWith('path='))
    .join('&');

  const rule = getCacheRule(path);
  const cacheKey = responseCacheKey(path, forwardedQs);
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    setProxyHeaders(res, rule, cached.source, 'HIT');
    return res.status(200).json(cached.data);
  }
  if (cached) responseCache.delete(cacheKey);

  // Count only cache misses. This prevents a normal page reload from spending
  // rate-limit budget on responses already held by the warm proxy instance.
  if (isRateLimited(req, 'mlb')) return rateLimitResponse(res);

  const mlbUrl = `${MLB_BASE}${path}${forwardedQs ? '?' + forwardedQs : ''}`;

  let mlbRes;
  try {
    mlbRes = await fetch(mlbUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; MLBDashboard/1.0)',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    const isTimeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    console.error('[mlb-proxy] fetch error:', err.message);
    return res.status(isTimeout ? 504 : 502).json({
      error: isTimeout ? 'MLB API timed out' : 'Failed to reach MLB API',
      detail: err.message,
      url: mlbUrl,
    });
  }

  if (!mlbRes.ok) {
    const body = await mlbRes.text().catch(() => '');
    console.error('[mlb-proxy] MLB returned', mlbRes.status, '| url:', mlbUrl);
    return res.status(mlbRes.status).json({
      error: `MLB API responded with ${mlbRes.status}`,
      url: mlbUrl,
      body: body.slice(0, 500),
    });
  }

  let data;
  try {
    const body = await mlbRes.text();
    if (!body.trim()) {
      console.error('[mlb-proxy] empty response | url:', mlbUrl);
      return res.status(502).json({ error: 'MLB API returned an empty response', url: mlbUrl });
    }
    data = JSON.parse(body);
  } catch (err) {
    console.error('[mlb-proxy] JSON parse error | url:', mlbUrl, '| detail:', err.message);
    return res.status(502).json({ error: 'MLB API returned non-JSON response', url: mlbUrl });
  }

  responseCache.set(cacheKey, { data, source: mlbUrl, expiresAt: Date.now() + rule.s * 1000 });
  if (responseCache.size > 500) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  setProxyHeaders(res, rule, mlbUrl, 'MISS');

  return res.status(200).json(data);
}
