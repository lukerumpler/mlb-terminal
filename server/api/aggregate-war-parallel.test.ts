/*
Our goal is to make sure that when we load the league's team WAR numbers, we ask Baseball-Reference at the same time as
FanGraphs instead of waiting for FanGraphs to finish first. This makes a cold load as slow as the slower website rather
than the two added together. Doing it has to cost us nothing else: no extra requests, and no hidden failures.

To solve this we are going to:
  1. Replace the internet with a fake "fetch" that writes down every address we ask for and lets us choose when each answer arrives
  2. Hold FanGraphs' answers back and check that Baseball-Reference was already asked
  3. Count the requests in each case (both websites fine, FanGraphs blocked) and make sure we never ask for the same page twice
  4. Cross-check the failure cases: a Baseball-Reference failure that arrives early must not crash anything, and when both
     websites fail we still return the same error we always did

We never use a stopwatch here. Each answer is a promise we settle by hand, so the order of events is exact and the test
gives the same result on a slow computer as on a fast one.
*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetFanGraphsProviderStateForTests,
  loadAggregateWar,
} from "./fangraphs-models.js";

// Section A: Inputs

const SEASON = 2026;

function fgTable(rows: Array<[string, string]>) {
  let body = "";                                                                 // We build the table rows one team at a time
  for (let i = 0; i < rows.length; i += 1) {
    const [team, war] = rows[i];
    body += `<tr><td>${i + 1}</td><td>${team}</td><td>${war}</td></tr>`;
  }
  return `<table><tr><th>#</th><th>Team</th><th>WAR</th></tr>${body}</table>`;
}

const FG_BAT = fgTable([["LAD", "30.0"], ["SDP", "20.0"]]);                      // FanGraphs batting page with two teams
const FG_PIT = fgTable([["LAD", "10.0"], ["SDP", "8.0"]]);                       // FanGraphs pitching page with the same two teams
const BR_HTML =
  `<table><thead><tr><th>Rk</th><th>Tm</th><th>WAR</th></tr></thead><tbody>` +  // Baseball-Reference page with the same two teams
  `<tr><th>1</th><td><a href="/teams/LAD/${SEASON}.shtml">Los Angeles Dodgers</a></td><td>38.0</td></tr>` +
  `<tr><th>2</th><td><a href="/teams/SDP/${SEASON}.shtml">San Diego Padres</a></td><td>27.0</td></tr>` +
  `</tbody></table>`;


// Section B: Our fake internet

type Deferred = { promise: Promise<Response>; resolve: (r: Response) => void; reject: (e: unknown) => void };

function deferred(): Deferred {
  /*
  Our "deferred" is a function that makes an answer we have not given yet. When we call it, it returns to us:
                  a promise (the answer that is still on its way) plus a resolve function we call
                  when we decide the answer should arrive
  */
  let resolve!: (r: Response) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<Response>((res, rej) => {
    resolve = res;                                                               // Save the two buttons so the test can press them later
    reject = rej;
  });
  return { promise, resolve, reject };
}

const isBr = (url: string) => url.includes("baseball-reference.com");           // True when the address is a Baseball-Reference one
const isFg = (url: string) => url.includes("fangraphs.com");                     // True when the address is a FanGraphs one
const flush = () => new Promise(resolve => setTimeout(resolve, 0));              // Wait one tick so everything already started can run

let calls: string[];                                                             // Every address our code asked for, in order

beforeEach(() => {
  __resetFanGraphsProviderStateForTests();                                       // Forget any answer or block saved from the last test
  calls = [];
});

afterEach(() => vi.unstubAllGlobals());                                          // Put the real fetch back

function stubFetch(handler: (url: string) => Promise<Response> | Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn((input: unknown) => {
      const url = String(input);
      calls.push(url);                                                           // Write down what we were asked for
      return Promise.resolve(handler(url));                                      // The test decides what comes back
    })
  );
}


// Section C: Our checks

