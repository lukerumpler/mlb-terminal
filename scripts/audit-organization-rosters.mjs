import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TEAMS } from '../client/src/constants/data.js';

const organizations = Object.entries(TEAMS)
  .map(([key, team]) => ({ key, id: team.id, abbr: team.abbr, name: team.name }))
  .sort((left, right) => left.abbr.localeCompare(right.abbr));
const concurrency = 3;

async function auditOrganization(organization) {
  const url = `https://statsapi.mlb.com/api/v1/teams/${organization.id}/roster?rosterType=fullRoster&season=2026&hydrate=person(currentTeam)`;
  let lastResult = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const startedAt = performance.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(25_000) });
      const body = await response.json().catch(() => ({}));
      const records = Array.isArray(body?.roster) ? body.roster : [];
      const validIds = new Set(records.map(record => record?.person?.id).filter(Boolean));
      const result = {
        organization: organization.abbr,
        teamId: organization.id,
        status: response.status,
        ok: response.ok && validIds.size > 0,
        rosterRecords: records.length,
        uniquePlayerIds: validIds.size,
        latencyMs: Math.round(performance.now() - startedAt),
        attempts: attempt,
      };
      if (result.ok || attempt === 2) return result;
      lastResult = result;
    } catch (error) {
      lastResult = {
        organization: organization.abbr,
        teamId: organization.id,
        status: null,
        ok: false,
        rosterRecords: 0,
        uniquePlayerIds: 0,
        latencyMs: Math.round(performance.now() - startedAt),
        attempts: attempt,
        error: error?.name || 'Error',
      };
      if (attempt === 2) return lastResult;
    }
    await new Promise(resolvePromise => setTimeout(resolvePromise, 1_000));
  }
  return lastResult;
}

const results = [];
for (let offset = 0; offset < organizations.length; offset += concurrency) {
  const batch = organizations.slice(offset, offset + concurrency);
  const batchResults = await Promise.all(batch.map(auditOrganization));
  results.push(...batchResults);
}

const report = {
  source: 'MLB Stats API /teams/{teamId}/roster?rosterType=fullRoster',
  season: 2026,
  retrievedAt: new Date().toISOString(),
  organizationsRequested: organizations.length,
  organizationsAvailable: results.filter(result => result.ok).length,
  aggregateRosterRecords: results.reduce((sum, result) => sum + result.rosterRecords, 0),
  aggregateUniquePlayerIdsByOrganization: results.reduce((sum, result) => sum + result.uniquePlayerIds, 0),
  failures: results.filter(result => !result.ok),
  results,
};

const outputDirectory = resolve(process.cwd(), 'artifacts');
await mkdir(outputDirectory, { recursive: true });
const outputPath = resolve(outputDirectory, 'organization-roster-api-audit.json');
await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
console.table(results.map(({ organization, status, ok, rosterRecords, uniquePlayerIds, latencyMs, error }) => ({ organization, status, ok, rosterRecords, uniquePlayerIds, latencyMs, error: error || '' })));
console.log(JSON.stringify({
  organizationsRequested: report.organizationsRequested,
  organizationsAvailable: report.organizationsAvailable,
  aggregateRosterRecords: report.aggregateRosterRecords,
  failures: report.failures.length,
  outputPath,
}, null, 2));
if (report.organizationsAvailable !== organizations.length) process.exitCode = 1;
