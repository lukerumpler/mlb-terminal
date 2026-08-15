import { afterEach, describe, expect, it, vi } from "vitest";
import fangraphsHandler, {
  __resetFanGraphsProviderStateForTests,
} from "./fangraphs-models.js";
import savantHandler, { __resetSavantStateForTests } from "./savant.js";
import ncaaHandler from "./ncaa.js";

type MockResponse = {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
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
    setHeader(name, value) {
      this.headers[name] = String(value);
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

function req(url: string) {
  const parsed = new URL(url, "https://skipbasebal-mm6hz9ps.manus.space");
  return {
    method: "GET",
    url,
    query: Object.fromEntries(parsed.searchParams.entries()),
    headers: {
      origin: "https://skipbasebal-mm6hz9ps.manus.space",
      "x-forwarded-for": "198.51.100.33",
    },
    socket: { remoteAddress: "198.51.100.33" },
  };
}

function html(team: string, odds: string, war: string) {
  return `<table><tr><th>Team</th><th>Playoff Odds</th><th>Team WAR</th></tr><tr><td>${team}</td><td>${odds}</td><td>${war}</td></tr></table>`;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  __resetSavantStateForTests();
  __resetFanGraphsProviderStateForTests();
});

describe("FanGraphs provider cache", () => {
  it("coalesces identical model loads and serves the second read from cache", async () => {
    const fetchMock = vi.fn(
      async (url: string) =>
        new Response(html("TST", "72.4%", "18.2"), {
          status: 200,
          headers: { "content-type": "text/html" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = response();
    const second = response();
    await fangraphsHandler(
      req("/api/fangraphs-models?team=TST&season=2099"),
      first
    );
    await fangraphsHandler(
      req("/api/fangraphs-models?team=TST&season=2099"),
      second
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.statusCode).toBe(200);
    expect(second.headers["X-Provider-Cache"]).toBe("HIT");
    expect((second.body as { freshness: string }).freshness).toBe("cached");
  });

  it("cools down repeated FanGraphs model failures instead of reopening both sources immediately", async () => {
    const fetchMock = vi.fn(async () => {
      throw Object.assign(new Error("FanGraphs unavailable"), { status: 502 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const first = response();
    await fangraphsHandler(
      req("/api/fangraphs-models?team=LAD&season=2093"),
      first
    );
    const second = response();
    await fangraphsHandler(
      req("/api/fangraphs-models?team=LAD&season=2093"),
      second
    );
    expect(first.statusCode).toBe(502);
    expect(second.statusCode).toBe(503);
    expect(second.headers["Retry-After"]).toBeDefined();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("serves a verified stale model when FanGraphs returns 429 after cache expiry", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(html("STA", "61.0%", "11.4"), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(html("STA", "61.0%", "11.4"), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response("busy", { status: 429, headers: { "Retry-After": "9" } })
      )
      .mockResolvedValueOnce(
        new Response("busy", { status: 429, headers: { "Retry-After": "9" } })
      );
    vi.stubGlobal("fetch", fetchMock);
    const seeded = response();
    await fangraphsHandler(
      req("/api/fangraphs-models?team=STA&season=2098"),
      seeded
    );
    vi.advanceTimersByTime(15 * 60_000 + 1);
    const stale = response();
    await fangraphsHandler(
      req("/api/fangraphs-models?team=STA&season=2098"),
      stale
    );
    expect(stale.statusCode).toBe(200);
    expect(stale.headers["X-Provider-Cache"]).toBe("STALE");
    expect((stale.body as { freshness: string }).freshness).toBe(
      "stale-cached"
    );
    expect((stale.body as { playoffOdds: number }).playoffOdds).toBe(61);
  });
});

describe("NCAA proxy error handling", () => {
  it("returns the upstream status without serializing the response object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("NOT_FOUND", { status: 404 }))
    );
    const result = response();
    await ncaaHandler(req("/api/ncaa?path=/scores"), result);
    expect(result.statusCode).toBe(404);
    expect(result.body).toMatchObject({
      error: "NCAA API responded with 404",
      url: "https://ncaa-api.henrygd.me/scores",
    });
  });
});

describe("Baseball Savant provider cache", () => {
  it("serves repeated leaderboard reads from the provider cache", async () => {
    const csv = "player_id,launch_speed\n1,96.2\n";
    const fetchMock = vi.fn(
      async () =>
        new Response(csv, {
          status: 200,
          headers: { "content-type": "text/csv" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const first = response();
    const second = response();
    const url = "/api/savant?endpoint=team_exit_velocity&year=2097&team=TST";
    await savantHandler(req(url), first);
    await savantHandler(req(url), second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(second.headers["X-Provider-Cache"]).toBe("HIT");
    expect(second.body).toEqual([
      {
        launch_speed: 96.2,
        launch_angle: null,
        launch_speed_angle: null,
        bb_type: null,
        events: null,
        game_date: null,
      },
    ]);
  });

  it("trims verified team batted-ball rows for spray and contact rollups", async () => {
    const csv =
      "hc_x,hc_y,bb_type,launch_speed,estimated_woba_using_speedangle,events\n125,210,fly_ball,101.4,0.512,home_run\n";
    const fetchMock = vi.fn(
      async () =>
        new Response(csv, {
          status: 200,
          headers: { "content-type": "text/csv" },
        })
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = response();
    await savantHandler(
      req("/api/savant?endpoint=team_batted_balls&year=2095&team=LAD"),
      result
    );
    expect(result.statusCode).toBe(200);
    expect(result.body).toEqual([
      {
        hc_x: 125,
        hc_y: 210,
        bb_type: "fly_ball",
        launch_speed: 101.4,
        launch_angle: null,
        launch_speed_angle: null,
        xwoba: 0.512,
        events: "home_run",
      },
    ]);
  });

  it("serves verified stale Savant rows when a refresh connection terminates", async () => {
    vi.useFakeTimers();
    const csv = "player_id,launch_speed\n1,96.2\n";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(csv, {
          status: 200,
          headers: { "content-type": "text/csv" },
        })
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("terminated"), { name: "AbortError" })
      );
    vi.stubGlobal("fetch", fetchMock);
    const url = "/api/savant?endpoint=team_exit_velocity&year=2094&team=LAX";
    const first = response();
    await savantHandler(req(url), first);
    vi.advanceTimersByTime(60 * 60_000 + 1);
    const stale = response();
    await savantHandler(req(url), stale);
    expect(stale.statusCode).toBe(200);
    expect(stale.headers["X-Provider-Cache"]).toBe("STALE");
    expect(stale.headers["X-Provider-Freshness"]).toBe("stale-cached");
    expect(stale.body).toEqual([
      {
        launch_speed: 96.2,
        launch_angle: null,
        launch_speed_angle: null,
        bb_type: null,
        events: null,
        game_date: null,
      },
    ]);
  });

  it("returns a bounded 429 with Retry-After when no verified Savant fallback exists", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response("busy", { status: 429, headers: { "Retry-After": "8" } })
    );
    vi.stubGlobal("fetch", fetchMock);
    const result = response();
    await savantHandler(req("/api/savant?endpoint=oaa&year=2096"), result);
    expect(result.statusCode).toBe(429);
    expect(result.headers["Retry-After"]).toBe("8");
    expect(result.body).toMatchObject({ error: "Savant returned 429" });
  });
});
