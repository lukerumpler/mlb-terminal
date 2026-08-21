/**
 * Client news helper for SKIP's three-tier /api/news route.
 *
 * The server decides which provider wins. The client preserves that decision
 * and exposes sourceStatuses so the UI can show Tier 1, Tier 2, Tier 3,
 * cached-fallback, or unavailable without guessing.
 */

import { compareValues } from '../lib/sorting.js';
import { recordFeedSuccess } from '../lib/feedFreshness.js';
import { apiUrl } from '../lib/apiOrigin.js';

const CACHE_TTL_MS = 5 * 60 * 1_000;
const STALE_TTL_MS = 30 * 60 * 1_000;
const _cache = new Map();
const _inFlight = new Map();

function cacheGet(key) {
  const hit = _cache.get(key);
  if (!hit) return null;
  const now = Date.now();
  if (hit.staleUntil > now) return hit;
  _cache.delete(key);
  return null;
}

function cacheSet(key, data) {
  const now = Date.now();
  const entry = { data, retrievedAt: now, expiresAt: now + CACHE_TTL_MS, staleUntil: now + STALE_TTL_MS, retryAfter: 0 };
  _cache.set(key, entry);
  return entry;
}

function kindForHandles(handles = []) {
  return handles.some(handle => /ncaa|college/i.test(String(handle))) ? 'college' : 'mlb';
}

function requestedKinds(handles = []) {
  const values = new Set(handles.map(handle => String(handle).toLowerCase()));
  const wantsCollege = handles.length === 0 || [...values].some(value => /ncaa|college/.test(value));
  const wantsMlb = handles.length === 0 || [...values].some(value => /mlb|espn|fox|official|team/.test(value));
  return [
    ...(wantsMlb ? ['mlb'] : []),
    ...(wantsCollege ? ['college'] : []),
  ];
}

async function fetchNews(kind, n, handle = null, team = null) {
  const normalizedTeam = team ? String(team).trim().toUpperCase() : null;
  const key = `${handle ? `handle:${handle}` : normalizedTeam ? `team:${normalizedTeam}` : kind}:${n}`;
  const cached = cacheGet(key);
  const now = Date.now();
  if (cached?.expiresAt > now) {
    return { ...cached.data, status: 'cached', ageSeconds: Math.round((now - cached.retrievedAt) / 1000) };
  }
  // A stale snapshot may be shown while revalidation occurs, but failures
  // must not turn the five-minute page cadence into repeated upstream calls.
  if (cached?.retryAfter > now) {
    return { ...cached.data, status: 'cached-fallback', freshness: 'stale-cached', ageSeconds: Math.round((now - cached.retrievedAt) / 1000), reason: 'revalidation-cooldown' };
  }

  const pending = _inFlight.get(key);
  if (pending) return pending;

  const request = (async () => {
    try {
      const query = handle
        ? `handle=${encodeURIComponent(handle)}&n=${n}`
        : normalizedTeam
          ? `team=${encodeURIComponent(normalizedTeam)}&n=${n}`
          : `kind=${encodeURIComponent(kind)}&n=${n}`;
      const response = await fetch(apiUrl(`/api/news?${query}`), {
        signal: AbortSignal.timeout(14_000),
      });
      const data = await response.json();
      if (!response.ok && !data?.items?.length) {
        return { handle: handle || normalizedTeam || kind, items: [], sourceStatuses: data?.sourceStatuses ?? [], sources: data?.sources ?? [], status: 'unavailable', error: data?.error || `HTTP ${response.status}` };
      }
      const entry = cacheSet(key, data);
      if (data?.status !== 'unavailable' && data?.items?.length) recordFeedSuccess('intel-feed');
      return { ...data, ageSeconds: Math.round((Date.now() - entry.retrievedAt) / 1000) };
    } catch (error) {
      // Keep the stale entry captured before the request. Calling cacheGet()
      // here can be too late if a concurrent cleanup invalidates the key.
      if (cached?.staleUntil > Date.now()) {
        cached.retryAfter = Date.now() + CACHE_TTL_MS;
        return { ...cached.data, status: 'cached-fallback', freshness: 'stale-cached', ageSeconds: Math.round((Date.now() - cached.retrievedAt) / 1000), reason: error?.message || 'network-error' };
      }
      return { handle: handle || normalizedTeam || kind, items: [], sourceStatuses: [], sources: [], status: 'unavailable', error: error?.message || 'News request failed' };
    }
  })();

  _inFlight.set(key, request);
  request.finally(() => _inFlight.delete(key)).catch(() => {});
  return request;
}

