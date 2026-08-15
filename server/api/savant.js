// api/savant.js — Vercel Serverless Function
// Fetches CSV from Baseball Savant and returns parsed JSON.
// Uses Node 20 native fetch (no require('https') needed).
//
// Available endpoints:
//   expected_statistics  → xBA, xSLG, xwOBA per batter
//   statcast_leaderboard → full Statcast leaderboard
//   bat-tracking         → bat speed, squared-up metrics
//   sprint_speed         → sprint speed leaderboard
//   oaa                  → outs above average (fielding)
//   pitch_arsenal        → per-pitch-type pitcher leaderboard (Roadmap #1) —
//                           one row per pitcher per pitch type: usage%,
//                           velocity, spin, break, whiff%/k%/put-away%, run
//                           value. URL/params confirmed against pybaseball's
//                           statcast_pitcher_arsenal_stats() (jldbc/pybaseball,
//                           statcast_pitcher.py), which hits this exact path —
//                           the codebase's other endpoints were verified the
//                           same indirect way (a live browser session, not
//                           available from this sandbox's network allowlist),
//                           so this follows the same standard. Exact column
//                           names in the returned CSV aren't 100% pinned down
//                           (Savant doesn't publish a schema and has renamed
//                           columns before) — see PitchShapePanel.jsx's `pick()`
//                           helper, which tries several plausible column-name
//                           variants per field rather than assuming one exact
//                           name and rendering blank if Savant's naming
//                           differs slightly from what's assumed here.
//   batting_stance        → Roadmap #3 (contact-location). URL corrected
//                           2026-08-07 after live verification — see below;
//                           read this before trusting it further.
//                           This sandbox still can't reach baseballsavant.mlb.com
//                           from bash (network allowlist), but a *different*
//                           tool available this session (web_fetch, not part
//                           of the sandboxed egress) reached the live site
//                           directly — first time any session working on
//                           this file has actually loaded the real page
//                           rather than inferring from a search snippet or a
//                           wrapper library's source.
//
//                           That fetch found the previous URL guess here —
//                           `/leaderboard/batting-stance?type=batter&...` —
//                           was wrong. The live nav's actual href for
//                           "Batting Stance & Intercept" is
//                           `/visuals/batting-stance`, a `visuals` path, not
//                           a `leaderboard` one — the only endpoint in this
//                           file that isn't. (There's also a *separate* real
//                           leaderboard, `/leaderboard/bat-tracking/
//                           swing-path-attack-angle`, whose May-2025
//                           changelog blurb claims it "also displays hitter
//                           intercept point and batting stance data" — but
//                           its own live glossary sidebar, fetched the same
//                           way, lists Attack Angle/Direction/Swing Path
//                           Tilt/etc. and nothing intercept-related, so that
//                           claim looks stale or imprecise. Went with the
//                           dedicated page instead of that one.)
//
//                           Confirmed by loading `/visuals/batting-stance`
//                           directly: the page is real, is described as
//                           averaging "Depth in Box"/"Distance off Plate"
//                           (stance) and "Intercept Point ... either
//                           relative to the front of home plate ... or to
//                           the batter's center of mass" (exactly the
//                           reference card's metric), and has its own
//                           working `Download CSV` link:
//                           `/visuals/batting-stance?csv=true` — no other
//                           query params visible on that link in the fetched
//                           page. That's what the URL below now uses.
//
//                           Still NOT confirmed: a year filter param. This
//                           page's UI has year dropdowns, but the plain
//                           `?csv=true` link captured doesn't show what
//                           param name a year selection would add — likely
//                           set client-side and not visible in a static
//                           fetch. So unlike every other endpoint here, this
//                           one has no `&year=${y}` in its URL; it's
//                           presumed to just return Savant's own default
//                           season. `battingStancePromise`'s season/season-1
//                           retry in mlb.js is therefore likely fetching the
//                           *same* response twice on a cold-season fallback
//                           — harmless (still resolves to real-or-honestly-
//                           empty either way) but worth knowing, not
//                           something to silently "fix" by guessing a param
//                           name. Column names inside the CSV are also still
//                           unconfirmed — see ContactPointPanel.jsx's `pick()`
//                           fallback list.
//
//                           2026-08-07, second independent check (different
//                           session, different web_fetch call): re-fetched
//                           `/visuals/batting-stance` directly and got the
//                           same result — real page, internal title "Batting
//                           Stance Leaderboard", same confirmed
//                           `?csv=true` Download-CSV link. One more data
//                           point worth recording: the page's own filter UI
//                           includes a "Qualified" minimum-swings dropdown
//                           (1/5/10/25/50/100/200/500/1000) alongside the
//                           year buttons — consistent with the "no year
//                           param on the plain CSV link" conclusion above
//                           (client-side-only filtering), not new
//                           information that changes anything, just a
//                           second live confirmation of the same URL from
//                           an independent source.
//   contact_points        → per-swing contact-point data, intended to close
//                           the gap `batting_stance` above explicitly left
//                           open (see ContactPointPanel.jsx's own "What
//                           this is NOT" note — same root cause named for
//                           #1's deferred velocity KDE: needs raw per-swing
//                           data, not a season-aggregate leaderboard).
//                           RE-VERIFIED 2026-08-09, resolving the open
//                           question a 2026-08-08 session correctly flagged
//                           rather than assumed away: that session checked
//                           pybaseball's statcast_batter() source directly
//                           and found no mention of "intercept" anywhere,
//                           and hedged the column names below to
//                           "unverified" instead of trusting the original
//                           claim. That check used the wrong primary
//                           source, not a wrong method — pybaseball
//                           genuinely doesn't hardcode expected column
//                           names (it requests `all=true` and returns
//                           whatever comes back), so it could never have
//                           confirmed or denied these fields either way.
//                           A second, independent, actively-maintained tool
//                           that scrapes this same endpoint — R's
//                           `baseballr` package (github.com/BillPetti/
//                           baseballr, R/sc_statcast_search.R, fetched
//                           directly and read in full, not taken from a
//                           search snippet) — settles it: `statcast_search()`
//                           assigns a 118-name `statcast_columns` vector
//                           onto the raw CSV response *positionally* (by
//                           column index, not by matching Savant's own
//                           header), and `intercept_ball_minus_batter_pos_
//                           x_inches` / `..._y_inches` are the literal last
//                           two names in that vector — documented in the
//                           function's own roxygen return-value table as
//                           "Horizontal offset of ball-bat intercept from
//                           batter position (inches)" / "Depth offset...".
//                           Its query-string construction also matches this
//                           file's below almost parameter-for-parameter,
//                           down to the same somewhat-unusual
//                           `player_event_sort=h_launch_speed` choice — not
//                           a coincidence two independent implementations
//                           would both land on if they weren't genuinely
//                           scraping the same real endpoint the same way.
//                           Positional assignment does mean baseballr is
//                           trusting Savant not to reorder its own export —
//                           a real, if small, ongoing assumption rather
//                           than a schema guarantee — but it's the same bet
//                           an actively-maintained package with hundreds of
//                           real users is already making, not a novel risk
//                           introduced here.
//                           CLOSED OUT 2026-08-09: that residual assumption
//                           no longer needs to be made at all. Fetched
//                           baseballsavant.mlb.com/csv-docs directly this
//                           same session — MLB's own official Statcast
//                           Search CSV field reference, live, not archived
//                           or summarized — and both fields are listed
//                           there by name, verbatim, as the final two
//                           entries on the page: `intercept_ball_minus_
//                           batter_pos_x_inches` ("Distance, in inches,
//                           between the intercept point of the bat/ball and
//                           the batter's center of mass, in the X
//                           [horizontal] direction") and the `_y_inches`
//                           counterpart (same wording, Y / mound-to-plate
//                           direction). This is the canonical source
//                           baseballr and the original 2026-08-07 comment
//                           were both, in their own ways, standing in for —
//                           now checked directly instead of inferred
//                           through an intermediary. Three independent
//                           things now agree: this official field list, an
//                           independently-maintained scraper library's
//                           source code, and the query-URL match — as
//                           settled as a claim like this gets without
//                           literally running the fetch against live data
//                           and reading the response headers by hand. If
//                           this is ever revisited, re-check the official
//                           docs page directly (it's a live page that can
//                           change) rather than re-deriving the answer from
//                           a wrapper library or reasoning about it from
//                           first principles. If it's ever wrong, this
//                           still fails safe: the client-side filter two
//                           lines below drops rows missing either field, so
//                           a column-name mismatch degrades to an honest
//                           empty state, not garbage on the chart. See
//                           ContactHeatmap.jsx's own header comment for the
//                           user-facing side of this same correction.
//
//                           Supersedes ContactPointPanel.jsx / the
//                           batting_stance fetch in loadFullPlayer() for
//                           the Contact Point panel specifically — real
//                           per-swing data strictly contains what a season
//                           average shows (you can see the center of the
//                           cloud) plus the spread the average alone
//                           can't. The batting_stance endpoint definition
//                           is left in place above rather than deleted:
//                           it's real, it's verified, and it may carry
//                           genuine stance-depth/box-position data no
//                           other endpoint here has, for a feature nobody's
//                           built yet — but nothing calls it anymore as of
//                           this change, so don't assume it's live-tested
//                           just because the definition still compiles.
//   pitcher_pitches       → the pitcher-side mirror of contact_points, added
//                           2026-08-08 to close the two gaps Roadmap #1 had
//                           carried since it was first built: a true
//                           per-pitch velocity distribution (real
//                           `release_speed` values, not a season-average
//                           bar) and a real LHH/RHH usage split (`stand`).
//                           Raw Statcast Search, same URL-confidence level
//                           as contact_points (checked against pybaseball's
//                           actual statcast_pitcher() source directly, not
//                           inferred) — see the ENDPOINTS entry below and
//                           PitchShapePanel.jsx's own header comment.
import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";
import { authorizeProviderFailureHook, failureInjectionResponse, isFailureInjectionRequested } from "./provider-failure-hook.js";

