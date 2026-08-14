/**
 * /api/feed.js  —  Vercel Serverless: public RSS feeds via Nitter
 *
 * Nitter is an open-source Twitter/X frontend that exposes public RSS
 * for any account at  https://<host>/<handle>/rss  with no auth required.
 * We proxy here to:
 *   1. Avoid browser CORS blocks
 *   2. Cache on Vercel's CDN edge (5-min TTL, 2-min stale-while-revalidate)
 *   3. Parse XML → JSON once server-side, not in every client
 *   4. Try multiple nitter instances so a down host doesn't break the feed
 *
 * GET /api/feed?handle=JonHeyman        → up to 10 items (default)
 * GET /api/feed?handle=JonHeyman&n=20   → up to 20 items (max 25)
 *
 * Response: { handle, items: [{id, handle, text, url, isoDate}], fetchedAt }
 * On failure: { handle, items: [], error, detail }  (always 200 so client
 * can display partial results from other accounts in a multi-fetch)
 */

// Public nitter instances — most reliable first. Short list keeps latency down.
const NITTER_HOSTS = [
  'https://nitter.privacydev.net',
  'https://nitter.poast.org',
  'https://nitter.net',
  'https://nitter.1d4.us',
];

import { applyCors, isRateLimited, rateLimitResponse } from './_shared.js';

const CACHE_TTL_S  = 5 * 60;
const CACHE_SWR_S  = 2 * 60;
const FETCH_MS     = 7_000;

function stripHtml(html = '') {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{3,}/g, '  ')
    .trim();
}

function parseRss(xml, handle) {
  const items = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRe.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      // Match CDATA or plain text variants
      const re = new RegExp(
        `<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>` +
        `|<${tag}[^>]*>([^<]*)</${tag}>`
      );
      const m = re.exec(block);
      return m ? (m[1] ?? m[2] ?? '').trim() : '';
    };
    const title   = stripHtml(get('title'));
    const link    = get('link') || get('guid');
    const pubDate = get('pubDate');
    const desc    = stripHtml(get('description'));
    // Description usually has the full tweet; title is truncated. Prefer desc
    // when it's actually longer.
    const text = desc.length > title.length ? desc : title;
    if (!text || !link) continue;
    const isoDate = pubDate ? new Date(pubDate).toISOString() : null;
    // Stable id: last path segment of the tweet URL (the numeric tweet id)
    const id = link.split('/').filter(Boolean).pop() || `${Date.now()}_${items.length}`;
    items.push({ id, handle, text, url: link, isoDate });
  }
  return items;
}

async function tryFetch(handle, host) {
  const res = await fetch(`${host}/${handle}/rss`, {
    headers: { 'User-Agent': 'SKIP-Baseball/1.0 (RSS aggregator; contact via project repo)' },
    signal:  AbortSignal.timeout(FETCH_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${host}`);
  const xml = await res.text();
  if (!xml.includes('<channel>')) throw new Error(`Non-RSS response from ${host}`);
  return xml;
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (isRateLimited(req, 'feed')) return rateLimitResponse(res);

  const { handle, n = '10' } = req.query ?? {};
  if (!handle || !/^[A-Za-z0-9_]{1,50}$/.test(handle)) {
    return res.status(400).json({ error: 'Missing or invalid handle', items: [] });
  }

  const limit = Math.min(25, Math.max(1, parseInt(n, 10) || 10));

  let xml = null;
  let lastErr = null;
  for (const host of NITTER_HOSTS) {
    try { xml = await tryFetch(handle, host); break; }
    catch (e) { lastErr = e; }
  }

  const fetchedAt = new Date().toISOString();

  if (!xml) {
    // All hosts failed — return empty so the client can render other accounts
    return res.status(200).json({
      handle, items: [], fetchedAt,
      error: 'Feed unavailable', detail: lastErr?.message,
    });
  }

  const items = parseRss(xml, handle).slice(0, limit);
  res.setHeader(
    'Cache-Control',
    `public, s-maxage=${CACHE_TTL_S}, stale-while-revalidate=${CACHE_SWR_S}`
  );
  return res.status(200).json({ handle, items, fetchedAt });
}
