/*
Our goal is to make sure the Spotrac contract reader actually returns a player's contract. It never did before: one line gave
a name to a value it had not created yet, so the very first matching row crashed the reader. Our request handler catches that
kind of crash, so nobody saw an error. Spotrac, our main contract source, just quietly never matched anyone and every request
fell through to the backup sources.

To solve this we are going to:
  1. Build a small Spotrac-style page with the same columns the real reader expects
  2. Check that a player we ask for comes back with the right team, years, total and average salary
  3. Check that it picks the closest name when there are several rows
  4. Cross-check the "no match" cases: we must get null back, never a crash

The columns, in order, are: Rank (a header cell), Player, Team, Position, Years, Total, AAV, Expires.
*/
import { describe, expect, it } from "vitest";
import { parseSpotracTable } from "./contract.js";

// Section A: Building our fake page

function row(rank: number, player: string, team: string, years: number, total: string, aav: string, expires: string) {
  return (
    `<tr><th>${rank}</th><td>${player}</td><td>${team}</td><td>OF</td>` +       // Every player is an outfielder, the reader does not care
    `<td>${years}</td><td>${total}</td><td>${aav}</td><td>${expires}</td></tr>`
  );
}

function page(rows: string) {
  const header = "<thead><tr><th>Rk</th><th>Player</th><th>Team</th><th>Pos</th><th>Yrs</th><th>Value</th><th>AAV</th><th>Expires</th></tr></thead>";
  return `<html><body><table id="table" class="datatable">${header}<tbody>${rows}</tbody></table></body></html>`;
}

const SOTO = row(1, "Juan Soto", "NYM", 15, "$765,000,000", "$51,000,000", "2039");           // Two real-looking rows we reuse below
const OHTANI = row(2, "Shohei Ohtani", "LAD", 10, "$700,000,000", "$70,000,000", "2033");


// Section B: Our checks

describe("parseSpotracTable", () => {
  it("returns the matching contract instead of throwing", () => {
    const result = parseSpotracTable(page(SOTO + OHTANI), "Juan Soto");
    expect(result).toMatchObject({
      found: true,
      source: "Spotrac",
      player: "Juan Soto",
      team: "NYM",
      years: 15,
      total: 765_000_000,
      aav: 51_000_000,
    });
  });

  it("picks the closest name among several rows", () => {
    expect(parseSpotracTable(page(SOTO + OHTANI), "Shohei Ohtani")).toMatchObject({
      found: true,
      player: "Shohei Ohtani",
      team: "LAD",
      years: 10,
    });
  });

  it("returns null (not an exception) when no row is an acceptable match", () => {
    expect(parseSpotracTable(page(SOTO), "Zzyzx Qwertyuiop")).toBeNull();           // A name nobody has
    expect(parseSpotracTable("<html>no table</html>", "Juan Soto")).toBeNull();     // A page with no table at all
  });
});
