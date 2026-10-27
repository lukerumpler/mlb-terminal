# Model Source Notes

FanGraphs provides current-season MLB playoff odds and projected team-WAR context through its public standings and depth-chart pages. Relevant pages reviewed on 2026-08-14:

- Playoff odds: https://www.fangraphs.com/standings/playoff-odds/fg/mlb
- Team depth charts / team WAR: https://www.fangraphs.com/depthcharts.aspx?position=Team
- Projected standings: https://www.fangraphs.com/standings/projected-standings

The extracted page text explicitly labels the sections as 2026 MLB Playoff Odds and Team WAR Totals (RoS), and the depth-chart page identifies the team-WAR view. The pages are dynamically rendered/partially extracted, so implementation must treat parsing as best-effort, retain the source URL, record retrieval time, and show a source-gap state when the upstream layout changes or cannot be reached. Do not hardcode current team odds or WAR values.

The existing project routes browser data through server-side proxy routes in `server/api/routes.ts`; client requests use `/api/mlb`, `/api/savant`, `/api/feed`, `/api/team-financials`, and related endpoints. New FanGraphs access should follow the same server-proxy pattern rather than direct browser scraping.
