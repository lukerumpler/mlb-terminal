/**
 * src/api/feed.js  —  Client: fetch posts from /api/feed (nitter RSS proxy)
 *
 * Each call is client-side cached for CACHE_TTL_MS so repeated tab switches
 * don't hammer the serverless function. The server also has its own CDN cache,
 * so in practice most requests resolve from Vercel's edge within ~30 ms.
 */

const CACHE_TTL_MS = 5 * 60 * 1_000; // 5 minutes

import { compareValues } from '../lib/sorting.js';
// { key → { data, ts } }
const _cache = new Map();

function cacheGet(key) {
  const hit = _cache.get(key);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.data;
  return null;
}
function cacheSet(key, data) {
  _cache.set(key, { data, ts: Date.now() });
  return data;
}

/**
 * fetchFeed(handle, n=10)
 * Returns { handle, items, fetchedAt, error? }
 * Never throws — network/parse errors come back as { items:[], error }.
 */
export async function fetchFeed(handle, n = 10) {
  const key = `${handle}:${n}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  try {
    const res  = await fetch(`/api/feed?handle=${encodeURIComponent(handle)}&n=${n}`, {
      signal: AbortSignal.timeout(12_000),
    });
    const data = await res.json();
    return cacheSet(key, data);
  } catch (e) {
    return { handle, items: [], fetchedAt: new Date().toISOString(), error: e.message };
  }
}

/**
 * fetchFeeds(handles, n=10)
 * Fetches multiple accounts in parallel. Returns a flat, time-sorted array
 * of items with a { handle, items, errors } summary object.
 */
export async function fetchFeeds(handles, n = 10) {
  const results = await Promise.all(handles.map(h => fetchFeed(h, n)));
  const items   = results
    .flatMap(r => r.items ?? [])
    // Bug fix 2026-08-11: see src/lib/sorting.js's header comment — this
    // used to be a tie-less `< ? -1 : 1` comparator, same bug class as
    // ProspectsPage.jsx's sort had. Descending (newest first), so ascending=false.
    .sort((a, b) => compareValues(a.isoDate ?? '', b.isoDate ?? '', false));
  const errors  = results.filter(r => r.error).map(r => ({ handle: r.handle, error: r.error }));
  return { items, errors, fetchedAt: new Date().toISOString() };
}
