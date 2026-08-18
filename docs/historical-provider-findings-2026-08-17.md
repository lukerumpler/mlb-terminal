# Historical Provider Findings

The official MLB Stats API year-by-year advanced endpoint was probed at https://statsapi.mlb.com/api/v1/people/660271/stats?stats=yearByYearAdvanced&group=hitting. It returns yearByYearAdvanced splits for Shohei Ohtani, but the observed response did not expose explicit WAR or wRC+ keys; therefore the adapter must preserve those fields as unavailable unless the provider explicitly supplies them.

Baseball-Reference player page inspected at https://www.baseball-reference.com/players/o/ohtansh01.shtml. The rendered summary exposes current-season and career WAR plus OPS+, but the observed page text does not establish historical wRC+ coverage. The implementation must not treat OPS+ as wRC+ and should use Baseball-Reference primarily for exact identity mapping and explicit WAR fields.

FanGraphs public leaderboard API probe at https://www.fangraphs.com/api/leaders/major-league/data?pos=all&stats=bat&lg=all&qual=0&type=8&season=2025&season1=2025&ind=0&team=0%2Cts returned a Cloudflare challenge in the sandbox, so it is not a reliable unauthenticated runtime source for this adapter.
