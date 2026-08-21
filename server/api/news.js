/**
 * Resilient news aggregation proxy.
 *
 * Tier order:
 *   MLB:    official MLB RSS -> ESPN MLB RSS -> FOX Sports MLB RSS
 *   NCAA:   NCAA Division I RSS -> ESPN college-baseball/news fallback -> FOX Sports MLB RSS
 *   Team:   official MLB club RSS -> official MLB league RSS -> ESPN MLB RSS
 *
 * A successful response is cached in the warm server instance. Expired data
 * remains eligible for stale-if-error fallback for a bounded window, so a
 * temporary 429, timeout, or malformed response never turns into fabricated
 * headlines or an empty screen when a verified snapshot exists.
 */

import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";

const FRESH_TTL_MS = 15 * 60_000;
const STALE_TTL_MS = 24 * 60 * 60_000;
const UNAVAILABLE_CACHE_MS = 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const MAX_ITEMS = 25;
const MAX_CACHE_ENTRIES = 100;

const MLB_OFFICIAL_RSS = "https://www.mlb.com/feeds/news/rss.xml";
const ESPN_MLB_RSS = "https://www.espn.com/espn/rss/mlb/news";
const FOX_MLB_RSS =
  "https://api.foxsports.com/v2/content/optimized-rss?partnerKey=MB0Wehpmuj2lUhuRhQaafhBjAJqaPU244mlTDK1i&size=30&tags=fs/mlb";
const NCAA_D1_RSS = "https://www.ncaa.com/news/baseball/d1/rss.xml";
const ESPN_COLLEGE_RSS = "https://www.espn.com/espn/rss/ncb/news";
const NITTER_HOSTS = [
  "https://nitter.privacydev.net",
  "https://nitter.poast.org",
  "https://nitter.net",
  "https://nitter.1d4.us",
];
const TEAM_FEED_SLUGS = Object.freeze({
  ARI: "dbacks", ATH: "athletics", ATL: "braves", BAL: "orioles", BOS: "redsox",
  CHC: "cubs", CIN: "reds", CLE: "guardians", COL: "rockies", CWS: "whitesox",
  DET: "tigers", HOU: "astros", KC: "royals", LAA: "angels", LAD: "dodgers",
  MIA: "marlins", MIL: "brewers", MIN: "twins", NYM: "mets", NYY: "yankees",
  OAK: "athletics", PHI: "phillies", PIT: "pirates", SD: "padres", SEA: "mariners",
  SF: "giants", STL: "cardinals", TB: "rays", TEX: "rangers", TOR: "bluejays", WSH: "nationals",
});

const cache = new Map();
const inFlight = new Map();

function source(tier, key, label, url, kind) {
  return { tier, key, label, url, kind };
}

function teamSlug(value) {
  const raw = String(value || "").trim();
  const abbr = raw.toUpperCase();
  if (TEAM_FEED_SLUGS[abbr]) return TEAM_FEED_SLUGS[abbr];
  const slug = raw
    .trim()
    .toLowerCase();
  return /^[a-z0-9-]{2,32}$/.test(slug) ? slug : null;
}

function sourcesFor(kind, team, handle = null) {
  if (handle) {
    return [
      ...NITTER_HOSTS.map((host, index) =>
        source(
          1,
          `nitter-${index + 1}`,
          `Nitter mirror ${index + 1}`,
          `${host}/${handle}/rss`,
          "social"
        )
      ),
      source(2, "espn-mlb", "ESPN MLB RSS", ESPN_MLB_RSS, "mlb"),
      source(3, "mlb-official", "MLB.com league feed", MLB_OFFICIAL_RSS, "mlb"),
    ];
  }
  if (team) {
    return [
      source(
        1,
        "mlb-team-official",
        `MLB.com ${team} club feed`,
        `https://www.mlb.com/${team}/feeds/news/rss.xml`,
        "team"
      ),
      source(2, "mlb-official", "MLB.com league feed", MLB_OFFICIAL_RSS, "mlb"),
      source(3, "espn-mlb", "ESPN MLB RSS", ESPN_MLB_RSS, "mlb"),
    ];
  }
  if (kind === "college") {
    return [
      source(
        1,
        "ncaa-d1-official",
        "NCAA Division I Baseball RSS",
        NCAA_D1_RSS,
        "college"
      ),
      source(
        2,
        "espn-college",
        "ESPN college sports RSS",
        ESPN_COLLEGE_RSS,
        "college"
      ),
      source(3, "fox-mlb", "FOX Sports MLB RSS", FOX_MLB_RSS, "college"),
    ];
  }
  return [
    source(1, "mlb-official", "MLB.com league feed", MLB_OFFICIAL_RSS, "mlb"),
    source(2, "espn-mlb", "ESPN MLB RSS", ESPN_MLB_RSS, "mlb"),
    source(3, "fox-mlb", "FOX Sports MLB RSS", FOX_MLB_RSS, "mlb"),
  ];
}

