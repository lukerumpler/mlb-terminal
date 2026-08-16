# SKIP — Reference-Inspired Feature Backlog

**Purpose:** On 2026-08-05, the user shared 14 reference screenshots (Freylitics,
TJStats, PastTheEyeTest/Savant-style boards, a Brewers-style front-office radar
card set, and a live pitch-charting UI) and asked what could be added to SKIP.
This doc is the resulting gap analysis + backlog, written so **any agent**
(Claude, another LLM, or a human) picking up this repo cold can understand
what's proposed, what already exists, and where to start — without re-deriving
the analysis from scratch.

**How to use this doc:** Pick an item, flip its checkbox to `[~]` when you
start, `[x]` when done, and add a dated line to the **Progress Log** at the
bottom describing what changed and which files you touched. Don't delete
finished items — leave them checked so the history stays intact. If you
discover an item is already partially built, correct the "Current state"
note rather than silently re-implementing it.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## 0. Baseline — what SKIP already has (don't rebuild these)

Confirmed present in the codebase as of this writing, so no item below should
duplicate them:

- Percentile bars + 6-axis "Geometry Radar" per player (`PlayersPage.jsx`)
- Exit Velocity distribution chart, Spray Chart (hitters only)
- `ScatterBuilder` component — build-your-own X/Y scatter, color = position
- eFV (Future Value) engine (`engine/skip.js` → `computeFV`), eFV Movers panel
- Farm System Depth (simple prospect-count-per-org), Risers & Fallers view
- Trade Value Simulator — **currently a single hardcoded hypothetical trade**,
  not a real analyzer (Holliday/Cole example in `OtherPages.jsx`)
- AMD/IMD proprietary swing/command grade, with its own radar + scatter
- Scouting Notes (freeform + 20-80 structured reports, localStorage only)
- `api/savant.js` — CSV proxy for Baseball Savant, but **batter-side leaderboards
  only** (expected_statistics, statcast_leaderboard, bat-tracking, sprint_speed, oaa).
  No pitch-arsenal / pitch-movement endpoint yet.

---

## 1. Pitch Shape panel for pitchers

`[ ]` **Priority: High · Effort: L**

**Source images:** Kyle Bradish card, Ramon Marquez / Henry Lalane TJStats-style
pitching summary cards, MiLB U20 K-BB%/WHIP scatter.

**Current state:** Pitcher pages show traditional stats (ERA, WHIP, K/9, BB/9,
HR/9) plus SKIP's own composite grades (CAS/DQS/DPI/TPVI). There is **no**
per-pitch breakdown anywhere — no velocity distribution by pitch type, no
break plot (induced vertical break vs. horizontal break, colored by pitch,
arm angle labeled), no usage split vs. LHH/RHH, no per-pitch grade table
(count, velo, iVB, HB, spin, VAA/HAA, release points, extension, zone%,
chase%, whiff%, xwOBAcon).

**What to build:**

- New Savant endpoint in `api/savant.js` (pitch-arsenal / pitch-movement
  leaderboard, `player_type=pitcher`)
- New `PitchShapePanel` component: 3 sub-charts (velocity KDE per pitch,
  IVB-vs-HB scatter, usage bars split by batter handedness) + a per-pitch
  stat table below
- Wire into `PlayersPage.jsx` only when `player.isPitcher`

**Acceptance criteria:** Any active MLB pitcher's card shows their pitch mix
with velocity, break, and usage-by-handedness, sourced from live Savant data
(not hardcoded).

---

## 2. Modern plate-discipline percentiles

`[~]` **Priority: High · Effort: M**

**Source images:** TJStats mobile percentile screen, Ketel Marte / Pete
Alonso cards.

