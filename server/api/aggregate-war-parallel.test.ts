import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetFanGraphsProviderStateForTests,
  loadAggregateWar,
} from "./fangraphs-models.js";

// Deterministic (no wall-clock timing): each upstream response is a promise the
// test resolves by hand, so ordering can be asserted exactly.
const SEASON = 2026;

const fgTable = (rows: Array<[string, string]>) =>
  `<table><tr><th>#</th><th>Team</th><th>WAR</th></tr>${rows
    .map(([team, war], i) => `<tr><td>${i + 1}</td><td>${team}</td><td>${war}</td></tr>`)
    .join("")}</table>`;
const FG_BAT = fgTable([["LAD", "30.0"], ["SDP", "20.0"]]);
const FG_PIT = fgTable([["LAD", "10.0"], ["SDP", "8.0"]]);
const BR_HTML =
  `<table><thead><tr><th>Rk</th><th>Tm</th><th>WAR</th></tr></thead><tbody>` +
  `<tr><th>1</th><td><a href="/teams/LAD/${SEASON}.shtml">Los Angeles Dodgers</a></td><td>38.0</td></tr>` +
  `<tr><th>2</th><td><a href="/teams/SDP/${SEASON}.shtml">San Diego Padres</a></td><td>27.0</td></tr>` +
  `</tbody></table>`;

type Deferred = { promise: Promise<Response>; resolve: (r: Response) => void; reject: (e: unknown) => void };
function deferred(): Deferred {
  let resolve!: (r: Response) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Response>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}
const isBr = (url: string) => url.includes("baseball-reference.com");
const isFg = (url: string) => url.includes("fangraphs.com");
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

let calls: string[];
beforeEach(() => {
  __resetFanGraphsProviderStateForTests();
  calls = [];
});
afterEach(() => vi.unstubAllGlobals());

function stubFetch(handler: (url: string) => Promise<Response> | Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) => {
      const url = String(input);
      calls.push(url);
      return Promise.resolve(handler(url));
    })
  );
}

describe("aggregate WAR: Baseball-Reference is fetched in parallel with FanGraphs", () => {
  it("starts the Baseball-Reference request before FanGraphs has responded", async () => {
    const fgBat = deferred();
    const fgPit = deferred();
    stubFetch(url =>
      isBr(url)
        ? new Response(BR_HTML)
        : url.includes("stats=bat") ? fgBat.promise : fgPit.promise
    );
    const pending = loadAggregateWar(SEASON);
    await flush();
    // FanGraphs has answered nothing yet, but BR must already be in flight.
    expect(calls.filter(isFg)).toHaveLength(2);
    expect(calls.filter(isBr)).toHaveLength(1);
    fgBat.resolve(new Response(FG_BAT));
    fgPit.resolve(new Response(FG_PIT));
    const { data } = await pending;
    expect(data.source).toBe("FanGraphs");
    expect(data.providerSnapshots.fanGraphs.teams).toHaveLength(2);
    expect(data.providerSnapshots.baseballReference.teams).toHaveLength(2);
  });

  it("makes exactly one request per provider URL (no extra upstream traffic)", async () => {
    stubFetch(url => new Response(isBr(url) ? BR_HTML : url.includes("stats=bat") ? FG_BAT : FG_PIT));
    await loadAggregateWar(SEASON);
    expect(calls).toHaveLength(3);
    expect(calls.filter(isBr)).toHaveLength(1);
    expect(new Set(calls).size).toBe(3);
  });

  it("falls back to the same single Baseball-Reference request when FanGraphs is blocked", async () => {
    stubFetch(url => (isBr(url) ? new Response(BR_HTML) : new Response("blocked", { status: 403 })));
    const { data } = await loadAggregateWar(SEASON);
    expect(data.source).toBe("Baseball-Reference");
    expect(data.providerSnapshots.fanGraphs).toBeNull();
    expect(data.providerSnapshots.baseballReference.teams).toHaveLength(2);
    expect(calls.filter(isBr)).toHaveLength(1);
    expect(calls).toHaveLength(3);
  });

  it("keeps FanGraphs data and reports no bWAR when Baseball-Reference fails first, without an unhandled rejection", async () => {
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const fgBat = deferred();
      const fgPit = deferred();
      stubFetch(url =>
        isBr(url)
          ? new Response("nope", { status: 503 }) // fails while FanGraphs is still pending
          : url.includes("stats=bat") ? fgBat.promise : fgPit.promise
      );
      const pending = loadAggregateWar(SEASON);
      await flush();
      await flush(); // BR has already rejected by now; nothing is awaiting it yet
      fgBat.resolve(new Response(FG_BAT));
      fgPit.resolve(new Response(FG_PIT));
      const { data } = await pending;
      await flush();
      expect(data.source).toBe("FanGraphs");
      expect(data.providerSnapshots.baseballReference).toBeNull();
      expect(data.statuses.baseballReference).toBe("upstream-unavailable");
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });

  it("preserves the error contract when both providers fail", async () => {
    stubFetch(() => new Response("down", { status: 502 }));
    await expect(loadAggregateWar(SEASON)).rejects.toMatchObject({
      status: 502,
      message: "FanGraphs aggregate Team WAR unavailable",
    });
  });
});