function stripHtml(value = "") {
  return String(value)
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s{3,}/g, "  ")
    .trim();
}

function tagValue(block, tags) {
  for (const tag of tags) {
    const pattern = new RegExp(
      `<${tag}[^>]*>(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([\\s\\S]*?))</${tag}>`,
      "i"
    );
    const match = pattern.exec(block);
    const value = match?.[1] ?? match?.[2];
    if (value) return value.trim();
  }
  return "";
}

function parseDate(value) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
}

function parseFeed(xml, feedSource, limit) {
  const blocks = [
    ...String(xml).matchAll(/<item\b[\s\S]*?<\/item>/gi),
    ...String(xml).matchAll(/<entry\b[\s\S]*?<\/entry>/gi),
  ].map(match => match[0]);

  const items = [];
  const seen = new Set();
  for (const block of blocks) {
    const title = stripHtml(tagValue(block, ["title"]));
    const rawLink = tagValue(block, ["link", "guid", "id"]);
    const linkMatch = rawLink.match(/https?:\/\/[^\s<]+/i);
    const url = linkMatch?.[0] || rawLink;
    const summary = stripHtml(
      tagValue(block, ["description", "summary", "content:encoded", "content"])
    );
    const text = summary && summary.length > title.length ? summary : title;
    if (!text || !url) continue;
    const id = `${feedSource.key}:${url}`;
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({
      id,
      handle: feedSource.key,
      sourceKey: feedSource.key,
      sourceLabel: feedSource.label,
      sourceTier: feedSource.tier,
      text,
      title: title || text,
      url,
      isoDate: parseDate(
        tagValue(block, ["pubDate", "dc:date", "published", "updated"])
      ),
    });
    if (items.length >= limit) break;
  }
  return items;
}

function cacheKey(kind, team, limit) {
  return `${kind}:${team || "league"}:${limit}`;
}

function ageSeconds(retrievedAt) {
  return Math.max(0, Math.round((Date.now() - retrievedAt) / 1000));
}

function cachePayload(entry, status, reason = null) {
  return {
    handle: entry.handle || entry.kind,
    items: entry.items,
    fetchedAt: new Date(entry.retrievedAt).toISOString(),
    retrievedAt: entry.retrievedAt,
    ageSeconds: ageSeconds(entry.retrievedAt),
    status,
    freshness: status === "cached-fallback" ? "stale-cached" : status === "unavailable" ? "unavailable" : "cached",
    tier: entry.tier,
    source: entry.source,
    sourceUrl: entry.sourceUrl,
    sources: entry.sources,
    sourceStatuses: entry.sourceStatuses,
    reason,
  };
}