const ENDPOINTS = {
  expected_statistics: y =>
    `https://baseballsavant.mlb.com/leaderboard/expected_statistics?type=batter&year=${y}&position=&team=&min=1&csv=true`,
  statcast_leaderboard: y =>
    `https://baseballsavant.mlb.com/statcast_leaderboard?year=${y}&abs=0&player_type=batter&min_pa=1&csv=true`,
  "bat-tracking": y =>
    `https://baseballsavant.mlb.com/leaderboard/bat-tracking?attackZone=&batSide=&contactType=&count=&csv=true&handedness=&minSwings=1&minGroupSwings=1&pitchType=&seasonStart=${y}&seasonEnd=${y}&team=&type=batter`,
  sprint_speed: y =>
    `https://baseballsavant.mlb.com/sprint_speed_leaderboard?year=${y}&position=&team=&min=0&csv=true`,
  oaa: y =>
    `https://baseballsavant.mlb.com/leaderboard/outs_above_average?type=Batter&year=${y}&team=&range=year&min=1&pos=&roles=&viz=Show&csv=true`,
  pitch_arsenal: y =>
    `https://baseballsavant.mlb.com/leaderboard/pitch-arsenal-stats?type=pitcher&pitchType=&year=${y}&team=&min=1&csv=true`,
  // No `year=${y}` here — see the comment block above this object for why.
  // `y` is still accepted (mlb.js's season/season-1 retry calls this with
  // both) so that retry logic doesn't need special-casing for one endpoint;
  // it's just unused inside the URL itself.
  batting_stance: _y =>
    `https://baseballsavant.mlb.com/visuals/batting-stance?csv=true`,
  // Full calendar-year bound rather than trying to track the real season
  // window server-side — Savant just returns whatever games actually fall
  // in range, so an end date past "today" or before the season starts is
  // harmless, not an error. See the comment block above this object for
  // how this differs from — and resolves the blocker noted by —
  // `batting_stance` above.
  contact_points: (y, { playerId } = {}) =>
    `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfPT=&hfAB=&hfBBT=&hfPR=&hfZ=&stadium=&hfBBL=&hfNewZones=&hfGT=R%7CPO%7CS%7C=&hfSea=&hfSit=&player_type=batter&hfOuts=&opponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=${y}-03-01&game_date_lt=${y}-11-30&batters_lookup%5B%5D=${playerId}&team=&position=&hfRO=&home_road=&hfFlag=&metric_1=&hfInn=&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&player_event_sort=h_launch_speed&sort_order=desc&min_abs=0&type=details&`,
  // pitcher_pitches — the pitcher-side mirror of contact_points above.
  // Confirmed 2026-08-08 the same way contact_points was: checked
  // pybaseball's actual `statcast_pitcher()` source (jldbc/pybaseball,
  // statcast_pitcher.py) rather than guessing. It's a byte-for-byte match
  // to the batter URL above except `player_type=batter`→`player_type=
  // pitcher` and `batters_lookup%5B%5D=`→`pitchers_lookup%5B%5D=` — same
  // confidence level as contact_points had (URL confirmed against a real,
  // currently-live wrapper library's source, not inferred from a nav label
  // or a search snippet). Column names are the same raw per-pitch Statcast
  // Search schema contact_points already reads from (this app doesn't need
  // new column-name guesses for this one — `release_speed`, `stand`, and
  // `pitch_type` are all standard, long-stable Statcast field names, unlike
  // the newer bat-tracking/intercept-point fields elsewhere in this file
  // that needed independent verification).
  pitcher_pitches: (y, { playerId } = {}) =>
    `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfPT=&hfAB=&hfBBT=&hfPR=&hfZ=&stadium=&hfBBL=&hfNewZones=&hfGT=R%7CPO%7CS%7C=&hfSea=&hfSit=&player_type=pitcher&hfOuts=&opponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=${y}-03-01&game_date_lt=${y}-11-30&pitchers_lookup%5B%5D=${playerId}&team=&position=&hfRO=&home_road=&hfFlag=&metric_1=&hfInn=&min_pitches=0&min_results=0&group_by=name&sort_col=pitches&player_event_sort=h_launch_speed&sort_order=desc&min_abs=0&type=details&`,
  // Raw team-season batted-ball rows for a real exit-velocity distribution.
  // The client bins launch_speed locally; no proxy or seeded values are used.
  team_exit_velocity: (y, { team } = {}) =>
    `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfPT=&hfAB=&hfBBT=&hfPR=&hfZ=&stadium=&hfBBL=&hfNewZones=&hfGT=R%7CPO%7CS%7C=&hfSea=${y}%7C&hfSit=&player_type=batter&hfOuts=&opponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=${y}-03-01&game_date_lt=${y}-11-30&batters_lookup%5B%5D=&team=${encodeURIComponent(team || "")}&position=&hfRO=&home_road=&hfFlag=&metric_1=&hfInn=&min_pitches=0&min_results=0&group_by=name&sort_col=h_launch_speed&sort_order=desc&min_abs=0&type=details&`,
  team_batted_balls: (y, { team } = {}) =>
    `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfPT=&hfAB=&hfBBT=&hfPR=&hfZ=&stadium=&hfBBL=&hfNewZones=&hfGT=R%7CPO%7CS%7C=&hfSea=${y}%7C&hfSit=&player_type=batter&hfOuts=&opponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=${y}-03-01&game_date_lt=${y}-11-30&team=${encodeURIComponent(team || "")}&position=&hfRO=&home_road=&hfFlag=&metric_1=&hfInn=&min_pitches=0&min_results=0&group_by=name&sort_col=h_launch_speed&sort_order=desc&min_abs=0&type=details&`,
  team_batted_balls_against: (y, { team } = {}) =>
    `https://baseballsavant.mlb.com/statcast_search/csv?all=true&hfPT=&hfAB=&hfBBT=&hfPR=&hfZ=&stadium=&hfBBL=&hfNewZones=&hfGT=R%7CPO%7CS%7C=&hfSea=${y}%7C&hfSit=&player_type=pitcher&hfOuts=&opponent=&pitcher_throws=&batter_stands=&hfSA=&game_date_gt=${y}-03-01&game_date_lt=${y}-11-30&team=${encodeURIComponent(team || "")}&position=&hfRO=&home_road=&hfFlag=&metric_1=&hfInn=&min_pitches=0&min_results=0&group_by=name&sort_col=h_launch_speed&sort_order=desc&min_abs=0&type=details&`,
};

