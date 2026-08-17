import { afterEach, describe, expect, it, vi } from "vitest";
import handler, {
  __resetIntelligenceCalculationStateForTests,
  calculateAllStandingsIntelligence,
} from "./intelligence-calculations.js";

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: any;
  setHeader: (name: string, value: string) => void;
  status: (code: number) => MockResponse;
  json: (payload: unknown) => MockResponse;
  end: () => MockResponse;
};

function response(): MockResponse {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) { this.headers[name] = String(value); },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    end() { return this; },
  };
}

const DodgersId = 119;
const season = 2026;

function request(teamId = DodgersId, requestSeason = season) {
  return {
    method: "GET",
    url: `/api/intelligence-calculations?teamId=${teamId}&season=${requestSeason}`,
    headers: {},
    socket: { remoteAddress: "198.51.100.11" },
  };
}

function allRequest(requestSeason = season) {
  return {
    method: "GET",
    url: `/api/intelligence-calculations?mode=all&season=${requestSeason}`,
    headers: {},
    socket: { remoteAddress: "198.51.100.12" },
  };
}

function buildThirtyTeamStandings() {
  const divisions = [
    { league:103, division:200, label:"AL East" },
    { league:103, division:201, label:"AL Central" },
    { league:103, division:202, label:"AL West" },
    { league:104, division:203, label:"NL West" },
    { league:104, division:204, label:"NL East" },
    { league:104, division:205, label:"NL Central" },
  ];
  const records = divisions.flatMap((group, divisionIndex) => [0, 1, 2, 3, 4].map(rank => {
    const isDodgers = group.division === 203 && rank === 0;
    const wins = isDodgers ? 81 : 86 - divisionIndex - rank * 5;
    const losses = isDodgers ? 45 : 40 + divisionIndex + rank * 5;
    return {
      team: {
        id: isDodgers ? DodgersId : 1000 + divisionIndex * 10 + rank,
        name: isDodgers ? "Los Angeles Dodgers" : `${group.label} Team ${rank + 1}`,
      },
      division: { id:group.division },
      league: { id:group.league },
      wins,
      losses,
      runsScored: isDodgers ? 700 : 690 - divisionIndex * 8 - rank * 17,
      runsAllowed: isDodgers ? 600 : 610 + divisionIndex * 6 + rank * 11,
    };
  }));
  return { records:[{ teamRecords:records }] };
}

const standingsPayload = buildThirtyTeamStandings();

afterEach(() => {
  vi.unstubAllGlobals();
  __resetIntelligenceCalculationStateForTests();
});

describe("backend intelligence calculations", () => {
  it("calculates transparent season pace and run-based win percentage from MLB standings", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(standingsPayload), { status:200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = response();

    await handler(request(), result);

    expect(result.statusCode).toBe(200);
    expect(result.body.source).toBe("MLB Stats API");
    expect(result.body.provenance).toBe("calculated-from-verified-standings");
    expect(result.body.freshness).toBe("calculated");
    expect(result.body.metrics).toMatchObject({
      wins:81,
      losses:45,
      gamesPlayed:126,
      projectedWins:104.14285714285715,
      projectedLosses:57.85714285714285,
      runsScored:700,
      runsAllowed:600,
      runDifferential:100,
    });
    expect(result.body.metrics.pythagoreanWinPct).toBeCloseTo(0.57006, 5);
    expect(result.body.metrics.teamWarProxy).toBeGreaterThan(0);
    expect(result.body.metrics.playoffProbability).toBeGreaterThan(0);
    expect(result.body.metrics.playoffProbability).toBeLessThanOrEqual(100);
    expect(result.body.methodology.teamWarProxy).toMatch(/not FanGraphs Team WAR/);
    expect(result.body.methodology.playoffProbability).toMatch(/three-Wild-Card cutline/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("calculates playoff and Team WAR proxy results for all 30 MLB teams from one standings response", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(standingsPayload), { status:200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = response();

    await handler(allRequest(), result);

    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      totalStandingsTeams:30,
      calculatedTeams:30,
      playoffEligibleCalculations:30,
      teamWarProxyCalculations:30,
    });
    expect(result.body.teams).toHaveLength(30);
    expect(new Set(result.body.teams.map(team => team.teamId)).size).toBe(30);
    expect(result.body.teams.every(team => team.metrics.playoffProbability >= 0 && team.metrics.playoffProbability <= 100)).toBe(true);
    expect(result.body.teams.every(team => Number.isFinite(team.metrics.teamWarProxy))).toBe(true);
    expect(result.body.teams.some(team => team.playoffProjection.projectedDivisionRank > 1 && team.metrics.wildCardProbability > 0)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns deterministic clinched and eliminated outcomes once all 162 games are complete", () => {
    const finalStandings = structuredClone(standingsPayload);
    for (const row of finalStandings.records[0].teamRecords) {
      row.losses = 162 - row.wins;
    }

    const summary = calculateAllStandingsIntelligence(finalStandings, season);
    const clinched = summary.teams.find(team => team.playoffProjection?.projectedDivisionRank === 1);
    const eliminated = summary.teams.find(team => team.playoffProjection?.projectedDivisionRank > 1 && team.playoffProjection?.projectedWildCardRank > 3);

    expect(clinched?.playoffProjection).toMatchObject({ seasonComplete:true, divisionTitleProbability:100 });
    expect(clinched?.metrics.playoffProbability).toBe(100);
    expect(eliminated?.playoffProjection).toMatchObject({ seasonComplete:true, wildCardProbability:0 });
    expect(eliminated?.metrics.playoffProbability).toBe(0);
    expect(clinched?.methodology.playoffProbability).toMatch(/completed-season standings placement/);
  });

  it("keeps a team calculation available while leaving only its unsupported proxy metric null", () => {
    const incompleteRuns = structuredClone(standingsPayload);
    const target = incompleteRuns.records[0].teamRecords.find(row => row.team.id === DodgersId);
    delete target.runsScored;
    delete target.runsAllowed;

    const summary = calculateAllStandingsIntelligence(incompleteRuns, season);
    const dodgers = summary.teams.find(team => team.teamId === DodgersId);

    expect(summary.calculatedTeams).toBe(30);
    expect(summary.playoffEligibleCalculations).toBe(30);
    expect(summary.teamWarProxyCalculations).toBe(29);
    expect(dodgers?.metrics.playoffProbability).toBeGreaterThan(0);
    expect(dodgers?.metrics.teamWarProxy).toBeNull();
    expect(dodgers?.methodology.teamWarProxy).toBeNull();
  });

  it("reuses one same-day all-team snapshot for individual and all-team requests", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(standingsPayload), { status:200 }));
    vi.stubGlobal("fetch", fetchMock);
    const first = response();
    const second = response();

    await handler(allRequest(), first);
    await handler(request(), second);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.headers["X-Provider-Cache"]).toBe("DAILY");
    expect(second.body.teamId).toBe(DodgersId);
  });

  it("rejects malformed team and season inputs before any upstream request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = response();

    await handler({ method:"GET", url:"/api/intelligence-calculations?teamId=bad&season=2026", headers:{}, socket:{ remoteAddress:"198.51.100.13" } }, result);

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toMatch(/Valid teamId and season/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not calculate when the verified standings lack wins or losses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ records:[{ teamRecords:[{ team:{ id: DodgersId } }] }] }), { status:200 })));
    const result = response();

    await handler(request(), result);

    expect(result.statusCode).toBe(422);
    expect(result.body.provenance).toBe("calculation-unavailable");
  });
});
