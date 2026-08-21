# Front Office Context Sources — 2026-08-21

The expanded baserunning model is grounded in three official Baseball Savant leaderboards. The [Baserunning Run Value leaderboard](https://baseballsavant.mlb.com/leaderboard/baserunning-run-value) defines its run value as the combined effect of stolen bases and extra bases taken. Its methodology says non-steal opportunity probability incorporates runner speed, outfielder arm, runner base position, and distances between the ball and bases.

The [Extra Bases Taken Run Value leaderboard](https://baseballsavant.mlb.com/leaderboard/baserunning) isolates non-steal advances against fielders. Savant describes its inputs as runner speed, outfielder arm, runner position, and fielder distances. Its output accounts for successful advances, outs, and holds rather than merely counting attempts.

The [Sprint Speed Team leaderboard](https://baseballsavant.mlb.com/leaderboard/sprint-speed-team?season=2026&team=) defines sprint speed as feet per second in a player’s fastest one-second window. It documents a 27 ft/sec MLB competitive-play average, an approximate 23–30 ft/sec competitive range, and a 10-competitive-run qualification threshold. The new code will use parsed official team leaderboard rows only when a comparable team population is present; otherwise the baseline stolen-base model stays transparent and no substitute speed metric is created.
