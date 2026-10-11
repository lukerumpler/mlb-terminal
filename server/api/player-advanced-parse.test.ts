import { afterEach, describe, expect, it, vi } from "vitest";
import playerAdvancedHandler, { parseBaseballReferenceAdvanced } from "./player-advanced.js";
import { currentMlbSeason } from "../season.ts";

// Fixture text only. The real page layout is unverified (the sandbox cannot reach
// Baseball-Reference), so these pin the parsing rules, not the live markup.
const page = (body: string) => `<html><body><div class="summary">${body}</div></body></html>`;
const NOW = currentMlbSeason();

describe("player WAR / wRC+ parsing keeps the sign", () => {
  it("reads a positive pair (current season first)", () => {
    expect(parseBaseballReferenceAdvanced(page("WAR 5.2 41.3 wRC+ 142 118"), NOW, { currentSeason: NOW })).toMatchObject({
      war: 5.2,
      wrcPlus: 142,
      status: "live",
    });
  });

  it("reads a negative current-season WAR", () => {
    expect(parseBaseballReferenceAdvanced(page("WAR -0.5 12.4"), NOW, { currentSeason: NOW }).war).toBe(-0.5);
  });

  it("reads a positive season WAR when the career figure is negative", () => {
    expect(parseBaseballReferenceAdvanced(page("WAR 0.3 -1.2"), NOW, { currentSeason: NOW }).war).toBe(0.3);
  });

  it("reads a Unicode-minus negative", () => {
    expect(parseBaseballReferenceAdvanced(page("WAR \u22120.5 \u22121.2"), NOW, { currentSeason: NOW }).war).toBe(-0.5);
  });

  it("reads a negative wRC+ and keeps a real zero WAR", () => {
    const parsed = parseBaseballReferenceAdvanced(page("WAR 0.0 3.1 wRC+ -5 40"), NOW, { currentSeason: NOW });
    expect(parsed.war).toBe(0);
    expect(parsed.wrcPlus).toBe(-5);
  });

  it("does not match WAR inside a longer word", () => {
    expect(parseBaseballReferenceAdvanced(page("SWAR 3 4 and later WAR 1.5 2.5"), NOW, { currentSeason: NOW }).war).toBe(1.5);
  });

  it("is unavailable, not zero, when nothing parses", () => {
    expect(parseBaseballReferenceAdvanced(page("no stats here"), NOW, { currentSeason: NOW })).toMatchObject({
      war: null,
      wrcPlus: null,
      status: "unavailable",
    });
  });
});

describe("player WAR is only labeled with the season the page can represent", () => {
  it("returns no value for a past season instead of mislabeling the latest one", () => {
    const parsed = parseBaseballReferenceAdvanced(page("WAR 5.2 41.3 wRC+ 142 118"), NOW - 3, { currentSeason: NOW });
    expect(parsed).toMatchObject({ season: NOW - 3, war: null, wrcPlus: null, status: "unavailable" });
    expect(parsed.note).toMatch(/most recent season/i);
  });

  it("still returns the value for the current season", () => {
    expect(parseBaseballReferenceAdvanced(page("WAR 5.2 41.3"), NOW, { currentSeason: NOW }).war).toBe(5.2);
  });
});

describe("player-advanced handler", () => {
  afterEach(() => vi.unstubAllGlobals());

  const call = async (season: number, html: string) => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(html, { status: 200 })));
    const res: any = { setHeader: vi.fn(), status: vi.fn().mockReturnThis(), json: vi.fn(), end: vi.fn() };
    await playerAdvancedHandler({ method: "GET", headers: {}, query: { name: "Test Player", season: String(season) } }, res);
    return res.json.mock.calls[0][0];
  };

  const html = `<a href="/players/t/testpl01.shtml">Test Player</a> WAR -0.4 2.2 wRC+ 88 101`;

  it("returns a negative current-season WAR and keeps the player id", async () => {
    const body = await call(NOW, html);
    expect(body.war).toBe(-0.4);
    expect(body.providerIds).toEqual({ baseballReference: "testpl01" });
  });

  it("returns no WAR for a past season but still returns the player id", async () => {
    const body = await call(NOW - 2, html);
    expect(body.war).toBeNull();
    expect(body.status).toBe("unavailable");
    expect(body.providerIds).toEqual({ baseballReference: "testpl01" });
  });
});
