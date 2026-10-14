/*
Our goal is to make sure the code that reads our WAR pages (FanGraphs, Baseball-Reference) stays fast even when a page arrives
cut off or garbled. We read these pages with regular expressions, and the old patterns re-read the rest of the page once for
every opening tag that never got closed, so the work grew with the square of the page size. A page full of stray tags could
keep our server busy for many seconds.

To solve this we are going to:
  1. Build nasty pages: thousands of unclosed tables, a long run of "<td" with no ">", and a truncated page that is only "<" signs
  2. Time how long each of our readers takes on those pages and require it to stay under a limit (BUDGET_MS)
  3. Cross-check that normal, well-formed pages still read exactly the way they did before
  4. Check that no scraper in server/api still uses the slow tag-stripping pattern

Each nasty page below took between 1 and 10 seconds before we fixed the patterns. Our limit is far above what the fixed code
needs, so a slow computer will not fail the test by accident.
*/
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

// Section A: Inputs

const SEASON = 2026;
const BUDGET_MS = 300;                                  // The most time any one reader may take, in milliseconds

function timed(fn: () => unknown) {
  /*
  Our "timed" is a function that runs one reader and tells us how long it took. When we give it:
                  a function to run
  it returns to us:
                  how many milliseconds it took (ms) and whatever the function returned (value)
  */
  const start = performance.now();                      // The clock before we start
  const value = fn();                                   // Run the reader
  return { ms: performance.now() - start, value };      // How much the clock moved
}


// Section B: Nasty pages must still be fast

describe("parsers stay fast on hostile or truncated HTML", () => {
  it("FanGraphs: thousands of unclosed <table", () => {
    const html = "<table>".repeat(20_000);                                       // 20,000 tables that never close
    const { ms, value } = timed(() => parseFanGraphsAggregateWarHtml({ battingHtml: html, pitchingHtml: html }, SEASON));
    expect(ms).toBeLessThan(BUDGET_MS);
    expect((value as { teams: unknown[] }).teams).toEqual([]);                   // No real data on this page, so no teams
  });

  it("FanGraphs: a long run of <td with no closing '>'", () => {
    const html = "<table><tr>" + "<td".repeat(40_000) + "</tr></table>";         // 40,000 half-written cell tags
    expect(timed(() => parseFanGraphsAggregateWarHtml({ battingHtml: html, pitchingHtml: html }, SEASON)).ms).toBeLessThan(BUDGET_MS);
  });

  it("FanGraphs: thousands of unclosed <tr>/<td> inside one table", () => {
    const html = "<table>" + "<tr><td>".repeat(30_000) + "</table>";             // 30,000 rows and cells that never close
    expect(timed(() => parseFanGraphsAggregateWarHtml({ battingHtml: html, pitchingHtml: html }, SEASON)).ms).toBeLessThan(BUDGET_MS);
  });

  it("Baseball-Reference team table: unclosed <table and unclosed <tr", () => {
    const unclosedTables = "<table>".repeat(20_000);
    const unclosedRows = "<table>" + "<tr>".repeat(30_000) + "</table>";
    expect(timed(() => parseBaseballReferenceTeamWarHtml(unclosedTables, SEASON)).ms).toBeLessThan(BUDGET_MS);
    expect(timed(() => parseBaseballReferenceTeamWarHtml(unclosedRows, SEASON)).ms).toBeLessThan(BUDGET_MS);
  });

  it("Baseball-Reference identity: thousands of unclosed player anchors", () => {
    const html = '<a href="/players/a/b.shtml">x'.repeat(20_000);                // 20,000 player links that never close
    const { ms, value } = timed(() => parseBaseballReferenceIdentity(html, "Nobody Here"));
    expect(ms).toBeLessThan(BUDGET_MS);
    expect(value).toBeNull();                                                    // Nobody matches, and we should say so
  });

  it("Baseball-Reference identity: a run of <a with no '>'", () => {
    expect(timed(() => parseBaseballReferenceIdentity("<a".repeat(60_000), "Nobody Here")).ms).toBeLessThan(BUDGET_MS);
  });

  it("player advanced: a long run of '<' with no '>' (truncated page)", () => {
    const { ms, value } = timed(() => parseBaseballReferenceAdvanced("<".repeat(60_000), SEASON, { currentSeason: SEASON }));
    expect(ms).toBeLessThan(BUDGET_MS);
    expect(value).toMatchObject({ war: null, status: "unavailable" });           // Nothing readable means "unavailable", never a made-up 0
  });
});


// Section C: Normal pages must read exactly as before

describe("well-formed pages are parsed exactly as before", () => {
  it("still reads a normal player summary after hostile-input hardening", () => {
    const html = "<div><b>WAR</b> -0.5 <i>12.4</i> wRC+ 98 101</div>";           // A negative WAR with tags in between
    expect(parseBaseballReferenceAdvanced(html, SEASON, { currentSeason: SEASON })).toMatchObject({ war: -0.5, wrcPlus: 98 });
  });

  it("still finds a player anchor whose text contains markup", () => {
    const html = '<p>x</p><a href="/players/t/test01.shtml"><span>Test</span> Player</a>';
    expect(parseBaseballReferenceIdentity(html, "Test Player")).toMatchObject({ id: "test01" });
  });
});


// Section D: No scraper may bring the slow pattern back
// The same tag-stripper pattern, one that starts with "<" and runs until the next ">", appears in many scrapers.
// We look through the source of every file in server/api and fail if any of them still uses the slow form.

describe("no scraper uses the quadratic tag-stripping regex", () => {
  it("every server/api module strips tags with a non-nesting character class", () => {
    const dir = new URL(".", import.meta.url).pathname;                          // The server/api folder
    const offenders: string[] = [];                                              // Files that still use the slow pattern
    for (const file of readdirSync(dir).filter(name => name.endsWith(".js"))) {
      const source = readFileSync(join(dir, file), "utf8");
      if (/\/<\[\^>\][+*]>\/g/.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);                                               // We want an empty list
  });
});