/**
 * Legacy-compatible single feed call. Handles containing NCAA/college select
 * the NCAA tier chain; all other handles use the MLB news chain.
 */
export async function fetchFeed(handle, n = 10) {
  const result = await fetchNews(kindForHandles([handle]), n, handle);
  return { ...result, handle };
}

/**
 * Team news deliberately uses the existing resilient news endpoint. The
 * server selects an official club RSS feed first, retains 15-minute fresh and
 * 24-hour stale snapshots, and exposes source status to the UI. This request
 * is initiated only when the Team News workspace is opened.
 */
export async function fetchTeamNews(teamAbbr, n = 8) {
  const team = String(teamAbbr || '').trim().toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(team)) {
    return { handle: team || 'team', items: [], sourceStatuses: [], sources: [], status: 'unavailable', freshness: 'unavailable', error: 'A valid MLB team is required' };
  }
  return fetchNews('mlb', n, null, team);
}

/**
 * Fetches the active MLB and/or college chains, merges and time-sorts items,
 * and returns the complete source-state summary for the React page.
 */
export async function fetchFeeds(handles = [], n = 10) {
  const kinds = requestedKinds(handles);
  const results = await Promise.all(kinds.map(kind => fetchNews(kind, n)));
  const allowed = new Set(handles.map(handle => String(handle).toLowerCase()));
  const items = results
    .flatMap(result => result.items ?? [])
    .filter(item => allowed.size === 0 || allowed.has(String(item.sourceKey || item.handle).toLowerCase()) || /official|espn|fox|mlb|ncaa|college/.test(String(item.sourceKey || item.handle).toLowerCase()))
    .sort((a, b) => compareValues(a.isoDate ?? '', b.isoDate ?? '', false));

  const sourceStatuses = results.flatMap(result => result.sourceStatuses ?? []);
  const sources = results.flatMap(result => result.sources ?? []);
  const errors = sourceStatuses
    .filter(status => !status.ok)
    .map(status => ({ handle: status.key, error: status.reason || 'Source unavailable', tier: status.tier, source: status.label }));
  const fallbackResult = results.find(result => result.status === 'cached-fallback')
    || results.find(result => result.status === 'unavailable')
    || results.find(result => result.status?.startsWith?.('tier-'));
  const statuses = results.map(result => result.status).filter(Boolean);
  const status = statuses.includes('cached-fallback')
    ? 'cached-fallback'
    : statuses.includes('unavailable') && !items.length
      ? 'unavailable'
      : statuses.find(value => value === 'tier-3')
        || statuses.find(value => value === 'tier-2')
        || statuses.find(value => value === 'tier-1')
        || fallbackResult?.status
        || 'unavailable';

  return {
    items,
    errors,
    sourceStatuses,
    sources,
    status,
    freshness: results.every(result => result.freshness === 'cached') ? 'cached' : results.some(result => result.freshness === 'stale-cached') ? 'stale-cached' : 'live',
    fetchedAt: new Date().toISOString(),
    retrievedAt: results.map(result => result.retrievedAt).filter(Boolean).sort().at(-1) ?? null,
    ageSeconds: Math.max(...results.map(result => Number(result.ageSeconds) || 0), 0),
    reason: results.find(result => result.reason)?.reason || null,
  };
}

export function __resetFeedClientStateForTests() {
  _cache.clear();
  _inFlight.clear();
}
