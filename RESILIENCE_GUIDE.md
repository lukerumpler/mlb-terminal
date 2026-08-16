# SKIP Resilience and Data-Source Configuration Guide

**Project:** SKIP Baseball Intelligence Terminal  
**Audience:** Developers deploying the dashboard through Vercel or the Manus-managed preview  
**Purpose:** Keep baseball intelligence useful during upstream timeouts, rate limits, malformed feeds, and unofficial-mirror outages without presenting invented or silently substituted data.

> **Core rule:** A failed source may be replaced only by a clearly identified fallback or a verified cached snapshot. It must never be replaced by a fabricated zero, guessed value, or unlabeled prior-season number.

## 1. What is implemented

The current implementation has two server entrypoints that share one handler. `server/api/news.js` contains the parser, source waterfall, cache, in-flight request coalescing, and response metadata. `api/news.js` is the direct Vercel entrypoint and re-exports the same handler. The Manus Express route registers the same implementation at `/api/news`.

The response uses these source states:

| State             | Meaning                                                                             | UI treatment                                     |
| ----------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------ |
| `tier-1`          | The first configured provider returned parseable, non-empty data.                   | Green/teal Tier 1 badge.                         |
| `tier-2`          | Tier 1 failed and the second provider returned data.                                | Blue Tier 2 badge plus a source-failure notice.  |
| `tier-3`          | The first two providers failed and the secondary publisher returned data.           | Amber Tier 3 badge plus a source-failure notice. |
| `cached`          | A warm verified response is being reused inside its freshness window.               | Neutral Cached badge with age.                   |
| `cached-fallback` | All live providers failed, but a verified snapshot remains inside its stale window. | Amber Stale Fallback badge with age and reason.  |
| `unavailable`     | No provider succeeded and no verified snapshot is available.                        | Unavailable badge and an empty state.            |

Every response also contains `source`, `sourceUrl`, `tier`, `retrievedAt`, `ageSeconds`, `sourceStatuses`, and `attempts`. The UI can therefore explain what happened instead of displaying a generic failure.

## 2. Feed order

The feed order depends on the requested view.

| Request                      | Tier 1                       | Tier 2                  | Tier 3                                                 |
| ---------------------------- | ---------------------------- | ----------------------- | ------------------------------------------------------ |
| `/api/news?kind=mlb`         | MLB official league RSS      | ESPN MLB RSS            | FOX Sports MLB RSS                                     |
| `/api/news?team=redsox`      | Official MLB club RSS        | MLB official league RSS | ESPN MLB RSS                                           |
| `/api/news?kind=college`     | NCAA Division I Baseball RSS | ESPN college RSS        | FOX Sports MLB RSS as a last-resort baseball publisher |
| `/api/news?handle=JonHeyman` | Configured Nitter mirrors    | ESPN MLB RSS            | MLB official league RSS                                |

For a handle request, Nitter remains an optional social-post source. It is not required for the Intel Feed to work. If all Nitter mirrors fail, the verified ESPN MLB feed provides league headlines. The new grouped Intel Feed page uses official league and college chains rather than depending on Nitter.

The official ESPN MLB endpoint is:

```text
https://www.espn.com/espn/rss/mlb/news
```

ESPN's feed terms require the application to display only the supplied feed content, link to the full ESPN article using the supplied URL, identify ESPN as the provider, avoid modifying the supplied headline/summary/URL, and avoid placing advertising inside ESPN RSS content [2].

Official MLB club RSS links follow this verified pattern:

```text
https://www.mlb.com/{team-slug}/feeds/news/rss.xml
```

For example, the Red Sox and Astros feeds returned XML successfully during verification:

```text
https://www.mlb.com/redsox/feeds/news/rss.xml
https://www.mlb.com/astros/feeds/news/rss.xml
```

The official league feed is:

```text
https://www.mlb.com/feeds/news/rss.xml
```

The previously suggested Stats API path `/api/v1/teams/{id}/content` returned HTTP 404 during verification, so it is **not** used as the current news fallback. This is intentional: an unverified endpoint is less trustworthy than an explicit unavailable state.

