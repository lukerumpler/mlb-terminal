import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.SKIP_AUDIT_BASE_URL || 'http://localhost:3000';
const season = Number(process.env.SKIP_AUDIT_SEASON || 2026);
const outputDir = path.resolve('audit-results');
const response = await fetch(`${baseUrl}/api/intelligence-calculations?mode=all&season=${season}`, {
  signal: AbortSignal.timeout(20_000),
});
const payload = await response.json().catch(() => ({}));
if (!response.ok) throw new Error(`All-team intelligence endpoint returned ${response.status}: ${payload?.error || 'unknown error'}`);

const teams = Array.isArray(payload.teams) ? payload.teams : [];
const byMetric = {
  teamWarProxy: teams.filter(team => team.metrics?.teamWarProxy != null),
  playoffProbability: teams.filter(team => team.metrics?.playoffProbability != null),
  divisionProjection: teams.filter(team => team.playoffProjection?.projectedDivisionRank != null),
  wildCardProjection: teams.filter(team => team.playoffProjection?.projectedWildCardRank != null),
};
const audit = {
  auditedAt: new Date().toISOString(),
  endpoint: `${baseUrl}/api/intelligence-calculations?mode=all&season=${season}`,
  httpStatus: response.status,
  totalStandingsTeams: payload.totalStandingsTeams ?? null,
  calculatedTeams: payload.calculatedTeams ?? null,
  teamWarProxyCalculations: payload.teamWarProxyCalculations ?? null,
  playoffEligibleCalculations: payload.playoffEligibleCalculations ?? null,
  unavailableTeams: payload.unavailableTeams || [],
  observed: Object.fromEntries(Object.entries(byMetric).map(([name, values]) => [name, values.length])),
  probabilityBoundsValid: teams.every(team => team.metrics?.playoffProbability == null || (team.metrics.playoffProbability >= 0 && team.metrics.playoffProbability <= 100)),
  teamIdsUnique: new Set(teams.map(team => team.teamId)).size === teams.length,
  examples: teams.slice(0, 5).map(team => ({
    teamId: team.teamId,
    teamName: team.teamName,
    teamWarProxy: team.metrics?.teamWarProxy ?? null,
    playoffProbability: team.metrics?.playoffProbability ?? null,
    divisionRank: team.playoffProjection?.projectedDivisionRank ?? null,
    wildCardRank: team.playoffProjection?.projectedWildCardRank ?? null,
  })),
};

await fs.mkdir(outputDir, { recursive:true });
await fs.writeFile(path.join(outputDir, 'all-team-intelligence-audit.json'), `${JSON.stringify(audit, null, 2)}\n`);
const complete = audit.totalStandingsTeams === 30 && audit.calculatedTeams === 30 && audit.observed.teamWarProxy === 30 && audit.observed.playoffProbability === 30 && audit.unavailableTeams.length === 0 && audit.probabilityBoundsValid && audit.teamIdsUnique;
console.table([{
  totalStandingsTeams:audit.totalStandingsTeams,
  calculatedTeams:audit.calculatedTeams,
  teamWarProxy:audit.observed.teamWarProxy,
  playoffProbability:audit.observed.playoffProbability,
  unavailableTeams:audit.unavailableTeams.length,
  probabilityBoundsValid:audit.probabilityBoundsValid,
  teamIdsUnique:audit.teamIdsUnique,
  complete,
}]);
if (!complete) process.exitCode = 2;
