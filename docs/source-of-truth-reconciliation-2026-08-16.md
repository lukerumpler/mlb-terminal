# Source-of-Truth Reconciliation — 2026-08-16

The GitHub repository `lukerumpler/mlb-terminal` on GitHub `main` is at commit `aa73d314e2e417ed4b95f8624f48aa004e31c654`. Its `server/api/fangraphs-models.js` contains the FanGraphs HTML field mappings and short failure cooldowns, but no UTC-day attempt maps or daily refresh gate. GitHub `main` does not contain `server/api/intelligence-calculations.js`.

The current Manus project is a different source of truth. Its local checkout is at checkpoint commit `0ebef536`, and its local `origin/main` reference points to that checkpoint rather than to the GitHub `main` commit. The current project contains `server/api/daily-provider-policy.js`, FanGraphs UTC-day attempt tracking, and `server/api/intelligence-calculations.js`.

The published domain `skipbasebal-mm6hz9ps.manus.space` was probed directly. The intelligence endpoint returned HTTP 200 with `source: MLB Stats API`, `provenance: calculated-from-verified-standings`, and calculated projected wins/losses. The published FanGraphs endpoint returned a cached HTTP 200 response with `playoffOdds: null`, `teamWar: null`, `statuses` marking those fields `unparsed`, and `freshness: cached`.

Therefore, the claim that the behavior is absent from the current deployed Manus project is incorrect, but the claim that it is absent from GitHub `main` is correct. The earlier explanation must distinguish these two repositories. No further capability claim should be made about GitHub `main` unless the checkpoint is explicitly exported or merged there.