## 3. XML parsing in `server/api/news.js`

The route uses a small dependency-free parser because RSS and Atom feeds are simple XML documents and the deployment does not need a full XML DOM for this bounded response. It accepts both RSS `<item>` blocks and Atom `<entry>` blocks, reads CDATA or ordinary text, strips HTML from summaries, extracts the first absolute URL, and normalizes publication dates to ISO timestamps.

The important parser contract is:

```js
function parseFeed(xml, feedSource, limit) {
  const blocks = [
    ...String(xml).matchAll(/<item\\b[\\s\\S]*?<\\/item>/gi),
    ...String(xml).matchAll(/<entry\\b[\\s\\S]*?<\\/entry>/gi),
  ].map(match => match[0]);

  return blocks.slice(0, limit).flatMap(block => {
    const title = stripHtml(tagValue(block, ['title']));
    const rawLink = tagValue(block, ['link', 'guid', 'id']);
    const url = rawLink.match(/https?:\\/\\/[^\\s<]+/i)?.[0] || rawLink;
    const summary = stripHtml(tagValue(block, [
      'description', 'summary', 'content:encoded', 'content',
    ]));
    const text = summary && summary.length > title.length ? summary : title;
    if (!text || !url) return [];

    return [{
      id: `${feedSource.key}:${url}`,
      sourceKey: feedSource.key,
      sourceLabel: feedSource.label,
      sourceTier: feedSource.tier,
      title: title || text,
      text,
      url,
      isoDate: parseDate(tagValue(block, [
        'pubDate', 'dc:date', 'published', 'updated',
      ])),
    }];
  });
}
```

The route rejects an HTTP error, timeout, empty body, or unparseable feed as a source failure. It then tries the next source. A successful feed is cached for 15 minutes and remains eligible for stale-if-error fallback for 24 hours. Identical concurrent requests share one in-flight promise, which prevents a client burst from making several identical upstream requests.

## 4. Serverless cache and fallback behavior

The relevant route behavior is equivalent to the following simplified flow:

```js
const fresh = cache.get(key);
if (fresh && fresh.freshUntil > Date.now()) {
  return json(cachePayload(fresh, "cached"));
}

const sources = sourcesFor(kind, team, handle);
for (const provider of sources) {
  const result = await readSource(provider, limit);
  attempts.push(attemptMeta(result));
  if (result.ok) {
    const entry = {
      items: result.items,
      retrievedAt: Date.now(),
      freshUntil: Date.now() + 15 * 60_000,
      staleUntil: Date.now() + 24 * 60 * 60_000,
      tier: provider.tier,
      source: provider.label,
      sourceUrl: provider.url,
      sourceStatuses: completeSourceStatuses(sources, attempts),
    };
    cache.set(key, entry);
    return json({
      ...entry,
      status: `tier-${provider.tier}`,
      freshness: "live",
    });
  }
}

if (fresh && fresh.staleUntil > Date.now()) {
  return json({
    ...cachePayload(fresh, "cached-fallback"),
    reason: "all-sources-unavailable",
  });
}

return json({
  items: [],
  status: "unavailable",
  freshness: "unavailable",
  sourceStatuses: completeSourceStatuses(sources, attempts),
});
```

The in-memory cache is a warm-instance optimization, not a durable database. Vercel may create multiple instances or discard a warm instance. If a longer outage guarantee is needed, store the same payload and provenance metadata in a shared store such as Vercel KV or Upstash Redis. The UI contract does not change.

## 5. Vercel environment variables and CORS protection

The only required security variable for the API allowlist is `ALLOWED_ORIGIN`. It is not a secret; it is an allowlist of browser origins that are permitted to read cross-origin API responses. Use a comma-separated list with no trailing slash:

```text
ALLOWED_ORIGIN=https://skip.example.com,https://www.skip.example.com
```

For a Vercel deployment, configure it in the Vercel dashboard under **Project Settings → Environment Variables**, or with the CLI:

```bash
vercel env add ALLOWED_ORIGIN production
# Enter: https://skip.example.com,https://www.skip.example.com

vercel env add ALLOWED_ORIGIN preview
# Enter the preview domain(s) that need browser access

vercel env add ALLOWED_ORIGIN development
# Enter: http://localhost:3000
```

The current `vercel.json` also bounds the direct news function:

```json
{
  "functions": {
    "api/news.js": {
      "maxDuration": 15
    }
  }
}
```

The shared CORS helper follows these rules:

| Environment                                | Origin behavior                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| Local development with no `ALLOWED_ORIGIN` | `*` is retained for convenience.                                                                |
| Production with an allowlist               | Only an exact normalized origin is reflected. `Vary: Origin` is set.                            |
| Production with no allowlist               | No cross-origin access header is returned. Same-origin requests still work.                     |
| Any request with an untrusted `Origin`     | `Access-Control-Allow-Origin` is omitted, so a browser cannot expose the response to that site. |

CORS is not authentication. It only controls browser read access. Keep the per-IP rate limiter, validate all query parameters, bound request timeouts, and use a shared rate-limit store if the Vercel deployment grows beyond a single warm instance. Never place provider credentials in `VITE_*` variables or client code.

If a public FOX Sports RSS URL is used, treat its partner URL as server-side configuration. An optional override can be added as `FOX_SPORTS_RSS_URL`; it should never be exposed to the browser as an environment variable.

## 6. React source-state badges

The shared component is `client/src/components/StatusBadge.jsx`. Its normalized states include the existing semantic statuses plus the news-specific states:

```js
normalizeStatus("tier-1"); // 'tier-1'
normalizeStatus("tier-2"); // 'tier-2'
normalizeStatus("tier-3"); // 'tier-3'
normalizeStatus("cached-fallback"); // 'cached-fallback'
normalizeStatus("unavailable"); // 'unavailable'
```

The Intel Feed header uses the overall route state:

```jsx
<StatusBadge status={feedStatus} compact />
```

The source-chain sidebar always shows the configured tier badge and separately shows whether that source was selected, failed, or remained on standby:

```jsx
{
  sourceStatuses.map(source => (
    <div key={`${source.key}:${source.tier}`}>
      <StatusBadge status={`tier-${source.tier}`} compact />
      <span>
        {source.ok === true
          ? "Selected"
          : source.ok === false
            ? source.reason || "Unavailable"
            : "Standby"}
      </span>
    </div>
  ));
}
```

This separation is important. A Tier 1 source that was not needed is still a Tier 1 source; it should not be mislabeled as “Unavailable.” The provider attempt status explains what happened, while the tier badge explains where that provider sits in the fallback chain.

A headline carries its own tier badge as well:

```jsx
{
  item.sourceTier && <StatusBadge status={`tier-${item.sourceTier}`} compact />;
}
```

The client helper in `client/src/api/feed.js` preserves `status`, `freshness`, `retrievedAt`, `ageSeconds`, `sourceStatuses`, and `sources`. It also keeps the older `fetchFeed(handle)` API compatible by sending handle requests to `/api/news?handle=...`, which exercises the Nitter-to-ESPN path.

## 7. Failure-injection test script

The regression file `server/api/news.test.ts` simulates the exact failure sequence requested:

1. All four Nitter mirrors return HTTP 503.
2. ESPN returns valid RSS XML.
3. The handler returns `status: "tier-2"`, identifies ESPN, parses the headline, and records the failed Nitter attempts.
4. A warm second request does not call the upstream again.
5. After the fresh window expires, all live sources return HTTP 429 and the handler returns the prior verified snapshot as `cached-fallback`.

Run it with:

```bash
pnpm exec vitest run server/api/news.test.ts --reporter=verbose
```

Run the related security and UI regressions with:

```bash
pnpm exec vitest run \
  server/api/news.test.ts \
  server/api/shared.test.ts \
  server/api/routes.test.ts \
  test/status-badge.test.jsx \
  test/feed-page-race-condition.test.jsx
```