// Robust CSV parser — handles quoted fields and embedded commas
function parseCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function csvToJson(csvText) {
  const lines = csvText.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCSVLine(lines[0]).map(h =>
    h.replace(/^"|"$/g, "").replace(/^\uFEFF/, "")
  );
  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const obj = {};
    headers.forEach((h, i) => {
      const raw = (vals[i] ?? "").replace(/^"|"$/g, "");
      if (raw === "") {
        obj[h] = null;
        return;
      }
      const num = Number(raw);
      obj[h] = !Number.isNaN(num) ? num : raw;
    });
    return obj;
  });
}

// Follow up to 3 redirects using native fetch
async function fetchWithRedirects(url, maxRedirects = 3) {
  let current = url;
  for (let i = 0; i <= maxRedirects; i++) {
    const res = await fetch(current, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SKIPBaseball/1.0)",
        Accept: "text/csv,*/*",
        Referer: "https://baseballsavant.mlb.com/",
      },
      redirect: "manual",
    });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      if (!loc)
        throw new Error(`Redirect with no Location header from ${current}`);
      current = loc.startsWith("http") ? loc : new URL(loc, current).href;
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

// Savant is an overnight dataset for this application. Keep a successful
// response for one day and allow a week-old snapshot during upstream trouble.
const SAVANT_CACHE_TTL_MS = 24 * 60 * 60_000;
const SAVANT_STALE_TTL_MS = 7 * 24 * 60 * 60_000;