**Current state (updated 2026-08-05):** Partially built. New "Plate
Discipline Percentiles" panel on `PlayersPage.jsx`, **batters only**, showing
**5 of the original 7 stats**: Whiff%, Chase% (O-Swing%), Z-Contact%, Zone%,
GB%. These are true population percentiles — ranked live against
`player.statcastPopulation` (the full `statcast_leaderboard` CSV response,
now threaded through from `loadFullPlayer()` instead of being discarded
after pulling one player's row) — not the fixed lo/max gauge
`AnalyticsLayers` uses elsewhere on the same page. Shared math now lives in
new `src/lib/percentile.js` (`percentile()`, `percentileColor()`,
`continuousColor()`); `ProspectCard.jsx` was refactored to import from there
instead of keeping its own local copy, so the two can't drift again. One
behavior change worth knowing: `percentile()` now returns `null` (not a
fabricated `50`) when there's no pool data to rank against — `ProspectCard`'s
`ToolRow` was updated to render that honestly (blank dot, "—") rather than a
silent mid-track marker.

**Still open — don't silently mark this `[x]`:**

- **CSW% and SwStr% are not implemented.** No confirmed raw column for
  either on the batter-side `statcast_leaderboard` CSV this app pulls, and
  deriving them from other fields would be a guess wearing a percent sign.
  Real candidates once Roadmap #1's pitch-level endpoint exists — check
  that item's live CSV schema before adding them here.
- **Pitchers aren't covered at all.** `api/savant.js`'s `expected_statistics`
  and `statcast_leaderboard` endpoints are both hardcoded to
  `player_type=batter` (confirmed by reading the file, not assumed) — so
  `player.savant` is never populated for a pitcher today, percentile panel
  or not. This is Roadmap #1's dependency, not something to route around
  here.
- Field names used (`whiff_percent`, `oz_swing_percent`, `z_contact_percent`,
  `zone_percent`, `groundballs_percent`) are believed correct — two
  (`oz_swing_percent`, `z_contact_percent`) were already confirmed live in
  the codebase before this change (used in `LivePerfInputs`); the other
  three follow the same naming convention but haven't been checked against
  a live CSV pull from a deployed instance. If any come back consistently
  blank in production, check the actual column name in the raw Savant CSV
  before assuming the math is wrong.

**What's left to build:** CSW%/SwStr% (blocked on #1), pitcher-side version
of this whole panel (blocked on #1).

**Acceptance criteria:** ~~Player card shows a percentile bar for each of the
7 stats above~~ → 5 of 7, batters only, met. Full 7-stat/both-sides version
blocked on Roadmap #1.

---

## 3. Contact-location heatmap

`[ ]` **Priority: Medium · Effort: M**

**Source image:** Ketel Marte card — "Contact / Intercept Point" heatmap,
split Bats Right / Bats Left for switch hitters.

**Current state:** `SprayChart` exists but shows _where batted balls land in
the field_. This is a different thing — _where contact is made relative to
the plate/zone_. Not currently built.

**What to build:** New heatmap component keyed on contact-point x/y (needs a
Savant field for this, or an approximation from swing/plate-discipline data
if the exact field isn't available). Render two panels side-by-side for
switch hitters, one for standard hitters.

**Acceptance criteria:** Component renders for any hitter with enough batted
ball events; switch hitters get both a Bats Right and Bats Left panel.

---

## 4. Color-by-stat scatter (upgrade, not new)

`[x]` **Priority: Low · Effort: S**

**Source image:** "2026 MiLB Pitchers U20" scatter — WHIP vs. K-BB%, colored
on a continuous red→blue gradient by FIP.

**Current state:** `components/ScatterBuilder.jsx` colors dots by **position**
only (categorical). No continuous-gradient coloring by a third numeric stat.

**What to build:** Add a "Color by" dropdown to `ScatterBuilder` alongside the
existing X/Y dropdowns; when set, compute a color scale (e.g. red↔blue) over
the selected stat's range and use it instead of the position-color map.

**Acceptance criteria:** User can pick any tracked stat as the color axis and
see a legend; falls back to position-coloring when no color stat is chosen.

**Done (2026-08-05):** `ScatterBuilder.jsx` now has a "Color by" dropdown
(default: Position, unchanged behavior) listing every axis stat for the
current batter/pitcher pool. When set, each dot's fill comes from
`continuousColor()` (already sitting unused in `lib/percentile.js` since the
#2 work — this item turned out to be exactly the wiring that comment
anticipated), normalized against the min/max of that stat **within the
currently-plotted/filtered set**, not the full unfiltered pool. A gradient
legend bar with min/max labels renders under the chart when a stat is
selected, and the caption line reflects the active color mode. Each axis now
carries a `higherIsBetter` flag (`false` for ERA/WHIP/BB-for-pitchers/
SO-for-batters/Rank, unflagged/neutral for Age and IP) so the rust↔teal
gradient points the intuitive direction regardless of whether the stat's
better values are numerically higher or lower — without it, e.g. a low-ERA
ace would render on the "bad" end of the bar. Color-by resets to Position on
every Batters/Pitchers switch inside the builder, since the two pools' axis
lists aren't identical and a stale key could point at a stat the new pool
doesn't have.

Added a second interaction test (`test/prospects.interaction.test.jsx`)
covering: default position-caption text, selecting a stat and seeing the
caption/legend update, and the reset-on-pool-switch behavior. Build/lint/
test all clean after the change (857 modules, 0 lint errors, 28/28 tests —
one new test added on top of the prior 27).

---

## 5. Historical trade analytics

`[ ]` **Priority: High · Effort: L**

**Source images:** Freylitics "Team Success Rate on Trade Deadline Week
Trades" bar chart (team win-rate leaderboard since 2021), Freylitics
"In-Season Trades Involving High-End Starting Pitchers" table (netWAR from
the trading-away team's perspective, with player headshots).

**Current state:** The Trade Value Simulator on the Intelligence tab is a
**single hardcoded hypothetical** (Holliday/Cole), not backed by real trade
history. The README's own roadmap already flags "Trade Sim · Standalone WAR
projection model" as planned (Phase 4b) — this item fulfills that.

**What to build:**

- A curated/static dataset of historical deadline-week trades (date,
  teams, players each way, rWAR or netWAR outcome) in `constants/data.js`,
  similar in spirit to the existing `DRAFT_BOARD`/`FARM_GRADES` static data
- A team win-rate leaderboard bar chart (% of trades where a team came out
  ahead on WAR)
- A sortable "notable trades" table, netWAR shown from the sending team's
  perspective, with team/player logos
- Keep the existing hypothetical Trade Value Simulator as-is (different use
  case: a forward-looking "what if" tool) — this is additive, not a replacement

**Acceptance criteria:** New Intelligence-tab panel(s) show real historical
trades with computed outcomes, sortable, with a team-level success-rate chart.

---

## 6. Farm system board upgrade

`[~]` **Priority: Medium · Effort: M**

**Source image:** Full farm-system ranking sheet — FV, Position, B/T, Age,
tier grouping ("Mental Mapping"), Trend (Surge/Slide/Injured), ETA with
40-man timeline, Acquired-via (trade/draft/international FA, with date).

**Current state (updated 2026-08-05):** Trend and ETA shipped as new
sortable columns on the existing Top-100 batter/pitcher tables (the
"cleaner" option this item already flagged, not a rebuild of the Farm
System Depth panel — that panel is untouched). Acquired-via was
deliberately **not** built — see "Why Acquired-via is deferred" below
before treating this as a simple oversight.

- **Trend** (`ProspectsPage.jsx`) is computed, not hand-set: `battersFV`/
  `pitchersFV` now carry `fvDelta` (live eFV minus the static preseason eFV
  — the same number `fvMovers` already ranked on, computed once per row now
  instead of twice) and `trend`, which labels it `'Surge'` past +3, `'Slide'`
  past ‑3, else `null`. `fvMovers` was refactored to reuse `p.fvDelta`
  instead of re-diffing against the static maps — same output, one source
  of truth. New `TrendBadge` in `components/atoms.jsx` renders it (▲/▼ +
  color, dash when `null`).
- **ETA** reuses the eFV engine's existing `fvETA()` (was already computed
  and merged into every row — `PlayersPage`/`ProspectsPage` just weren't
  displaying it as a column). Added `fvETAYear()` to `engine/skip.js` as a
  numeric sort key alongside it — `fvETA()`'s display string (`'MLB'` |
  `'2027'`) sorts lexicographically wrong (`'MLB'` lands after every numeric
  year, since `'M' > '2'`), so ascending-sorts-soonest-first needed a
  companion numeric field (`0` for MLB, else the projected year).
- Both tables' `minWidth` bumped (batters 920→1060, pitchers 780→920) to fit
  the two new columns without the existing ones getting cramped.
- New interaction test in `test/prospects.interaction.test.jsx` covers both
  columns rendering and being sortable (without crashing) on both the
  Batters and Pitchers tables. Build/lint/test all clean (857 modules, 0
  lint errors, 29/29 tests — one new test on top of the prior 28).

**Why Acquired-via is deferred, not built:** `PROSPECT_BATTERS`/
`PROSPECT_PITCHERS` are real, named, currently-active MLB/MiLB prospects.
Populating "Acquired-via" honestly means real per-player transaction
history (draft slot, signing bonus, trade return) — SKIP has no such data
source wired up, and inventing plausible-looking specifics (a round/pick, a
bonus figure, a trade return naming other real players) for real people
would read as fabricated factual claims about actual transactions, not
obviously-synthetic demo data — a materially different risk than this
project's existing invented stat lines/breakout percentages, which don't
assert a specific real-world event happened. This needs either a real
transactions data source or the user's own manual curation (they'd know
which specific trades/signings to record) — not something to fake to hit
this item's acceptance criteria. If picked back up: don't add per-player
trade/draft/bonus details without a real source: cite one, or leave it out.

**What's left to build:** Acquired-via (blocked on a real transactions data
source or manual curation — see above); optionally, migrating the existing
hand-curated "Risers & Fallers" view onto this same live `trend` field
instead of its separate hardcoded lists (not done here — that view's
specific injury-note text for a handful of named players is pre-existing
content this change didn't touch or extend).

**Acceptance criteria:** ~~Prospect table/board shows Trend, ETA, and
Acquired-via per player; sortable by each.~~ → Trend + ETA met, both sortable,
both batters and pitchers. Acquired-via not met — see above.

---

## 7. Compact team-branded percentile radar cards

`[ ]` **Priority: Low · Effort: S**

**Source images:** Brewers-style small hexagon radar cards (Avg LA 95+, EV
90th, xwOBA, Zone Whiff%, SwM%, Chase%), team logo + accent color.

**Current state:** `GeometryRadar` exists (6-axis, full-size, on the player
page) and `OverviewPage.jsx` already resolves a `teamAccent` color per team —
so the team-coloring plumbing exists. What's missing is a **compact,
shareable** card version with this specific stat set.

**What to build:** A smaller standalone `RadarCard` component (fixed small
size, team logo + accent border) usable on Players or Prospects; consider a
"save as image" export since that's a real feature in the reference (TJStats
mobile has it too — could be shared utility for #2 and #7).

**Acceptance criteria:** Compact radar card renders for any player, styled in
their team's colors, with the 6 stats listed above.

---

## 8. Live pitch-charting tool

`[ ]` **Priority: Low (large, different category) · Effort: XL**

**Source image:** Interactive strike-zone charting UI — 9-zone (+expanded
17-zone) strike zone, catcher target zone, pitch type buttons, batter info,
count/outs tracker, pitcher/catcher view toggle.

**Current state:** Nothing like this exists. This is categorically different
from the rest of SKIP, which is a **read-only stats aggregator** — this is a
**manual live data-entry tool** for someone charting a game in person (a
scout or coach at the ballpark). It would pair naturally with the existing
Scouting Notes page (localStorage-based reports) but is a much bigger build:
new state machine for count/outs/pitch sequence, zone-tap UI, per-plate-
appearance log, and persistence.

**What to build (if picked up):** Scope as its own sub-feature under
Scouting Notes rather than a new top-level tab. Start with: strike-zone tap
UI + pitch type/result logging + a pitch log view. Defer catcher-target-zone
and pitcher/catcher view toggle to a second pass.

**Acceptance criteria (v1):** User can log pitches (zone, type, result) for a
given batter across an at-bat, see a running pitch log, and the log persists
locally like Scouting Notes does.

---

## Suggested build order

1. Modern plate-discipline percentiles (#2) — smallest lift, high visibility
2. Historical trade analytics (#5) — fulfills your own README roadmap item
3. Pitch Shape panel (#1) — highest impact, needs new Savant endpoint first
4. Farm system board upgrade (#6)
5. Color-by-stat scatter (#4) — quick follow-on once time allows
6. Contact-location heatmap (#3)
7. Compact team radar cards (#7)
8. Live pitch-charting tool (#8) — separate mini-project, tackle last

---

## Progress Log

_Add one line per work session, newest at top. Example format:_
`2026-08-05 — Claude (chat) — Created this doc from reference-image gap analysis. No code changed yet.`

2026-08-05 — Claude (chat) — Built #6 (Farm system board upgrade): Trend + ETA added as new sortable columns on the existing Top-100 batter/pitcher tables. Trend is computed from live-vs-preseason eFV drift (new `fvDelta`/`trend` fields in `ProspectsPage.jsx`, `fvMovers` refactored to reuse `fvDelta` instead of re-diffing); ETA reuses the already-existing `fvETA()` plus a new numeric `fvETAYear()` sort key in `engine/skip.js`. New `TrendBadge` in `components/atoms.jsx`. Deliberately did **not** build Acquired-via — see the item's "Why Acquired-via is deferred" note: these are real, named prospects, and inventing specific draft/trade/bonus details for real people isn't the same risk class as this project's other synthetic stats. Left at `[~]`, not `[x]`. New interaction test added; build/lint/test all clean (857 modules, 0 lint errors, 29/29 tests). Next: picking up #1 (Pitch Shape panel) per the user's build order.

2026-08-05 — Claude (chat) — Reviewed the #2 handoff (independently reran build/lint/test, spot-checked the batter-only Savant hardcoding and two field-name claims against source — all confirmed accurate) with no code changes, then built #4 (color-by-stat scatter) end to end: `ScatterBuilder.jsx` "Color by" dropdown, `higherIsBetter` direction flags on both axis lists, gradient legend, and a new interaction test. Item marked `[x]` — see its "Done" note above for scope. `lib/percentile.js`'s previously-unused `continuousColor()` is now wired in; nothing else in that file changed.

2026-08-05 — Claude (chat) — Started #2 (plate-discipline percentiles). New `src/lib/percentile.js` (percentile/percentileColor/continuousColor, shared with `ProspectCard.jsx`, which no longer keeps its own local copy). New `PlateDisciplinePercentiles` panel in `PlayersPage.jsx`, batters only, 5 of 7 stats (Whiff%, Chase%, Z-Contact%, Zone%, GB% — CSW%/SwStr% deliberately deferred, no confirmed field). `loadFullPlayer()` in `src/api/mlb.js` now threads the full `statcast_leaderboard` population through as `player.statcastPopulation` instead of discarding it after matching one player's row — that's what the panel ranks against. `percentile()`'s missing-data behavior changed from returning a fabricated `50` to returning `null`; `ProspectCard.jsx`'s `ToolRow` updated to render that honestly. Build/lint/test all clean after the change (857 modules, 0 lint errors, 27/27 tests). Item left at `[~]`, not `[x]` — see "Still open" notes in the item above before treating this as done.

2026-08-05 — Claude (chat) — Created this doc from reference-image gap analysis after reviewing the SKIP codebase (pages/, engine/skip.js, api/savant.js, constants/data.js). No feature code changed yet.
