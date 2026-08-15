# Verified News Feed Sources

Research captured 2026-08-14.

| Source | Verified URL | Notes |
|---|---|---|
| MLB official league RSS | https://www.mlb.com/feeds/news/rss.xml | HTTP 200, `text/xml`; official league headlines. |
| MLB official Red Sox RSS | https://www.mlb.com/redsox/feeds/news/rss.xml | HTTP 200, `text/xml`; club pattern is `https://www.mlb.com/{team-slug}/feeds/news/rss.xml`. |
| MLB official Astros RSS | https://www.mlb.com/astros/feeds/news/rss.xml | HTTP 200, `text/xml`; confirms team-level pattern. |
| ESPN MLB RSS | https://www.espn.com/espn/rss/mlb/news | Official ESPN MLB headlines. ESPN terms require displaying only feed content, linking to the supplied ESPN URL, attributing ESPN, and not modifying feed content or placing advertising within ESPN RSS content. |
| NCAA DI Baseball RSS | https://www.ncaa.com/news/baseball/d1/rss.xml | Listed on NCAA.com's official RSS directory. NCAA also lists DII and DIII baseball variants. |
| FOX Sports MLB RSS | https://api.foxsports.com/v2/content/optimized-rss?partnerKey=MB0Wehpmuj2lUhuRhQaafhBjAJqaPU244mlTDK1i&size=30&tags=fs/mlb | Listed on FOX Sports' official RSS page. Attribution is required; page states free for individual/non-profit non-commercial use. |

The MLB Stats API path `https://statsapi.mlb.com/api/v1/teams/119/content` was tested and returned HTTP 404, so it should not be used as the Tier 2 news endpoint without further verification. The current implementation uses official MLB RSS team/league feeds, ESPN, FOX Sports, and NCAA RSS instead.

References:
- https://www.mlb.com/news
- https://www.mlb.com/redsox/
- https://www.ncaa.com/rss
- https://www.espn.com/espn/news/story?page=rssinfo
- https://www.espn.com/espn/rss/mlb/news
- https://www.foxsports.com/rss-feeds
