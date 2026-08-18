import { afterEach, describe, expect, it, vi } from "vitest";
import handler, { __resetIntelligenceCalculationStateForTests } from "./intelligence-calculations.js";

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

function request(teamId =  DodgersId, season = 2026) {
  return {
    method: "GET",
    url: `/api/intelligence-calculations?teamId=${teamId}&season=${season}`,
    headers: {},
    socket: { remoteAddress: "198.51.100.11" },
  };
}

const DodgersId = 119;
const standingsPayload = {
  records: [{
    teamRecords: [{
      team: { id: DodgersId, name: "Los Angeles Dodgers" },
      wins: 81,
      losses: 45,
      runsScored: 700,
      runsAllowed: 600,
    }],
  }],
};

afterEach(() => {
  vi.unstubAllGlobals();
  __resetIntelligenceCalculationStateForTests();
});

describe("backend intelligence calculations", () => {
  it("calculates transparent season pace and run-based win percentage from MLB standings", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(standingsPayload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = response();

    await handler(request(), result);

    expect(result.statusCode).toBe(200);
    expect(result.body.source).toBe("MLB Stats API");
    expect(result.body.provenance).toBe("calculated-from-verified-standings");
    expect(result.body.freshness).toBe("calculated");
    expect(result.body.metrics).toMatchObject({
      wins: 81,
      losses: 45,
      gamesPlayed: 126,
      projectedWins: 104.14285714285715,
      projectedLosses: 57.85714285714285,
      runsScored: 700,
      runsAllowed: 600,
      runDifferential: 100,
    });
    expect(result.body.metrics.pythagoreanWinPct).toBeCloseTo(0.57006, 5);
    expect(result.body.metrics.pythagoreanProjectedWins).toBeCloseTo(92.35, 2);
    expect(result.body.metrics.pythagoreanProjectedLosses).toBeCloseTo(69.65, 2);
    expect(result.body.metrics).not.toHaveProperty("calculatedPlayoffOdds");
    expect(result.body.metrics.calculatedWarProxy).toBeCloseTo(44.35, 2);
    expect(result.body.methodology.projectedWins).toMatch(/verified win percentage/);
    expect(result.body.methodology.pythagoreanProjectedLosses).toMatch(/162 minus pythagorean projected wins/i);
    expect(result.body.methodology).not.toHaveProperty("calculatedPlayoffOdds");
    expect(result.body.methodology.calculatedWarProxy).toMatch(/not FanGraphs WAR/i);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reuses the same-day calculation snapshot instead of requesting MLB again", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(standingsPayload), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const first = response();
    const second = response();

    await handler(request(), first);
    await handler(request(), second);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.headers["X-Provider-Cache"]).toBe("DAILY");
    expect(second.body.provenance).toBe("calculated-from-verified-standings");
  });

  it("rejects malformed team and season inputs before any upstream request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const result = response();

    await handler({ method: "GET", url: "/api/intelligence-calculations?teamId=bad&season=2026", headers: {}, socket: { remoteAddress: "198.51.100.12" } }, result);

    expect(result.statusCode).toBe(400);
    expect(result.body.error).toMatch(/Valid teamId and season/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not calculate when the verified standings lack wins or losses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ records: [{ teamRecords: [{ team: { id: DodgersId } }] }] }), { status: 200 })));
    const result = response();

    await handler(request(), result);

    expect(result.statusCode).toBe(422);
    expect(result.body.provenance).toBe("calculation-unavailable");
  });
});
