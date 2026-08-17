import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const baseUrl = process.env.SKIP_E2E_BASE_URL || 'http://localhost:3000';
const season = Number(process.env.SKIP_E2E_SEASON || 2026);
const outputDir = path.resolve('audit-results/e2e');

async function requestJson(pathname, { retries = 0 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await fetch(`${baseUrl}${pathname}`, { signal:AbortSignal.timeout(30_000) });
    const body = await response.json().catch(() => ({}));
    const result = { status:response.status, headers:Object.fromEntries(response.headers.entries()), body, attempts:attempt + 1 };
    if (result.status !== 429 || attempt === retries) return result;
    const delayMs = Math.max(1, Number(result.headers['retry-after'] || 10)) * 1000 + 150;
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  throw new Error('Unreachable request retry state');
}

const startedAt = new Date().toISOString();
const beforeTelemetry = await requestJson('/api/player-identity?mode=metrics');
assert.equal(beforeTelemetry.status, 200, 'Telemetry endpoint should be available');

const all = await requestJson(`/api/intelligence-calculations?mode=all&season=${season}`);
assert.equal(all.status, 200, 'All-team fallback endpoint should return 200');
assert.equal(all.body.totalStandingsTeams, 30, 'The official standings response should contain 30 teams');
assert.equal(all.body.calculatedTeams, 30, 'All 30 teams should receive a calculation result');
assert.equal(all.body.playoffEligibleCalculations, 30, 'All 30 teams should receive a playoff estimate');
assert.equal(all.body.teamWarProxyCalculations, 30, 'All 30 teams should receive a Team WAR proxy');
assert.equal(all.body.unavailableTeams?.length, 0, 'No live standings team should be unavailable');
assert.equal(all.body.teams?.length, 30, 'All-team response should contain 30 result objects');
assert.equal(new Set(all.body.teams.map(team => team.teamId)).size, 30, 'Team IDs must be unique');
assert.equal(all.body.teams.every(team => Number.isFinite(team.metrics?.teamWarProxy)), true, 'Every team needs a finite Team WAR proxy');
assert.equal(all.body.teams.every(team => team.metrics?.playoffProbability >= 0 && team.metrics?.playoffProbability <= 100), true, 'Every playoff estimate must remain within 0–100%');

const individualResults = [];
for (const team of all.body.teams) {
  const result = await requestJson(`/api/intelligence-calculations?teamId=${encodeURIComponent(team.teamId)}&season=${season}`, { retries:2 });
  assert.equal(result.status, 200, `${team.teamName} individual endpoint should return 200`);
  assert.equal(result.body.teamId, team.teamId, `${team.teamName} should return its requested team ID`);
  assert.equal(result.body.metrics?.teamWarProxy, team.metrics?.teamWarProxy, `${team.teamName} Team WAR proxy should match all-team output`);
  assert.equal(result.body.metrics?.playoffProbability, team.metrics?.playoffProbability, `${team.teamName} playoff estimate should match all-team output`);
  individualResults.push({
    teamId:team.teamId,
    teamName:team.teamName,
    status:result.status,
    providerCache:result.headers['x-provider-cache'] || null,
    attempts:result.attempts,
    teamWarProxy:result.body.metrics?.teamWarProxy ?? null,
    playoffProbability:result.body.metrics?.playoffProbability ?? null,
  });
}

// This request deliberately mirrors the browser registry path. Provider access
// can be blocked externally, so the verification asserts only the API contract
// and aggregate counters, not a provider-dependent identity match.
const directId = await requestJson('/api/player-identity?mlbId=660271&name=Shohei%20Ohtani&baseballReferenceId=ohtansh01&identitySource=registry');
assert.equal(directId.status, 200, 'Direct Baseball-Reference ID resolver should return its safe response contract');
assert.equal(typeof directId.body.invalidateBaseballReferenceId, 'boolean', 'Direct ID response should communicate safe invalidation status');
const afterTelemetry = await requestJson('/api/player-identity?mode=metrics');
assert.equal(afterTelemetry.status, 200, 'Telemetry endpoint should remain readable after direct resolution');
const beforeCounters = beforeTelemetry.body.telemetry?.counters || {};
const afterCounters = afterTelemetry.body.telemetry?.counters || {};
assert.equal(afterCounters.directIdRequests, Number(beforeCounters.directIdRequests || 0) + 1, 'Direct-ID request counter should increment once');
assert.equal(afterCounters.browserRegistryReuses, Number(beforeCounters.browserRegistryReuses || 0) + 1, 'Browser-registry reuse counter should increment once');
assert.equal(afterCounters.resolverRequests >= Number(beforeCounters.resolverRequests || 0) + 1, true, 'Resolver counter should record the direct request');

const report = {
  startedAt,
  finishedAt:new Date().toISOString(),
  baseUrl,
  season,
  allTeam:{
    httpStatus:all.status,
    totalStandingsTeams:all.body.totalStandingsTeams,
    calculatedTeams:all.body.calculatedTeams,
    playoffEligibleCalculations:all.body.playoffEligibleCalculations,
    teamWarProxyCalculations:all.body.teamWarProxyCalculations,
    unavailableTeams:all.body.unavailableTeams,
  },
  individualTeams:{
    checked:individualResults.length,
    allHttp200:individualResults.every(result => result.status === 200),
    cacheStates:[...new Set(individualResults.map(result => result.providerCache))],
    rateLimitRetries:individualResults.reduce((sum, result) => sum + Math.max(0, result.attempts - 1), 0),
    results:individualResults,
  },
  telemetry:{
    directRequestHttpStatus:directId.status,
    directResponseFound:Boolean(directId.body.found),
    invalidateBaseballReferenceId:directId.body.invalidateBaseballReferenceId,
    before:beforeTelemetry.body.telemetry,
    after:afterTelemetry.body.telemetry,
  },
};

await fs.mkdir(outputDir, { recursive:true });
await fs.writeFile(path.join(outputDir, 'fallback-telemetry-api-e2e.json'), `${JSON.stringify(report, null, 2)}\n`);
console.table([{
  allTeams:report.allTeam.calculatedTeams,
  individualChecks:report.individualTeams.checked,
  allIndividual200:report.individualTeams.allHttp200,
  rateLimitRetries:report.individualTeams.rateLimitRetries,
  directIdHttpStatus:report.telemetry.directRequestHttpStatus,
  directIdRequestsAfter:report.telemetry.after?.counters?.directIdRequests,
  registryReusesAfter:report.telemetry.after?.counters?.browserRegistryReuses,
}]);
