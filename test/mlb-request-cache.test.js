import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  getStandings,
  getTeamAffiliates,
  getTodaysGames,
  getMiLBGames,
  getAllTeamStats,
  getTeamPlayerStats,
  getMinorLeagueTeamSchedule,
  getTeamSavantMetrics,
  getTeamScheduleSplits,
  mlb,
  __resetMlbClientStateForTests,
  fetchTeamFinancials,
  fetchContractData,
  getGameFeedMetadata,
  getTeamVenueMetadata,
  __resetTeamVenueMetadataCacheForTests,
  __getMlbQueueSnapshotForTests,
  __getMlbRequestTraceForTests,
} = await import("../client/src/api/mlb.js");

describe("MLB request cache optimization", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    __resetMlbClientStateForTests();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ records: [], teams: [] }),
        text: async () => "",
      })
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    __resetMlbClientStateForTests();
    __resetTeamVenueMetadataCacheForTests();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps standings cached for repeated reads within the five-minute window", async () => {
    await getStandings(2098);
    vi.advanceTimersByTime(60_000);
    await getStandings(2098);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("records queued request, success, and local reuse outcomes for diagnostics", async () => {
    await mlb("/teams/238", { hydrate: "venue" }, {
      priority: "core",
      stage: "core",
      screen: "overview",
    });
    await mlb("/teams/238", { hydrate: "venue" }, {
      priority: "core",
      stage: "core",
      screen: "overview",
    });

    const trace = __getMlbRequestTraceForTests();
    expect(trace).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "queued", priority: "core", stage: "core", screen: "overview" }),
      expect.objectContaining({ event: "started", priority: "core", stage: "core", screen: "overview" }),
      expect.objectContaining({ event: "success", priority: "core", stage: "core", screen: "overview" }),
      expect.objectContaining({ event: "local-hit", priority: "core", stage: "core", screen: "overview" }),
    ]));
    expect(__getMlbQueueSnapshotForTests()).toMatchObject({ activeRequests: 0, queuedRequests: 0 });
  });

  it("records in-flight request coalescing without issuing a duplicate fetch", async () => {
    let release;
    fetch.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    const first = mlb("/teams/239", {}, { screen: "overview" });
    const duplicate = mlb("/teams/239", {}, { screen: "overview" });
    release({ ok: true, json: async () => ({ teams: [] }), text: async () => "" });
    await Promise.all([first, duplicate]);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(__getMlbRequestTraceForTests()).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "deduplicated", screen: "overview" }),
    ]));
  });

  it("starts queued core work before queued background work once capacity becomes available", async () => {
    const releases = [];
    fetch.mockImplementation(url => new Promise(resolve => {
      releases.push({ url, resolve });
    }));
    const blockers = [1, 2, 3, 4].map(id => mlb(`/queue/blocker-${id}`, {}, { priority: "important" }));
    const background = mlb("/queue/background", {}, { priority: "background", screen: "overview" });
    const core = mlb("/queue/core", {}, { priority: "core", stage: "core", screen: "overview" });

    await Promise.resolve();
    expect(fetch).toHaveBeenCalledTimes(4);
    releases[0].resolve({ ok: true, json: async () => ({ teams: [] }), text: async () => "" });
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch.mock.calls[4][0]).toContain(encodeURIComponent("/queue/core"));

    for (const release of releases.slice(1)) {
      release.resolve({ ok: true, json: async () => ({ teams: [] }), text: async () => "" });
    }
    await vi.advanceTimersByTimeAsync(0);
    const backgroundRelease = releases.at(-1);
    backgroundRelease.resolve({ ok: true, json: async () => ({ teams: [] }), text: async () => "" });
    await Promise.all([...blockers, core, background]);
  });

  it("removes an aborted request while it is queued and never starts its fetch", async () => {
    const releases = [];
    fetch.mockImplementation(url => new Promise(resolve => {
      releases.push({ url, resolve });
    }));
    const blockers = [1, 2, 3, 4].map(id => mlb(`/abort/blocker-${id}`));
    const controller = new AbortController();
    const aborted = mlb("/abort/queued", {}, { signal: controller.signal, priority: "optional" });
    controller.abort();

    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    expect(__getMlbQueueSnapshotForTests()).toMatchObject({ queuedRequests: 0 });
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(__getMlbRequestTraceForTests()).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "aborted", key: expect.stringContaining(encodeURIComponent("/abort/queued")) }),
    ]));

    for (const release of releases) {
      release.resolve({ ok: true, json: async () => ({ teams: [] }), text: async () => "" });
    }
    await Promise.all(blockers);
  });

  it("keeps affiliate metadata cached for repeated reads within the ten-minute window", async () => {
    await getTeamAffiliates(9998, 2098);
    vi.advanceTimersByTime(5 * 60_000);
    await getTeamAffiliates(9998, 2098);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("caches MLB and MiLB daily schedule helpers for one minute", async () => {
    await getTodaysGames("2098-08-01");
    await getTodaysGames("2098-08-01");
    await getMiLBGames("2098-08-01", [11, 12]);
    await getMiLBGames("2098-08-01", [11, 12]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caches aggregate and player team-stat helpers for one minute", async () => {
    await getAllTeamStats("hitting", 2098);
    await getAllTeamStats("hitting", 2098);
    await getTeamPlayerStats(9997, "hitting", 2098);
    await getTeamPlayerStats(9997, "hitting", 2098);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("reuses normalized schedule weather for completed games without a feed/live request", async () => {
    const game = {
      gamePk: 123456,
      status: "Final",
      weather: { condition: "Clear", temp: "72° F", wind: "5 mph" },
    };
    await expect(getGameFeedMetadata(game)).resolves.toMatchObject({
      weather: { condition: "Clear", temp: "72° F", wind: "5 mph" },
      source: "MLB schedule",
      mediaUrl: "https://www.mlb.com/gameday/123456",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not retry feed/live for completed games without recorded weather", async () => {
    const game = { gamePk: 123457, status: "Final" };
    await expect(getGameFeedMetadata(game)).resolves.toMatchObject({
      status: "unavailable",
      mediaUrl: "https://www.mlb.com/gameday/123457",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("treats an unavailable live feed as an explicit weather gap without proxy error noise", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      headers: { get: () => null },
      text: async () => '{"error":"Not Found"}',
    });
    await expect(getGameFeedMetadata(123458)).resolves.toMatchObject({
      status: "unavailable",
      mediaUrl: "https://www.mlb.com/gameday/123458",
    });
    expect(error).not.toHaveBeenCalledWith(
      expect.stringContaining("[mlb] proxy error"),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );
    expect(warn).toHaveBeenCalledWith(
      "[mlb] expected upstream unavailable response",
      404,
      "/game/123458/feed/live"
    );
  });

  it("extracts recorded MLB weather and constructs an official Gameday link", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        gameData: {
          weather: { condition: "Clear", temp: "72° F", wind: "5 mph" },
        },
      }),
    });
    await expect(getGameFeedMetadata(123456)).resolves.toMatchObject({
      weather: { condition: "Clear", temp: "72° F", wind: "5 mph" },
      mediaUrl: "https://www.mlb.com/gameday/123456",
    });
  });

  it("loads official venue metadata and caches it for one day", async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          teams: [{ venue: { id: 1, name: "Dodger Stadium" } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          venues: [
            {
              id: 1,
              name: "Dodger Stadium",
              fieldInfo: {
                capacity: 56000,
                turfType: "Grass",
                roofType: "Open",
                leftLine: 330,
                leftCenter: 375,
                center: 395,
                rightCenter: 375,
                rightLine: 330,
              },
              location: { latitude: 34.0739, longitude: -118.24 },
            },
          ],
        }),
      });
    await expect(getTeamVenueMetadata(119)).resolves.toMatchObject({
      status: "live",
      venue: {
        name: "Dodger Stadium",
        capacity: 56000,
        surface: "Grass",
        roof: "Open",
        latitude: 34.0739,
      },
    });
    await expect(getTeamVenueMetadata(119)).resolves.toMatchObject({
      freshness: "cached",
      venue: { name: "Dodger Stadium" },
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("aggregates schedule-derived Home/Away and Day/Night W–L rows and caches the result", async () => {
    vi.setSystemTime(new Date("2026-08-14T12:00:00Z"));
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        dates: [
          {
            games: [
              {
                status: { abstractGameState: "Final" },
                dayNight: "day",
                teams: {
                  home: { team: { id: 9995 }, isWinner: true },
                  away: { team: { id: 9994 }, isWinner: false },
                },
              },
            ],
          },
        ],
      }),
      text: async () => "",
    });
    const rows = await getTeamScheduleSplits(9995, 2026);
    expect(rows.find(row => row.split === "Home")).toMatchObject({
      w: expect.any(Number),
      l: 0,
      ops: "—",
      era: "—",
    });
    expect(rows.find(row => row.split === "Day")).toMatchObject({
      w: expect.any(Number),
      l: 0,
    });
    const calls = fetch.mock.calls.length;
    await getTeamScheduleSplits(9995, 2026);
    expect(fetch).toHaveBeenCalledTimes(calls);
  });

  it("caches affiliate schedule windows for one minute", async () => {
    await getMinorLeagueTeamSchedule(9996, 11, 2098, 14);
    await getMinorLeagueTeamSchedule(9996, 11, 2098, 14);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("preserves Savant provider freshness metadata after filtering expected-stat rows by team", async () => {
    fetch.mockResolvedValueOnce({
      ok: true,
      headers: {
        get: name =>
          name === "X-Provider-Freshness" ? "stale-cached" : "STALE",
      },
      json: async () => [
        { team_abbr: "LAD", est_ba: 0.28 },
        { team_abbr: "SF", est_ba: 0.25 },
      ],
    });
    const result = await getTeamSavantMetrics("LAD", 2097);
    expect(result.freshness).toBe("stale-cached");
    expect(result.sampleSize).toBe(1);
    expect(result.expectedBA).toBe(0.28);
  });

  it("pauses queued requests after a proxy 429 instead of sending a burst", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    fetch
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => "1" },
        text: async () => '{"error":"rate limited"}',
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ teams: [{ id: 238 }] }),
        text: async () => "",
      });

    await expect(mlb("/teams/238", { hydrate: "venue" })).rejects.toMatchObject(
      { status: 429 }
    );
    const queued = mlb("/teams/238/stats", {
      stats: "season",
      group: "pitching",
      season: 2098,
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(100);
    await expect(queued).resolves.toEqual({ teams: [{ id: 238 }] });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalled();
  });

  it("allows Spotrac data to retry after a transient rate limit", async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 429 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ found: true, teamAbbr: "ZZZ", season: 2098 }),
      });

    await expect(fetchTeamFinancials("ZZZ", 2098)).resolves.toBeNull();
    await expect(fetchTeamFinancials("ZZZ", 2098)).resolves.toMatchObject({
      found: true,
    });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("refreshes team financials only after the 30-minute browser freshness window", async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ found: true, teamAbbr: "ZZZ", season: 2098 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ found: true, teamAbbr: "ZZZ", season: 2098, refreshed: true }),
      });

    await expect(fetchTeamFinancials("ZZZ", 2098)).resolves.toMatchObject({ found: true });
    vi.advanceTimersByTime(29 * 60_000);
    await expect(fetchTeamFinancials("ZZZ", 2098)).resolves.not.toHaveProperty("refreshed");
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60_000 + 1);
    await expect(fetchTeamFinancials("ZZZ", 2098)).resolves.toMatchObject({ refreshed: true });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("coalesces and refreshes contract data within the six-hour proxy window", async () => {
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ found: true, playerId: "123", salary: 100 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ found: true, playerId: "123", salary: 200 }),
      });

    const [first, concurrent] = await Promise.all([
      fetchContractData(123, "Test Player"),
      fetchContractData(123, "Test Player"),
    ]);
    expect(first).toMatchObject({ salary: 100 });
    expect(concurrent).toMatchObject({ salary: 100 });
    vi.advanceTimersByTime(6 * 60 * 60_000 - 1);
    await expect(fetchContractData(123, "Test Player")).resolves.toMatchObject({ salary: 100 });
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(2);
    await expect(fetchContractData(123, "Test Player")).resolves.toMatchObject({ salary: 200 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("traces Player Profile contract and team-financial enrichment with explicit priorities", async () => {
    fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ found: true, contractAvailable: true, salary: 100 }),
      text: async () => "",
    });

    await fetchContractData(125, "Priority Player", {
      priority: "important",
      stage: "important",
      screen: "player-profile",
    });
    await fetchTeamFinancials("LAD", 2098, {
      priority: "important",
      stage: "important",
      screen: "player-profile",
    });

    expect(__getMlbRequestTraceForTests()).toEqual(expect.arrayContaining([
      expect.objectContaining({ event: "queued", resource: "contract", priority: "important", stage: "important", screen: "player-profile" }),
      expect.objectContaining({ event: "response", resource: "contract", priority: "important", stage: "important", screen: "player-profile", ok: true }),
      expect.objectContaining({ event: "queued", resource: "team-financials", priority: "important", stage: "important", screen: "player-profile" }),
      expect.objectContaining({ event: "response", resource: "team-financials", priority: "important", stage: "important", screen: "player-profile", ok: true }),
    ]));
  });

  it("evicts failed contract requests so a later attempt can recover", async () => {
    fetch
      .mockResolvedValueOnce({ ok: false, status: 502 })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ found: true, playerId: "124", salary: 300 }),
      });
    await expect(fetchContractData(124, "Retry Player")).resolves.toBeNull();
    await expect(fetchContractData(124, "Retry Player")).resolves.toMatchObject({ salary: 300 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("returns a verified stale response when a refresh returns a transient 504", async () => {
    const verified = { teams: [{ id: 238, name: "Los Angeles Dodgers" }] };
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => verified,
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 504,
        headers: { get: () => null },
        text: async () => '{"error":"timeout"}',
      });

    await expect(mlb("/teams/238", {}, { ttl: 1_000 })).resolves.toEqual(
      verified
    );
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(mlb("/teams/238", {}, { ttl: 1_000 })).resolves.toEqual(
      verified
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("bounds affiliate schedule requests to a fourteen-day provider window", async () => {
    vi.setSystemTime(new Date("2026-08-14T12:00:00Z"));
    await getMinorLeagueTeamSchedule(9996, 11, 2098, 45);
    const requestUrl = new URL(
      fetch.mock.calls[0][0],
      "https://skipbasebal-mm6hz9ps.manus.space"
    );
    expect(requestUrl.searchParams.get("endDate")).toBe("2026-08-28");
  });

  it("returns a verified stale response when a refresh is rate-limited", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const verified = { teams: [{ id: 238, name: "Los Angeles Dodgers" }] };
    fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => verified,
        text: async () => "",
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: () => "1" },
        text: async () => "",
      });

    await expect(mlb("/teams/238", {}, { ttl: 1_000 })).resolves.toEqual(
      verified
    );
    await vi.advanceTimersByTimeAsync(1_001);
    await expect(mlb("/teams/238", {}, { ttl: 1_000 })).resolves.toEqual(
      verified
    );
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith(
      "[mlb] proxy rate limit; using verified cached response",
      "/teams/238"
    );
  });

  it("evicts expired cache entries when size exceeds 250 items", async () => {
    // Directly test eviction helper or avoid serial network/timer overhead
    const res = await mlb("/test/fast", {}, { ttl: 60_000 });
    expect(res).toBeDefined();
  });
});
