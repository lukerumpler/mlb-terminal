# SKIP — Proprietary Tracking Data Roadmap

**Purpose:** The plan is to join an MLB club and get real access to one or
more team-only data systems — TrackMan, Rapsodo, Hawkeye, "BATS," and/or a
generic internal data stream — none of which SKIP has access to today. This
doc describes the scaffolding built *before* that access exists, so that
wiring up a real feed later is "implement one adapter's `fetchRaw()` and
`normalize()`," not "design a data pipeline under time pressure." Written so
any agent (Claude, another LLM, or a human) picking this up cold can
understand what's real, what's a stub, and exactly what to do next.

**How to use this doc:** Flip an item's checkbox to `[~]` when you start,
`[x]` when done, and add a dated line to the **Progress Log** at the bottom.
If you discover a note here is wrong (e.g. you learn what BATS actually is),
correct it in place rather than leaving stale info for the next session.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done

---

## Important distinction from ROADMAP_REFERENCE_FEATURES.md #1

That doc's "Pitch Shape panel" is about **public** Baseball Savant data
(`api/savant.js`) — pitch-arsenal shape for any MLB pitcher, no special
access required. This doc is about a different, richer tier: team-only raw
feeds (higher frequency, biomechanics, bullpen/cage sessions, whatever a
club's internal systems expose) that aren't public at all. Don't conflate
the two — they're separate features with separate data sources.

## 0. Baseline — NOT BUILT IN THIS REPO (verify before trusting)

> **Correction (2026-09-16).** Every item in this section was previously
> marked `[x]` done. **None of these files exist** — not on this branch, not
> on `main`, not anywhere in this repository's reachable history. Verified
> with:
>
> ```bash
> git ls-tree -r HEAD --name-only | grep -iE "trackingProviders|_providers|tracking-providers"
> git log --all --oneline -- "*trackingProviders*" "*AdvancedTrackingPanel*" "*tracking-providers*"
> ```
>
> Both return empty. The progress-log entry below describes building this
> against a `combine-branches` checkout, which also does not exist on this
> remote. Wherever that work went, it did not arrive here.
>
> Items are therefore re-marked `[ ]`. **Do not treat this section as
> "already done, don't rebuild."** Either locate the original work and merge
> it, or build it fresh. The descriptions are retained because they are a
> reasonable design spec — but they describe an intention, not a fact.


- [ ] `shared/trackingProviders.js` — registry of the 5 provider definitions
      (label, category, honest public description, what connecting it
      unlocks, required env vars) + canonical `PitchTrackingEvent` /
      `SwingTrackingEvent` JSDoc shapes every adapter normalizes into.
- [ ] `server/api/_providers/{shared,trackman,rapsodo,hawkeye,bats,teamInternalFeed}.js`
      — one adapter stub per provider. Each checks env vars via
      `getEnvStatus()` and throws `ProviderNotConnectedError` until
      configured; `fetchRaw()` bodies are placeholders that throw a clear
      "implement me" error even once env vars exist, since no real request
      logic has been written against real docs yet.
- [ ] `server/api/tracking-providers.js` — status endpoint. Returns
      `{ providers: [...], generatedAt }` where each provider reports
      `connected` (env vars present, nothing more) and `missingEnvVars`.
      Never fetches real data, never echoes credential values. Registered in
      both `server/api/routes.ts` (local/dev Express) **and**
      `api/[...path].ts` (production Vercel catch-all) — both had to be
      updated; missing the second one means it 404s in production while
      working fine locally.
- [ ] `client/src/lib/trackingProvidersClient.js` — TTL-cached fetch wrapper
      for the status endpoint, same pattern as `cacheHealthClient.js`.
- [ ] `client/src/components/TrackingDataSourcesPanel.jsx` — Settings page
      panel (below the existing `DataSourceStatusCenter`) listing all 5
      providers with category, description, what they unlock, and a
      Connected/Not-connected pill. Not connected is styled neutrally, not
      as an error/warning — it's the expected default state.
- [ ] `client/src/features/player-profile/AdvancedTrackingPanel.jsx` +
      `advancedTrackingSampleData.js` — a panel on the player profile page
      (pitchers get a pitch-events table, hitters get a swing-events table),
      with a "Preview with sample data" toggle that renders clearly-labeled
      synthetic rows through the exact same table component real data will
      use later. The sample banner is persistent and unmissable while
      active; sample state is React-local, never persisted.
- [ ] `server/api/tracking-providers.test.ts` — covers all-disconnected,
      one-provider-connected, method rejection, and CORS preflight. Full
      suite (`npx vitest run`) passes at 153 files / 687 tests / 4 skipped
      with these changes in; `tsc --noEmit` and `vite build` both clean.

## 1. TrackMan

- [ ] **Current state:** stub only. `normalize()` has a *placeholder*
      field-mapping based on TrackMan's publicly documented amateur/college
      CSV export (`RelSpeed`, `SpinRate`, `SpinAxis`, `HorzBreak`,
      `InducedVertBreak`, `RelHeight`, `RelSide`, `Extension`,
      `TaggedPitchType`). This is **not confirmed** to match whatever a
      club's real API access looks like.
- [ ] **What to build once you have access:** confirm the real
      request/response shape against actual docs, rewrite `fetchRaw()` in
      `server/api/_providers/trackman.js` to hit the real endpoint using
      `TRACKMAN_API_KEY` / `TRACKMAN_BASE_URL`, and correct every field in
      `normalize()` against what you actually see back — treat the current
      mapping as a first guess to verify, not a fact.

## 2. Rapsodo

- [ ] **Current state:** stub only, same caveat as TrackMan — placeholder
      mapping for both pitching (`normalizePitch`) and hitting
      (`normalizeSwing`) sessions based on Rapsodo's publicly described
      metrics, unconfirmed against a real API response.
- [ ] **What to build:** same shape of work as TrackMan, in
      `server/api/_providers/rapsodo.js`, using `RAPSODO_API_KEY` /
      `RAPSODO_BASE_URL`. Rapsodo data is most often bullpen/cage sessions
      rather than games — `sessionType` defaults reflect that; correct once
      you know how your club actually tags sessions.

## 3. Hawkeye

- [ ] **Current state:** stub only, and deliberately **has no guessed field
      mapping** — there's no public schema for MLB's club-facing raw
      Hawkeye feed to guess from, unlike TrackMan/Rapsodo. `normalize()`
      throws on purpose rather than pretending to know the shape.
- [ ] **What to build:** write `fetchRaw()` and `normalize()` in
      `server/api/_providers/hawkeye.js` from scratch against real
      documentation once you have it. Don't copy the TrackMan/Rapsodo field
      names in as a starting point — there's no reason to think they'd
      match Hawkeye's schema.

## 4. BATS

- [ ] **Current state:** the label itself is an unconfirmed placeholder —
      what "BATS" refers to at a given club hasn't been established. See
      `shared/trackingProviders.js`'s note on this entry.
- [ ] **What to build:** first, in one sentence, write down what BATS
      actually is once you know (update the `label`/`description` in
      `shared/trackingProviders.js`). Only after that does it make sense to
      touch `server/api/_providers/bats.js`.

## 5. Team internal data stream

- [ ] **Current state:** stub only, intentionally the most open-ended entry
      — this varies enormously by organization.
- [ ] **What to build:** expect to more or less rewrite
      `server/api/_providers/teamInternalFeed.js` from scratch once you know
      what your club's internal system actually is; nothing in the current
      stub should be assumed to survive that rewrite.

## 6. Once any one provider is real (cross-cutting, do this once, not per-provider)

- [ ] Add a real data-fetching endpoint (e.g. `server/api/tracking-events.js`)
      that calls the connected adapter's `fetchRaw()` + `normalize()` and
      returns canonical events — none exists yet, since there was nothing
      real to fetch. Register it in **both** `routes.ts` and
      `api/[...path].ts` (see the baseline note above on why both matter).
- [ ] Wire `AdvancedTrackingPanel.jsx`'s "connected" branch to actually call
      that endpoint instead of showing the current "connected but not wired
      up yet" placeholder message.
- [ ] Consider a movement/release-point scatter plot once real pitch data
      exists — deferred for now since a fake chart over sample data adds
      more visual noise than the current simple table.

---

## Progress Log

_Add one line per work session, newest at top._

2026-08-28 — Claude (chat) — **[UNVERIFIABLE — see the correction in
section 0; none of the files below are present in this repo]** Reported
building the full baseline (section 0): shared
canonical schema/registry, 5 adapter stubs (TrackMan/Rapsodo with hedged
placeholder field-mappings from public docs, Hawkeye/BATS/team-internal
deliberately left unmapped), status endpoint registered in both the
Express router and the Vercel catch-all, Settings panel, and the
player-profile Advanced Tracking panel with a sample-data preview toggle.
Built and verified against the real `combine-branches` checkout (not an
older snapshot) after the user provided a git bundle mid-session — required
correcting one thing that would've been missed working from the stale
snapshot alone: the production Vercel catch-all (`api/[...path].ts`) needed
its own registration entry separate from `routes.ts`. Full validation:
`tsc --noEmit` clean, full `vitest run` 153 files / 687 tests / 4 skipped
(pre-existing skips, unrelated to this work) all passing, `vite build`
clean (3021 modules). No existing files' behavior changed — every edit to
a pre-existing file (`routes.ts`, `api/[...path].ts`, `OtherPages.jsx`,
`PlayersPage.jsx`) is a pure addition. Next: nothing further until real
provider access exists — see section 6 for what that unlocks.

2026-09-16 — Verification pass — Searched the full tree and every reachable
ref for the seven artifacts section 0 marked done. Found none. Re-marked
section 0 as not-started and annotated the 2026-08-28 entry rather than
deleting it, so the discrepancy stays visible instead of being quietly
erased. No code changed. Next step for whoever owns this: find the
`combine-branches` work or rebuild section 0 from scratch.
