# Team Leaders Hot-Streak Source Audit — 2026-08-21

The hot-streak section will use the existing official MLB Stats API `stats=byDateRange` player-split route through the project MLB proxy. The inspected Dodgers query used `group=hitting` and `group=pitching`, `teamId=119`, `season=2026`, `startDate=2026-08-07`, and `endDate=2026-08-20`.

The official hitting rows include `plateAppearances`, `ops`, and `homeRuns`; the official pitching rows include `inningsPitched`, `era`, and `strikeOuts`. The implementation will continue to enforce role separation: OPS requires an official hitting row and PA threshold, while ERA requires an official pitching row and IP threshold. No hot-streak values will be shown when those provider fields are missing.

Source endpoint: <https://statsapi.mlb.com/api/v1/stats>