function nextUtcMidnightMs(now = Date.now()) {
  const next = new Date(now);
  next.setUTCHours(24, 0, 0, 0);
  return next.getTime();
}
const SAVANT_COOLDOWN_MS = 30_000;
const SAVANT_FAILURE_COOLDOWN_MS = 15_000;
const savantCache = new Map();
const savantInFlight = new Map();
let savantCooldownUntil = 0;
let savantFailureCooldownUntil = 0;

export function __resetSavantStateForTests() {
  savantCache.clear();
  savantInFlight.clear();
  savantCooldownUntil = 0;
  savantFailureCooldownUntil = 0;
}

function savantCacheKey(url) {
  return url;
}
function parseSavantRetryAfterMs(response) {
  const value = response?.headers?.get?.("Retry-After");
  const seconds = Number(value);
  if (Number.isFinite(seconds))
    return Math.max(1_000, Math.min(120_000, seconds * 1_000));
  return SAVANT_COOLDOWN_MS;
}
function staleSavant(entry) {
  return entry && entry.staleExpiresAt > Date.now() ? entry : null;
}

function serveStaleSavant(res, stale) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "public, s-maxage=60, stale-while-revalidate=300"
  );
  res.setHeader("X-Provider-Cache", "STALE");
  res.setHeader("X-Provider-Freshness", "stale-cached");
  return res.status(200).json(stale.data);
}

