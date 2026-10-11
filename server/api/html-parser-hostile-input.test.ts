import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseBaseballReferenceTeamWarHtml,
  parseFanGraphsAggregateWarHtml,
} from "./fangraphs-models.js";
import {
  parseBaseballReferenceAdvanced,
  parseBaseballReferenceIdentity,
} from "./player-advanced.js";

// These parsers read whole third-party pages with regexes. A truncated or garbled
// response must cost milliseconds, not seconds: the old patterns rescanned the rest
// of the document once per unclosed opener (quadratic). Sizes below took 1-10 s
// before the fix; the bound is generous so a slow CI runner does not flake.
const SEASON = 2026;
const BUDGET_MS = 300;

function timed(fn: () => unknown) {
  const start = performance.now();
  const value = fn();
  return { ms: performance.now() - start, value };
}

describe("parsers stay fast on hostile or truncated HTML", () => {
  it("FanGraphs: thousands of unclosed <table", () => {
    const html = "<table>".repeat(20_000);
    const { ms, value } = timed(() => parseFanGraphsAggregateWarHtml({ battingHtml: html, pitchingHtml: html }, SEASON));
    expect(ms).toBeLessThan(BUDGET_MS);
    expect((value as { teams: unknown[] }).teams).toEqual([]);
  });

  it("FanGraphs: a long run of <td with no closing '>'", () => {
    const html = "<table><tr>" + "<td".repeat(40_000) + "</tr></table>";
    expect(timed(() => parseFanGraphsAggregateWarHtml({ battingHtml: html, pitchingHtml: html }, SEASON)).ms).toBeLessThan(BUDGET_MS);
  });

  it("FanGraphs: thousands of unclosed <tr>/<td> inside one table", () => {
    const html = "<table>" + "<tr><td>".repeat(30_000) + "</table>";
    expect(timed(() => parseFanGraphsAggregateWarHtml({ battingHtml: html, pitchingHtml: html }, SEASON)).ms).toBeLessThan(BUDGET_MS);
  });

  it("Baseball-Reference team table: unclosed <table and unclosed <tr", () => {
    expect(timed(() => parseBaseballReferenceTeamWarHtml("<table>".repeat(20_000), SEASON)).ms).toBeLessThan(BUDGET_MS);
    expect(timed(() => parseBaseballReferenceTeamWarHtml("<table>" + "<tr>".repeat(30_000) + "</table>", SEASON)).ms).toBeLessThan(BUDGET_MS);
  });

  it("Baseball-Reference identity: thousands of unclosed player anchors", () => {
    const html = '<a href="/players/a/b.shtml">x'.repeat(20_000);
    const { ms, value } = timed(() => parseBaseballReferenceIdentity(html, "Nobody Here"));
    expect(ms).toBeLessThan(BUDGET_MS);
    expect(value).toBeNull();
  });

  it("Baseball-Reference identity: a run of <a with no '>'", () => {
    expect(timed(() => parseBaseballReferenceIdentity("<a".repeat(60_000), "Nobody Here")).ms).toBeLessThan(BUDGET_MS);
  });

  it("player advanced: a long run of '<' with no '>' (truncated page)", () => {
    const { ms, value } = timed(() => parseBaseballReferenceAdvanced("<".repeat(60_000), SEASON, { currentSeason: SEASON }));
    expect(ms).toBeLessThan(BUDGET_MS);
    expect(value).toMatchObject({ war: null, status: "unavailable" });
  });
});

describe("well-formed pages are parsed exactly as before", () => {
  it("still reads a normal player summary after hostile-input hardening", () => {
    const html = "<div><b>WAR</b> -0.5 <i>12.4</i> wRC+ 98 101</div>";
    expect(parseBaseballReferenceAdvanced(html, SEASON, { currentSeason: SEASON })).toMatchObject({ war: -0.5, wrcPlus: 98 });
  });

  it("still finds a player anchor whose text contains markup", () => {
    const html = '<p>x</p><a href="/players/t/test01.shtml"><span>Test</span> Player</a>';
    expect(parseBaseballReferenceIdentity(html, "Test Player")).toMatchObject({ id: "test01" });
  });
});

// The same `<[^>]+>` tag-stripper appears across the scrapers. Keep the linear form.
describe("no scraper uses the quadratic tag-stripping regex", () => {
  it("every server/api module strips tags with a non-nesting character class", () => {
    const dir = new URL(".", import.meta.url).pathname;
    const offenders: string[] = [];
    for (const file of readdirSync(dir).filter(name => name.endsWith(".js"))) {
      const source = readFileSync(join(dir, file), "utf8");
      if (/\/<\[\^>\][+*]>\/g/.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
