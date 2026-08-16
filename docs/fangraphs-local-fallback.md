# FanGraphs Local Fallback

The Overview now keeps the last successful FanGraphs model and aggregate-WAR payload in browser local storage. The snapshot is written only after a successful provider response and is scoped to the exact request URL, so one team, season, or response shape cannot be used for another.

When the normal ten-minute in-memory provider cache is empty, the client still makes only one coalesced refresh request. If that request returns a 502, 429, timeout, or another failure, a snapshot no older than seven days is returned with `freshness: stale-local`, the original retrieval timestamp, and a calculated stale age. If no snapshot exists or it is older than seven days, the request remains unavailable; no values are fabricated.

The Overview maps `stale-local` to the existing cached-fallback status and labels the source as `local cached` with its original retrieval age. Model and aggregate-WAR snapshots use separate request-scoped storage keys. Existing server-side in-memory stale reuse remains active as the first fallback layer.

Validation: FanGraphs fallback, parser, Overview retry, and client cache tests pass; the complete suite passes with 85 files and 404 tests; type-check and production build pass.
