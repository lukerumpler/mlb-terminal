import { afterEach, describe, expect, it, vi } from "vitest";
import handler, {
  __resetPlayoffStatusOddsStateForTests,
  parsePlayoffStatusOddsHtml,
} from "./playoffstatus-odds.js";

function response() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: undefined as any,
    setHeader(name: string, value: string) { this.headers[name] = String(value); },
    status(code: number) { this.statusCode = code; return this; },
    json(payload: unknown) { this.body = payload; return this; },
    end() { return this; },
  };
}

const sampleHtml = `
  <p>Tue Aug 18 12:15 am</p>
  <table><tr><th>Team</th><th>League</th><th>W</th><th>L</th><th>Wildcard Series</th></tr>
  <tr><td>Dodgers</td><td>National</td><td>75</td><td>51</td><td>&gt;99%</td></tr></table>`;

afterEach(() => {
  vi.unstubAllGlobals();
  __resetPlayoffStatusOddsStateForTests();
});

describe("secondary postseason probability source", () => {
  it("parses the provider’s Wild Card Series probability and update text without manufacturing a new estimate", () => {
    expect(parsePlayoffStatusOddsHtml(sampleHtml, "LAD")).toMatchObject({
      found: true,
      source: "PlayoffStatus",
      teamName: "Dodgers",
      playoffOddsDisplay: ">99%",
      providerUpdatedText: "Tue Aug 18 12:15 am",
    });
  });

  it("returns a source-labeled verified response for a matching team", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(sampleHtml, { status: 200 })));
    const result = response();
    await handler({ method: "GET", url: "/api/playoffstatus-odds?team=LAD", headers: {}, socket: { remoteAddress: "198.51.100.45" } }, result);
    expect(result.statusCode).toBe(200);
    expect(result.body).toMatchObject({
      found: true,
      source: "PlayoffStatus",
      teamAbbr: "LAD",
      playoffOddsDisplay: ">99%",
    });
    expect(["live", "cached"]).toContain(result.body.freshness);
  });
});
