import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetMlbClientStateForTests,
  getTeamAggregateWar,
  getTeamModelSources,
} from "../client/src/api/mlb.js";

afterEach(() => {
  vi.unstubAllGlobals();
  __resetMlbClientStateForTests();
});

describe("browser provider request cache", () => {
  it("reuses FanGraphs model responses within the provider TTL", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      found: true,
      teamWar: 42.4,
      playoffOdds: 88.1,
      statuses: { teamWar: "live", playoffOdds: "live" },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    await getTeamModelSources("LAD", 2026);
    await getTeamModelSources("LAD", 2026);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("coalesces concurrent aggregate WAR requests", async () => {
    let resolveResponse;
    const responsePromise = new Promise(resolve => { resolveResponse = resolve; });
    const fetchMock = vi.fn(() => responsePromise);
    vi.stubGlobal("fetch", fetchMock);

    const first = getTeamAggregateWar("Los Angeles Dodgers", ["Los Angeles Dodgers"], 2026);
    const second = getTeamAggregateWar("Los Angeles Dodgers", ["Los Angeles Dodgers"], 2026);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    resolveResponse(new Response(JSON.stringify({
      teams: [{ team: "Los Angeles Dodgers", totalWAR: 42.4, battingWAR: 24.3, pitchingWAR: 18.1 }],
      freshness: "live",
    }), { status: 200, headers: { "content-type": "application/json" } }));

    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ teamWar: 42.4, divisionAverageWAR: 42.4 }),
      expect.objectContaining({ teamWar: 42.4, divisionAverageWAR: 42.4 }),
    ]);
  });
});
