import { PROSPECT_BATTERS, PROSPECT_PITCHERS, TEAMS } from '../client/src/constants/data.js';

const teamById = new Map(Object.values(TEAMS).map(team => [team.id, team]));
const normalizeName = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const records = [...PROSPECT_BATTERS, ...PROSPECT_PITCHERS].map(row => ({
  id: row.mlbId,
  expectedName: row.name,
  expectedTeam: row.team,
  expectedLevel: row.level,
  kind: PROSPECT_BATTERS.includes(row) ? 'hitter' : 'pitcher',
}));

async function getPerson(record) {
  const url = `https://statsapi.mlb.com/api/v1/people/${record.id}?hydrate=currentTeam`;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const body = await response.json();
    const person = body.people?.[0];
    return {
      ...record,
      ok: response.ok && Boolean(person),
      status: response.status,
      actualName: person?.fullName ?? null,
      actualTeam: person?.currentTeam?.abbreviation ?? null,
      actualTeamName: person?.currentTeam?.name ?? null,
      parentOrgId: person?.currentTeam?.parentOrgId ?? person?.currentTeam?.id ?? null,
      position: person?.primaryPosition?.abbreviation ?? null,
      birthDate: person?.birthDate ?? null,
      parentOrgAbbr: teamById.get(person?.currentTeam?.parentOrgId ?? person?.currentTeam?.id)?.abbr ?? null,
      nameMatches: person ? normalizeName(person.fullName) === normalizeName(record.expectedName) : false,
      teamMatches: person ? teamById.get(person.currentTeam?.parentOrgId ?? person.currentTeam?.id)?.abbr === record.expectedTeam : false,
      teamPresent: Boolean(person?.currentTeam),
    };
  } catch (error) {
    return { ...record, ok: false, status: null, error: error.message };
  }
}

const results = [];
for (const record of records) results.push(await getPerson(record));
const summary = {
  auditedAt: new Date().toISOString(),
  source: 'https://statsapi.mlb.com/api/v1/people/{mlbId}?hydrate=currentTeam',
  total: results.length,
  resolved: results.filter(row => row.ok).length,
  unresolved: results.filter(row => !row.ok).length,
  nameMismatches: results.filter(row => row.ok && !row.nameMatches).length,
  missingCurrentTeam: results.filter(row => row.ok && !row.teamPresent).length,
  teamMismatches: results.filter(row => row.ok && !row.teamMatches).length,
  results,
};
console.log(JSON.stringify(summary, null, 2));
