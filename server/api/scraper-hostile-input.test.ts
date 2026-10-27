/*
Our goal is to make sure the rest of our scrapers (contracts, payroll, playoff odds, player names) stay fast on a cut-off or
garbled page, the same way our WAR readers do in html-parser-hostile-input.test.ts. Every pattern below used to re-read the rest
of the page once for each opening tag that never got closed.

To solve this we are going to:
  1. Build one nasty page for each reader (thousands of unclosed tables, rows, cells or links, and runs of tags with no ">")
  2. Time each reader on its nasty page and require it to stay under a limit (BUDGET_MS)
  3. Cross-check the three helper functions in html-scan.js on small pages we can check by hand

Each page below took between 0.7 and 12 seconds before we fixed the patterns. Our limit is far above what the fixed code needs,
so a slow computer will not fail the test by accident.
*/
import { describe, expect, it } from "vitest";
import { parseBRefTable, parseSpotracTable } from "./contract.js";
import { parsePlayoffStatusOddsHtml } from "./playoffstatus-odds.js";
import { parseBaseballReferencePlayerPageName, parseBaseballReferenceSearchCandidates } from "./player-identity.js";
import { parseTeamPayrollHtml, parseTeamTaxHtml } from "./team-financials.js";
import { closedBlocks, firstClosedBlock, ROW_BLOCK, ROW_CLOSE, upToLastClose } from "./html-scan.js";

// Section A: Inputs

const N = 20_000;                                       // How many broken tags we put on each nasty page
const BUDGET_MS = 300;                                  // The most time any one reader may take, in milliseconds

function timeInMs(fn: () => unknown) {
  const start = performance.now();                      // The clock before we start
  fn();                                                 // Run the reader
  return performance.now() - start;                     // How much the clock moved
}


// Section B: Nasty pages must still be fast

describe("remaining scrapers stay fast on hostile or truncated HTML", () => {
  it.each([
    // Spotrac and Baseball-Reference contract tables
    ["Spotrac: unclosed #table tables", () => parseSpotracTable('<table id="table">'.repeat(N), "Juan Soto")],
    ["Spotrac: unclosed rows/cells", () => parseSpotracTable('<table id="table"><tbody>' + "<tr><td>".repeat(N) + "</tbody></table>", "Juan Soto")],
    ["Baseball-Reference contracts: unclosed tables", () => parseBRefTable('<table id="largest_contracts">'.repeat(N), "Juan Soto")],
    ["Baseball-Reference contracts: unclosed rows", () => parseBRefTable('<table id="largest_contracts"><tbody>' + "<tr>".repeat(N) + "</tbody></table>", "Juan Soto")],
    ["Baseball-Reference contracts: unclosed data-stat cells", () => parseBRefTable('<table id="largest_contracts"><tbody><tr>' + '<td data-stat="player">x'.repeat(N) + "</tr></tbody></table>", "Juan Soto")],

    // Team payroll, luxury tax and playoff odds
    ["payroll: unclosed tables", () => parseTeamPayrollHtml("<table>".repeat(N), "SD", 2026)],
    ["payroll: unclosed cells", () => parseTeamPayrollHtml("<table><tbody><tr>" + "<td>".repeat(N) + "</tr></tbody></table>", "SD", 2026)],
    ["tax: unclosed tables", () => parseTeamTaxHtml("<table>".repeat(N), "SD", 2026)],
    ["tax: unclosed rows", () => parseTeamTaxHtml("<table><tbody>" + "<tr>".repeat(N) + "</tbody></table>", "SD", 2026)],
    ["playoff odds: unclosed tables", () => parsePlayoffStatusOddsHtml("<table>".repeat(N), "SD")],

    // Player name lookups
    ["identity search: unclosed anchors", () => parseBaseballReferenceSearchCandidates('<a href="/players/a/b.shtml">x'.repeat(N))],
    ["identity search: a run of <a with no '>'", () => parseBaseballReferenceSearchCandidates("<a".repeat(N * 3))],
    ["identity page name: unclosed <h1", () => parseBaseballReferencePlayerPageName("<h1>".repeat(N))],
    ["identity page name: a run of <h1 with no '>'", () => parseBaseballReferencePlayerPageName("<h1".repeat(N * 3))],
  ])("%s", (_label, fn) => {
    expect(timeInMs(fn)).toBeLessThan(BUDGET_MS);
  });
});


// Section C: Cross-checking our three helper functions on small pages

describe("html-scan helpers", () => {
  it("upToLastClose keeps everything through the last closer and drops the unclosed tail", () => {
    expect(upToLastClose("<tr>a</tr><tr>b</TR><tr>c", ROW_CLOSE)).toBe("<tr>a</tr><tr>b</TR>");   // Capital letters count too, and the unclosed <tr>c is dropped
    expect(upToLastClose("<tr>no closer", ROW_CLOSE)).toBe("");                                    // No closing tag at all, nothing is left
    expect(upToLastClose(null, ROW_CLOSE)).toBe("");                                               // Missing text is treated as empty
  });

  it("closedBlocks matches the plain regex for well-formed markup and ignores an unclosed tail", () => {
    const html = '<tr class="a"><td>1</td></tr>\n<tr><td>2</td></tr><tr><td>3';                    // Two finished rows and one that never closes
    const found = closedBlocks(html, ROW_BLOCK, ROW_CLOSE).map(match => match[1]);                  // What is inside each finished row
    expect(found).toEqual(["<td>1</td>", "<td>2</td>"]);

    const plainRegexFound = [...html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => match[1]);   // The ordinary pattern, for comparison
    expect(found).toEqual(plainRegexFound);                                                         // On a well-formed page they agree
  });

  it("firstClosedBlock returns the first block or null", () => {
    const heading = /<h1\b[^<>]*>([\s\S]*?)<\/h1>/i;                                                // A heading and its closing pattern
    const headingClose = /<\/h1>/gi;
    expect(firstClosedBlock("<h1 id=x>Hi <b>there</b></h1><h1>no</h1>", heading, headingClose)?.[1]).toBe("Hi <b>there</b>");
    expect(firstClosedBlock("<h1>never closed", heading, headingClose)).toBeNull();                // A heading that never closes is not a block
  });
});
