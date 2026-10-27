/*
Our goal is to make sure the player WAR and wRC+ numbers we read off a Baseball-Reference player page are right: they keep their
minus signs, they are never invented when the page has nothing, and they are never shown under the wrong season. Before we fixed
this, a negative WAR was lost, the wRC+ was never found at all, and last season's numbers could be labeled as another year's.

To solve this we are going to:
  1. Build small made-up pages that contain the stat lines the real page prints (a WAR pair is "this season, then career")
  2. Read each page with our real parser and check the numbers, including negatives, a real zero and a Unicode minus sign
  3. Check the season rule: the page only shows the most recent season, so for any other season we return no number
  4. Cross-check the whole request handler: it must return the player's id even when it has to hold the numbers back

We can't reach Baseball-Reference from our test setup, so these pages are made up. They test our reading rules, not the real
website's layout.
*/
import { afterEach, describe, expect, it, vi } from "vitest";
import playerAdvancedHandler, { parseBaseballReferenceAdvanced } from "./player-advanced.js";
import { currentMlbSeason } from "../season.ts";

// Section A: Inputs

const page = (body: string) => `<html><body><div class="summary">${body}</div></body></html>`;   // Wrap some stat text in a small page
const NOW = currentMlbSeason();                                                                   // The season the page can honestly represent


// Section B: Reading the numbers

describe("player WAR / wRC+ parsing keeps the sign", () => {
  it("reads a positive pair (current season first)", () => {
    expect(parseBaseballReferenceAdvanced(page("WAR 5.2 41.3 wRC+ 142 118"), NOW, { currentSeason: NOW })).toMatchObject({
      war: 5.2,                                                                    // The first number is this season, the second is career
      wrcPlus: 142,
      status: "live",
    });
  });

  it("reads a negative current-season WAR", () => {
    expect(parseBaseballReferenceAdvanced(page("WAR -0.5 12.4"), NOW, { currentSeason: NOW }).war).toBe(-0.5);
  });

  it("reads a positive season WAR when the career figure is negative", () => {
    expect(parseBaseballReferenceAdvanced(page("WAR 0.3 -1.2"), NOW, { currentSeason: NOW }).war).toBe(0.3);       // This used to come back unavailable
  });

  it("reads a Unicode-minus negative", () => {
    expect(parseBaseballReferenceAdvanced(page("WAR \u22120.5 \u22121.2"), NOW, { currentSeason: NOW }).war).toBe(-0.5);   // A real minus sign, not a hyphen
  });

  it("reads a negative wRC+ and keeps a real zero WAR", () => {
    const parsed = parseBaseballReferenceAdvanced(page("WAR 0.0 3.1 wRC+ -5 40"), NOW, { currentSeason: NOW });
    expect(parsed.war).toBe(0);                                                    // Zero is a real answer, not "missing"
    expect(parsed.wrcPlus).toBe(-5);
  });

  it("does not match WAR inside a longer word", () => {
    expect(parseBaseballReferenceAdvanced(page("SWAR 3 4 and later WAR 1.5 2.5"), NOW, { currentSeason: NOW }).war).toBe(1.5);   // SWAR is not WAR
  });

  it("is unavailable, not zero, when nothing parses", () => {
    expect(parseBaseballReferenceAdvanced(page("no stats here"), NOW, { currentSeason: NOW })).toMatchObject({
      war: null,
      wrcPlus: null,
      status: "unavailable",
    });
  });
});


// Section C: Only the season the page can represent

describe("player WAR is only labeled with the season the page can represent", () => {
  it("returns no value for a past season instead of mislabeling the latest one", () => {
    const parsed = parseBaseballReferenceAdvanced(page("WAR 5.2 41.3 wRC+ 142 118"), NOW - 3, { currentSeason: NOW });   // We ask for 3 seasons ago
    expect(parsed).toMatchObject({ season: NOW - 3, war: null, wrcPlus: null, status: "unavailable" });
    expect(parsed.note).toMatch(/most recent season/i);                            // And we explain why
  });

  it("still returns the value for the current season", () => {
    expect(parseBaseballReferenceAdvanced(page("WAR 5.2 41.3"), NOW, { currentSeason: NOW }).war).toBe(5.2);
  });
});


// Section D: The whole request handler

describe("player-advanced handler", () => {
  afterEach(() => vi.unstubAllGlobals());                                          // Put the real fetch back

  async function call(season: number, html: string) {
    /*
    Our "call" is a function that sends one request to our handler and gives back what it answered. When we give it:
                    a season and the page text our fake Baseball-Reference should return
    it returns to us:
                    the answer (the JSON body) the handler sent back
    */
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { status: 200 })));     // Our fake Baseball-Reference
    const res: any = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() };   // A fake response that records what we send
    await playerAdvancedHandler({ method: "GET", headers: {}, query: { name: "Test Player", season: String(season) } }, res);
    return res.json.mock.calls[0][0];                                              // The first thing the handler sent back
  }

  const html = `<a href="/players/t/testpl01.shtml">Test Player</a> WAR -0.4 2.2 wRC+ 88 101`;   // A player link plus a negative WAR

  it("returns a negative current-season WAR and keeps the player id", async () => {
    const body = await call(NOW, html);
    expect(body.war).toBe(-0.4);
    expect(body.providerIds).toEqual({ baseballReference: "testpl01" });
  });

  it("returns no WAR for a past season but still returns the player id", async () => {
    const body = await call(NOW - 2, html);
    expect(body.war).toBeNull();                                                   // We hold the numbers back for the wrong season
    expect(body.status).toBe("unavailable");
    expect(body.providerIds).toEqual({ baseballReference: "testpl01" });           // But the player's id is still useful, so we keep it
  });
});