function setCache(key, entry) {
  cache.set(key, entry);
  if (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
}

function retryAfterMs(response) {
  const value = response?.headers?.get?.("Retry-After");
  const seconds = Number(value);
  return Number.isFinite(seconds)
    ? Math.max(0, Math.min(60_000, seconds * 1000))
    : 0;
}

async function readSource(feedSource, limit) {
  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(feedSource.url, {
      headers: {
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9",
        "User-Agent": "SKIP-Baseball/1.0 (news aggregator; source-linked)",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    return {
      ok: false,
      source: feedSource,
      reason: error?.name === "TimeoutError" ? "timeout" : "network-error",
      durationMs: Date.now() - startedAt,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      source: feedSource,
      statusCode: response.status,
      retryAfterMs: retryAfterMs(response),
      reason:
        response.status === 429 ? "rate-limited" : `http-${response.status}`,
      durationMs: Date.now() - startedAt,
    };
  }

  let xml;
  try {
    xml = await response.text();
  } catch {
    return {
      ok: false,
      source: feedSource,
      reason: "body-read-failed",
      durationMs: Date.now() - startedAt,
    };
  }

  const items = parseFeed(xml, feedSource, limit);
  if (!items.length) {
    return {
      ok: false,
      source: feedSource,
      reason: "empty-or-unparseable",
      durationMs: Date.now() - startedAt,
    };
  }

  return {
    ok: true,
    source: feedSource,
    items,
    durationMs: Date.now() - startedAt,
  };
}

function attemptMeta(result) {
  return {
    tier: result.source.tier,
    key: result.source.key,
    label: result.source.label,
    url: result.source.url,
    ok: result.ok,
    statusCode: result.statusCode ?? 200,
    reason: result.reason ?? null,
    durationMs: result.durationMs,
  };
}

function completeSourceStatuses(configuredSources, attempts) {
  return configuredSources.map(
    feedSource =>
      attempts.find(attempt => attempt.key === feedSource.key) || {
        tier: feedSource.tier,
        key: feedSource.key,
        label: feedSource.label,
        url: feedSource.url,
        ok: null,
        statusCode: null,
        reason: "standby",
        durationMs: 0,
      }
  );
}

export function __resetNewsStateForTests() {
  cache.clear();
  inFlight.clear();
}

export function __newsSourcesForTests(kind = "mlb", team = null) {
  return sourcesFor(kind, team);
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  if (isRateLimited(req, "news")) return rateLimitResponse(res);

  const url = new URL(req.url, "https://skipbaseball.invalid");
  const kind = url.searchParams.get("kind") === "college" ? "college" : "mlb";
  const rawTeam = url.searchParams.get("team");
  const team = teamSlug(rawTeam);
  const rawHandle = url.searchParams.get("handle");
  if (rawTeam && !team)
    return res.status(400).json({ error: "Invalid team slug", items: [] });
  if (rawHandle && !/^[A-Za-z0-9_]{1,50}$/.test(rawHandle))
    return res.status(400).json({ error: "Invalid handle", items: [] });
  const handle = rawHandle || null;
  const limit = Math.min(
    MAX_ITEMS,
    Math.max(1, Number.parseInt(url.searchParams.get("n") || "12", 10) || 12)
  );
  const key = cacheKey(
    handle ? `handle:${handle}` : team ? "team" : kind,
    team || handle,
    limit
  );
  const now = Date.now();
  const hit = cache.get(key);

  if (hit && hit.freshUntil > now) {
    const unavailable = Boolean(hit.unavailable);
    res.setHeader(
      "Cache-Control",
      unavailable ? "no-store" : "public, s-maxage=900, stale-while-revalidate=3600"
    );
    res.setHeader("X-News-Cache", unavailable ? "NEGATIVE" : "HIT");
    return res.status(200).json(cachePayload(hit, unavailable ? "unavailable" : "cached", unavailable ? "all-sources-unavailable-cooldown" : null));
  }

  const pending = inFlight.get(key);
  if (pending) return pending.then(payload => res.status(200).json(payload));

  const request = (async () => {
    const attempts = [];
    let successful = null;
    const configuredSources = sourcesFor(kind, team, handle);
    for (const feedSource of configuredSources) {
      const result = await readSource(feedSource, limit);
      attempts.push(attemptMeta(result));
      if (result.ok) {
        successful = result;
        break;
      }
    }

    const sourceStatuses = completeSourceStatuses(configuredSources, attempts);

    if (successful) {
      const retrievedAt = Date.now();
      const entry = {
        kind: handle ? `handle:${handle}` : team ? "team" : kind,
        team,
        handle,
        items: successful.items,
        retrievedAt,
        freshUntil: retrievedAt + FRESH_TTL_MS,
        staleUntil: retrievedAt + STALE_TTL_MS,
        tier: successful.source.tier,
        source: successful.source.label,
        sourceUrl: successful.source.url,
        sources: configuredSources,
        sourceStatuses,
      };
      setCache(key, entry);
      return {
        handle: entry.handle || entry.kind,
        items: entry.items,
        fetchedAt: new Date(retrievedAt).toISOString(),
        retrievedAt,
        ageSeconds: 0,
        status:
          entry.tier === 1 ? "tier-1" : entry.tier === 2 ? "tier-2" : "tier-3",
        freshness: "live",
        tier: entry.tier,
        source: entry.source,
        sourceUrl: entry.sourceUrl,
        sourceStatuses,
        sources: configuredSources,
        attempts,
      };
    }

    if (hit && hit.staleUntil > now) {
      return {
        ...cachePayload(
          hit,
          "cached-fallback",
          attempts.at(-1)?.reason || "all-sources-unavailable"
        ),
        sourceStatuses,
        sources: configuredSources,
        attempts,
      };
    }

    // A short, explicit negative cache prevents every panel remount from
    // fanning out to all providers during an outage. It never fabricates
    // headlines, never replaces a stale verified snapshot, and remains
    // transparent to the client through `unavailable` + X-News-Cache.
    const retrievedAt = Date.now();
    const unavailableEntry = {
      kind: handle ? `handle:${handle}` : team ? "team" : kind,
      team,
      handle,
      items: [],
      retrievedAt,
      freshUntil: retrievedAt + UNAVAILABLE_CACHE_MS,
      staleUntil: retrievedAt + UNAVAILABLE_CACHE_MS,
      tier: null,
      source: null,
      sourceUrl: null,
      sources: configuredSources,
      sourceStatuses,
      unavailable: true,
    };
    setCache(key, unavailableEntry);
    return {
      ...cachePayload(unavailableEntry, "unavailable", "all-sources-unavailable"),
      attempts,
      error: "All configured news sources are unavailable",
    };
  })();

  inFlight.set(key, request);
  try {
    const payload = await request;
    res.setHeader(
      "Cache-Control",
      payload.status === "unavailable"
        ? "no-store"
        : "public, s-maxage=900, stale-while-revalidate=3600"
    );
    res.setHeader(
      "X-News-Cache",
      payload.status === "cached-fallback"
        ? "STALE"
        : payload.status === "unavailable"
          ? "MISS"
          : "MISS"
    );
    return res.status(200).json(payload);
  } finally {
    inFlight.delete(key);
  }
}