describe("aggregate WAR: Baseball-Reference is fetched in parallel with FanGraphs", () => {
  it("starts the Baseball-Reference request before FanGraphs has responded", async () => {
    const fgBat = deferred();                                                    // FanGraphs' two answers, we hold both back
    const fgPit = deferred();
    stubFetch(url =>
      isBr(url)
        ? new Response(BR_HTML)                                                  // Baseball-Reference answers right away
        : url.includes("stats=bat") ? fgBat.promise : fgPit.promise
    );

    const pending = loadAggregateWar(SEASON);
    await flush();

    // FanGraphs has not answered anything yet, but Baseball-Reference must already have been asked
    expect(calls.filter(isFg)).toHaveLength(2);
    expect(calls.filter(isBr)).toHaveLength(1);

    fgBat.resolve(new Response(FG_BAT));                                         // Now let FanGraphs answer
    fgPit.resolve(new Response(FG_PIT));
    const { data } = await pending;
    expect(data.source).toBe("FanGraphs");
    expect(data.providerSnapshots.fanGraphs.teams).toHaveLength(2);
    expect(data.providerSnapshots.baseballReference.teams).toHaveLength(2);
  });

  it("makes exactly one request per provider URL (no extra upstream traffic)", async () => {
    stubFetch(url => new Response(isBr(url) ? BR_HTML : url.includes("stats=bat") ? FG_BAT : FG_PIT));
    await loadAggregateWar(SEASON);
    expect(calls).toHaveLength(3);                                               // Two FanGraphs pages plus one Baseball-Reference page
    expect(calls.filter(isBr)).toHaveLength(1);
    expect(new Set(calls).size).toBe(3);                                         // No page was asked for twice
  });

  it("falls back to the same single Baseball-Reference request when FanGraphs is blocked", async () => {
    stubFetch(url => (isBr(url) ? new Response(BR_HTML) : new Response("blocked", { status: 403 })));
    const { data } = await loadAggregateWar(SEASON);
    expect(data.source).toBe("Baseball-Reference");                              // Baseball-Reference becomes our main source
    expect(data.providerSnapshots.fanGraphs).toBeNull();
    expect(data.providerSnapshots.baseballReference.teams).toHaveLength(2);
    expect(calls.filter(isBr)).toHaveLength(1);                                  // The one early request is reused, we do not ask again
    expect(calls).toHaveLength(3);
  });

  it("keeps FanGraphs data and reports no bWAR when Baseball-Reference fails first, without an unhandled rejection", async () => {
    const unhandled = vi.fn();                                                   // Counts any failure nobody was waiting for
    process.on("unhandledRejection", unhandled);
    try {
      const fgBat = deferred();
      const fgPit = deferred();
      stubFetch(url =>
        isBr(url)
          ? new Response("nope", { status: 503 })                                // Baseball-Reference fails while FanGraphs is still pending
          : url.includes("stats=bat") ? fgBat.promise : fgPit.promise
      );

      const pending = loadAggregateWar(SEASON);
      await flush();
      await flush();                                                             // By now the failure has happened and nothing is waiting for it yet

      fgBat.resolve(new Response(FG_BAT));
      fgPit.resolve(new Response(FG_PIT));
      const { data } = await pending;
      await flush();
      expect(data.source).toBe("FanGraphs");                                     // We keep the FanGraphs numbers
      expect(data.providerSnapshots.baseballReference).toBeNull();               // And say Baseball-Reference is missing
      expect(data.statuses.baseballReference).toBe("upstream-unavailable");
      expect(unhandled).not.toHaveBeenCalled();                                  // The early failure did not escape as a crash
    } finally {
      process.off("unhandledRejection", unhandled);                              // Always clean up our listener
    }
  });

  it("preserves the error contract when both providers fail", async () => {
    stubFetch(() => new Response("down", { status: 502 }));
    await expect(loadAggregateWar(SEASON)).rejects.toMatchObject({
      status: 502,
      message: "FanGraphs aggregate Team WAR unavailable",                       // The same error we have always returned
    });
  });
});