The tests use a stubbed `fetch` implementation and never call live providers. This keeps them deterministic and avoids consuming upstream quota.

## 8. Deployment checklist

Before deployment, run `pnpm run check`, `pnpm test`, and `pnpm run build`. Confirm that `ALLOWED_ORIGIN` is configured for production and preview. Open `/api/news?kind=mlb&n=3` from the deployed domain and confirm that the JSON includes `status`, `source`, `retrievedAt`, and `sourceStatuses`. Then open the Intel Feed page and confirm that the header and source chain show a tier badge or an honest unavailable state.

Do not mark a source as live solely because the HTTP status was 200. The handler requires parseable, non-empty items. Do not turn a stale fallback into a live label. Do not delete the source URL or retrieval timestamp when normalizing the response.

## 9. Attached data-gaps specification: current implementation boundary

The attached specification is now partly implemented and partly intentionally labeled as a source gap:

| Area                           | Current SKIP implementation                                                                                                                                                                                                                | Transparency rule                                                                                                                |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| FanGraphs Team WAR             | `server/api/fangraphs-models.js?mode=aggregate` fetches batting and pitching leaderboard tables, matches `Team` and `WAR` by header text, and computes total WAR only when both sides are present.                                         | Missing or partial FanGraphs rows remain missing; no zero is substituted.                                                        |
| Savant team batted balls       | `server/api/savant.js` supports `team_batted_balls` and `team_batted_balls_against`, trims verified coordinates, batted-ball type, EV, launch angle, barrel classification, xwOBA, and events, and uses stale-if-error caching.            | Overview spray, xwOBA, EV, and contact-quality panels identify Baseball Savant and show unavailable states when rows are absent. |
| Team spray chart               | Overview plots raw `hc_x`/`hc_y` points from the verified Savant team query and labels them as raw Savant coordinates rather than estimated locations.                                                                                     | Do not present a coordinate transform as an official field position without further calibration.                                 |
| Home/Away and Day/Night splits | MLB Stats API schedule rows are aggregated client-side into verified W–L splits.                                                                                                                                                           | OPS and ERA remain `—` because they require per-game boxscore aggregation not present in the schedule-only response.             |
| Playoff odds                   | FanGraphs playoff odds remain unavailable when the FanGraphs model page cannot be parsed. SKIP's deterministic Monte Carlo estimate is shown only as `SKIP estimate`, never as FanGraphs.                                                  | Never relabel the SKIP estimate as an external projection.                                                                       |
| Weather                        | Completed/live game weather uses MLB Stats API game-feed observations through `getGameFeedMetadata`.                                                                                                                                       | Observed weather is not presented as a forecast; missing weather is labeled unavailable.                                         |
| Ballpark metadata              | `getTeamVenueMetadata()` uses MLB Stats API team and venue endpoints with `hydrate=location,fieldInfo`, caching successful snapshots for 24 hours. Overview displays venue name, capacity, surface, roof, coordinates, and wall distances. | Altitude, wall height, orientation, and park factors are not shown without a verified source.                                    |

Weather forecasts for upcoming games may use Open-Meteo only after the venue coordinates are available, with attribution and the documented non-commercial-use constraint. No change should be made to `ROADMAP_REFERENCE_FEATURES.md`.

## References

[1]: https://www.ncaa.com/rss "NCAA.com RSS directory"
[2]: https://www.espn.com/espn/news/story?page=rssinfo "ESPN.com News Feeds FAQ"
[3]: https://www.espn.com/espn/rss/mlb/news "ESPN MLB RSS feed"
[4]: https://www.mlb.com/news "MLB.com official news"
[5]: https://www.mlb.com/redsox/ "Official Boston Red Sox site and RSS discovery"
[6]: https://www.foxsports.com/rss-feeds "FOX Sports RSS feeds"
[7]: https://www.open-meteo.com/en/terms "Open-Meteo terms"
