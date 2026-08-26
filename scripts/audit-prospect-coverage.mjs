import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { PROSPECT_BATTERS, PROSPECT_PITCHERS, TEAMS } from "../client/src/constants/data.js";

const REQUIRED_TEAM_ABBRS = Object.freeze([
  "LAA", "HOU", "ATH", "TOR", "ATL", "MIL", "STL", "CHC", "ARI", "LAD",
  "SF", "CLE", "SEA", "MIA", "NYM", "WSH", "BAL", "SD", "PHI", "PIT",
  "TEX", "TB", "BOS", "CIN", "COL", "KC", "DET", "MIN", "CWS", "NYY",
]);

const allProspects = [...PROSPECT_BATTERS, ...PROSPECT_PITCHERS];
const teamNameByAbbr = Object.fromEntries(Object.values(TEAMS).map(team => [team.abbr, team.name]));
const countsByTeam = new Map(REQUIRED_TEAM_ABBRS.map(team => [team, 0]));
const names = new Set();
const ids = new Set();
const duplicates = [];

for (const prospect of allProspects) {
  const team = String(prospect.team || "").toUpperCase();
  if (countsByTeam.has(team)) countsByTeam.set(team, countsByTeam.get(team) + 1);

  const nameKey = String(prospect.name || "").trim().toLocaleLowerCase("en-US");
  if (!prospect.mlbId || !prospect.name || !prospect.team || !prospect.pos) {
    duplicates.push({ type: "incomplete-record", prospect });
  }
  if (names.has(nameKey)) duplicates.push({ type: "duplicate-name", name: prospect.name });
  if (ids.has(prospect.mlbId)) duplicates.push({ type: "duplicate-mlb-id", mlbId: prospect.mlbId, name: prospect.name });
  names.add(nameKey);
  ids.add(prospect.mlbId);
}

const teams = REQUIRED_TEAM_ABBRS.map(abbr => ({
  team: teamNameByAbbr[abbr] ?? abbr,
  abbr,
  currentProspectRecords: countsByTeam.get(abbr) ?? 0,
  missingToOfficialTop30: Math.max(0, 30 - (countsByTeam.get(abbr) ?? 0)),
  officialTop30Url: `https://www.mlb.com/prospects/${Object.entries(TEAMS).find(([, team]) => team.abbr === abbr)?.[0] ?? ""}`,
}));

const report = {
  generatedAt: new Date().toISOString(),
  requiredTeamCount: REQUIRED_TEAM_ABBRS.length,
  currentProspectRecordCount: allProspects.length,
  uniquePlayerNames: names.size,
  uniqueMlbIds: ids.size,
  completeRecordCount: allProspects.length - duplicates.filter(item => item.type === "incomplete-record").length,
  duplicateIssues: duplicates,
  teams,
  allTeamsMeetOfficialTop30: teams.every(team => team.currentProspectRecords >= 30),
};

const outputPath = resolve(process.cwd(), "artifacts/prospect-coverage-audit.json");
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);

console.table(teams.map(({ team, abbr, currentProspectRecords, missingToOfficialTop30 }) => ({ team, abbr, currentProspectRecords, missingToOfficialTop30 })));
console.log(JSON.stringify({
  requiredTeamCount: report.requiredTeamCount,
  currentProspectRecordCount: report.currentProspectRecordCount,
  uniqueMlbIds: report.uniqueMlbIds,
  allTeamsMeetOfficialTop30: report.allTeamsMeetOfficialTop30,
  duplicateIssues: report.duplicateIssues.length,
  outputPath,
}, null, 2));

if (process.argv.includes("--strict") && !report.allTeamsMeetOfficialTop30) process.exitCode = 1;
