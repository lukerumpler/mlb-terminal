import { apiUrl } from './apiOrigin.js';

const CACHE_HEALTH_TTL_MS = 60_000;
let cached = null;
let inFlight = null;

export async function getCacheHealth(now = Date.now()) {
  if (cached?.expiresAt > now) return cached.data;
  if (inFlight) return inFlight;

  const request = fetch(apiUrl('/api/cache-health'), {
    headers: { Accept: 'application/json' },
  })
    .then(response => response.ok ? response.json() : null)
    .then(data => {
      if (data) cached = { data, expiresAt: Date.now() + CACHE_HEALTH_TTL_MS };
      return data;
    })
    .finally(() => { inFlight = null; });

  inFlight = request;
  return request;
}

export function __resetCacheHealthClientForTests() {
  cached = null;
  inFlight = null;
}