export async function warmSavantCache(year = '2026') {
  const endpoints = ['expected_statistics', 'statcast_leaderboard'];
  for (const endpoint of endpoints) {
    const response = {
      headers: {},
      status() { return response; },
      setHeader(name, value) { response.headers[name] = value; return response; },
      json(value) { response.body = value; return response; },
    };
    await handler({ method: 'GET', query: { endpoint, year }, headers: {}, socket: { remoteAddress: 'nightly-refresh' } }, response);
  }
}

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });

  const { endpoint, year, playerId, team } = req.query ?? {};
  const y = String(year || "2026");

  if (!endpoint || !ENDPOINTS[endpoint]) {
    return res.status(400).json({
      error: "Invalid endpoint",
      valid: Object.keys(ENDPOINTS),
      example: "/api/savant?endpoint=expected_statistics&year=2025",
    });
  }

  if (
    (endpoint === "contact_points" || endpoint === "pitcher_pitches") &&
    !/^\d+$/.test(String(playerId || ""))
  ) {
    return res
      .status(400)
      .json({ error: `${endpoint} requires a numeric playerId query param` });
  }

  if (
    endpoint === "team_exit_velocity" &&
    !/^[A-Za-z0-9]{2,5}$/.test(String(team || ""))
  ) {
    return res
      .status(400)
      .json({ error: "team_exit_velocity requires an MLB team abbreviation" });
  }
  if (
    ["team_batted_balls", "team_batted_balls_against"].includes(endpoint) &&
    !/^[A-Za-z]{2,3}$/.test(String(team || ""))
  ) {
    return res
      .status(400)
      .json({ error: `${endpoint} requires an MLB team abbreviation` });
  }

  if (isFailureInjectionRequested(req)) {
    const authorization = authorizeProviderFailureHook(req.headers);
    if (!authorization.allowed) {
      return res.status(403).json({ error: "Staging failure hook is not authorized" });
    }
    return failureInjectionResponse(res);
  }

  const url = ENDPOINTS[endpoint](y, { playerId, team });
  const key = savantCacheKey(url);
  const cached = savantCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );
    res.setHeader("X-Provider-Cache", "HIT");
    res.setHeader("X-Provider-Freshness", "cached");
    return res.status(200).json(cached.data);
  }
  const stale = staleSavant(cached);
  const existing = savantInFlight.get(key);
  if (existing) {
    try {
      const data = await existing;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=86400, stale-while-revalidate=604800"
      );
      res.setHeader("X-Provider-Cache", "COALESCED");
      res.setHeader("X-Provider-Freshness", "live");
      return res.status(200).json(data);
    } catch (error) {
      if (stale) return serveStaleSavant(res, stale);
      if (error?.retryAfter)
        res.setHeader("Retry-After", String(error.retryAfter));
      return res
        .status(error?.status || 502)
        .json(error?.payload || { error: "Savant request failed" });
    }
  }
  if (savantCooldownUntil > Date.now()) {
    if (stale) return serveStaleSavant(res, stale);
    const retryAfter = Math.ceil((savantCooldownUntil - Date.now()) / 1000);
    res.setHeader("Retry-After", String(retryAfter));
    return res
      .status(429)
      .json({
        error: "Baseball Savant rate limit cooldown active",
        retryAfter,
        url,
      });
  }
  if (savantFailureCooldownUntil > Date.now()) {
    if (stale) return serveStaleSavant(res, stale);
    const retryAfter = Math.ceil(
      (savantFailureCooldownUntil - Date.now()) / 1000
    );
    res.setHeader("Retry-After", String(retryAfter));
    return res
      .status(503)
      .json({
        error: "Baseball Savant temporary upstream cooldown active",
        retryAfter,
        url,
      });
  }
  if (isRateLimited(req, "savant")) return rateLimitResponse(res);

  const upstreamRequest = (async () => {
    const upstream = await fetchWithRedirects(url);
    if (!upstream.ok) {
      const retryAfter = parseSavantRetryAfterMs(upstream);
      if (upstream.status === 429)
        savantCooldownUntil = Math.max(
          savantCooldownUntil,
          Date.now() + retryAfter
        );
      throw {
        status: upstream.status,
        retryAfter: Math.ceil(retryAfter / 1000),
        payload: { error: `Savant returned ${upstream.status}`, url },
      };
    }
    const body = await upstream.text();
    const trimmed = body.trim();
    if (trimmed.startsWith("<!DOCTYPE") || trimmed.startsWith("<html")) {
      throw {
        status: 502,
        payload: {
          error:
            "Savant returned HTML — endpoint may be unavailable for this year",
          year: y,
          url,
        },
      };
    }
    let data = csvToJson(trimmed);
    if (endpoint === "contact_points") {
      data = data.filter(
        r =>
          r.intercept_ball_minus_batter_pos_x_inches != null &&
          r.intercept_ball_minus_batter_pos_y_inches != null
      );
    }
    if (endpoint === "team_exit_velocity") {
      data = data
        .filter(
          r => r.launch_speed != null && Number.isFinite(Number(r.launch_speed))
        )
        .map(r => ({
          launch_speed: Number(r.launch_speed),
          launch_angle: r.launch_angle == null ? null : Number(r.launch_angle),
          launch_speed_angle:
            r.launch_speed_angle == null ? null : Number(r.launch_speed_angle),
          bb_type: r.bb_type || null,
          events: r.events || null,
          game_date: r.game_date || null,
        }))
        .slice(0, 50000);
    }
    if (
      endpoint === "team_batted_balls" ||
      endpoint === "team_batted_balls_against"
    ) {
      data = data
        .filter(r => r.hc_x != null && r.hc_y != null)
        .map(r => ({
          hc_x: Number(r.hc_x),
          hc_y: Number(r.hc_y),
          bb_type: r.bb_type || null,
          launch_speed: r.launch_speed == null ? null : Number(r.launch_speed),
          launch_angle: r.launch_angle == null ? null : Number(r.launch_angle),
          launch_speed_angle:
            r.launch_speed_angle == null ? null : Number(r.launch_speed_angle),
          xwoba:
            r.estimated_woba_using_speedangle == null
              ? null
              : Number(r.estimated_woba_using_speedangle),
          events: r.events || null,
        }))
        .filter(r => Number.isFinite(r.hc_x) && Number.isFinite(r.hc_y))
        .slice(0, 50000);
    }
    if (endpoint === "pitcher_pitches") {
      data = data
        .filter(r => r.pitch_type != null)
        .map(r => ({
          pitch_type: r.pitch_type,
          release_speed: r.release_speed,
          stand: r.stand,
        }));
    }
    return data;
  })();
  savantInFlight.set(key, upstreamRequest);
  try {
    const data = await upstreamRequest;
    savantFailureCooldownUntil = 0;
    savantCache.set(key, {
      data,
      expiresAt: nextUtcMidnightMs(),
      staleExpiresAt: nextUtcMidnightMs() + SAVANT_STALE_TTL_MS,
    });
    if (savantCache.size > 300)
      savantCache.delete(savantCache.keys().next().value);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=86400, stale-while-revalidate=604800"
    );
    res.setHeader("X-Provider-Cache", "MISS");
    res.setHeader("X-Provider-Freshness", "live");
    return res.status(200).json(data);
  } catch (error) {
    const status = error?.status || 502;
    if (status >= 500)
      savantFailureCooldownUntil = Math.max(
        savantFailureCooldownUntil,
        Date.now() + SAVANT_FAILURE_COOLDOWN_MS
      );
    if (stale) return serveStaleSavant(res, stale);
    if (error?.retryAfter)
      res.setHeader("Retry-After", String(error.retryAfter));
    console.error(
      "[savant-proxy] error:",
      error?.payload?.error || error?.message || error
    );
    return res
      .status(error?.status || 502)
      .json(error?.payload || { error: "Savant request failed", url });
  } finally {
    if (savantInFlight.get(key) === upstreamRequest) savantInFlight.delete(key);
  }
}
