import { afterEach, describe, expect, it, vi } from "vitest";
import {
  __resetMlbClientStateForTests,
  __resetFanGraphsLocalSnapshotForTests,
  getTeamAggregateWar,
  getTeamModelSources,
} from "../client/src/api/mlb.js";

afterEach(() => {
  vi.unstubAllGlobals();
  __resetMlbClientStateForTests();
  __resetFanGraphsLocalSnapshotForTests();
  localStorage.clear();
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

  it("serves the last verified model snapshot when FanGraphs refresh returns 502", async () => {
    const success = new Response(JSON.stringify({
      found: true,
      teamWar: 42.4,
      playoffOdds: 88.1,
      statuses: { teamWar: "live", playoffOdds: "live" },
    }), { status: 200, headers: { "content-type": "application/json" } });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(success)
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "FanGraphs model sources unavailable" }), { status: 502 }));
    vi.stubGlobal("fetch", fetchMock);

    await getTeamModelSources("LAD", 2026);
    __resetMlbClientStateForTests();
    const fallback = await getTeamModelSources("LAD", 2026);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fallback).toEqual(expect.objectContaining({ found: true, teamWar: 42.4, playoffOdds: 88.1, freshness: "stale-local" }));
    expect(fallback.staleAgeMs).toBeGreaterThanOrEqual(0);
  });

  it("retries after a failed stale refresh and replaces the snapshot after success", async () => {
    localStorage.setItem("skip-fangraphs-model-snapshot-v1:/api/fangraphs-models?team=LAD&season=2026", JSON.stringify({
      savedAt: Date.now() - 60 * 60_000,
      data: { found: true, teamWar: 40.1, playoffOdds: 80.2 },
    }));
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("temporary failure", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ found: true, teamWar: 42.4, playoffOdds: 88.1, freshness: "live" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const stale = await getTeamModelSources("LAD", 2026);
    __resetMlbClientStateForTests();
    const fresh = await getTeamModelSources("LAD", 2026);

    expect(stale.freshness).toBe("stale-local");
    expect(stale.teamWar).toBe(40.1);
    expect(fresh.freshness).toBe("live");
    expect(fresh.teamWar).toBe(42.4);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serves a stale snapshot briefly after a failed refresh, then tries the server again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-12T10:00:00Z"));
    try {
      localStorage.setItem("skip-fangraphs-model-snapshot-v1:/api/fangraphs-models?team=LAD&season=2026", JSON.stringify({
        savedAt: Date.now() - 60 * 60_000,
        data: { found: true, teamWar: 40.1, playoffOdds: 80.2 },
      }));
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(new Response("temporary failure", { status: 502 }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ found: true, teamWar: 42.4, playoffOdds: 88.1, freshness: "live" }), { status: 200 }));
      vi.stubGlobal("fetch", fetchMock);

      expect((await getTeamModelSources("LAD", 2026)).freshness).toBe("stale-local");
      // Inside the window the stale answer is reused without hitting the server again.
      vi.setSystemTime(new Date("2026-10-12T10:10:00Z"));
      expect((await getTeamModelSources("LAD", 2026)).freshness).toBe("stale-local");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      // After the window a recovered server is picked up; the tab is not pinned to stale until midnight.
      vi.setSystemTime(new Date("2026-10-12T10:16:00Z"));
      const fresh = await getTeamModelSources("LAD", 2026);
      expect(fresh.freshness).toBe("live");
      expect(fresh.teamWar).toBe(42.4);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not use a local snapshot older than seven days", async () => {
    localStorage.setItem("skip-fangraphs-model-snapshot-v1:/api/fangraphs-models?team=LAD&season=2026", JSON.stringify({
      savedAt: Date.now() - 8 * 24 * 60 * 60_000,
      data: { found: true, teamWar: 42.4, playoffOdds: 88.1 },
    }));
    vi.stubGlobal("fetch", vi.fn(async () => new Response("upstream unavailable", { status: 502 })));

    const result = await getTeamModelSources("LAD", 2026);

    expect(result.found).toBe(false);
    expect(result.teamWar).toBeNull();
    expect(result.statuses.teamWar).toBe("request-failed");
  });

  it("keeps model and aggregate local snapshots in separate shapes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ found: true, teamWar: 42.4, playoffOdds: 88.1 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ teams: [{ team: "Los Angeles Dodgers", totalWAR: 42.4, battingWAR: 24.3, pitchingWAR: 18.1 }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await getTeamModelSources("LAD", 2026);
    await getTeamAggregateWar("Los Angeles Dodgers", ["Los Angeles Dodgers"], 2026);

    expect(JSON.parse(localStorage.getItem("skip-fangraphs-model-snapshot-v1:/api/fangraphs-models?team=LAD&season=2026")).data.teamWar).toBe(42.4);
    expect(JSON.parse(localStorage.getItem("skip-fangraphs-aggregate-snapshot-v1:/api/fangraphs-models?mode=aggregate&season=2026")).data.teams).toHaveLength(1);
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

  // Regression test: a genuine transport-level failure (fetch() itself
  // rejecting - offline, DNS, timeout) previously collapsed to a bare
  // `null` here, discarding status/source/reason detail every other
  // return path from this function provides. It also referenced `url`
  // from inside the try block's scope as a fallback, the same
  // out-of-scope bug fixed upstream in the fallback-only implementation -
  // any failure lacking a structured error payload would have thrown
  // "ReferenceError: url is not defined" instead of returning gracefully.
  it("reports team WAR as an unavailable object (not null, not a thrown error) when the network request fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));

    const result = await getTeamAggregateWar("Los Angeles Dodgers", ["Los Angeles Dodgers"], 2026);

    expect(result).toEqual(expect.objectContaining({
      status: "unavailable",
      teamWar: null,
      sourceUrl: "/api/fangraphs-models?mode=aggregate&season=2026",
    }));
  });
});
