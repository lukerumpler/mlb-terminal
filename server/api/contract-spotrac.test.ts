import { describe, expect, it } from "vitest";
import { parseSpotracTable } from "./contract.js";

// Column map (from the parser): Rank(th) Player Team Pos Years Total AAV Expires.
// Regression: `bestCandidate` was assigned but never declared, so the first matching
// row threw a ReferenceError (swallowed by the handler's try/catch), and Spotrac, the
// primary contract source, never returned a match.
const row = (rank: number, player: string, team: string, years: number, total: string, aav: string, expires: string) =>
  `<tr><th>${rank}</th><td>${player}</td><td>${team}</td><td>OF</td><td>${years}</td><td>${total}</td><td>${aav}</td><td>${expires}</td></tr>`;

const page = (rows: string) =>
  `<html><body><table id="table" class="datatable"><thead><tr><th>Rk</th><th>Player</th><th>Team</th><th>Pos</th><th>Yrs</th><th>Value</th><th>AAV</th><th>Expires</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;

describe("parseSpotracTable", () => {
  it("returns the matching contract instead of throwing", () => {
    const html = page(
      row(1, "Juan Soto", "NYM", 15, "$765,000,000", "$51,000,000", "2039") +
        row(2, "Shohei Ohtani", "LAD", 10, "$700,000,000", "$70,000,000", "2033")
    );
    const result = parseSpotracTable(html, "Juan Soto");
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
    const html = page(row(1, "Juan Soto", "NYM", 15, "$765,000,000", "$51,000,000", "2039") + row(2, "Shohei Ohtani", "LAD", 10, "$700,000,000", "$70,000,000", "2033"));
    expect(parseSpotracTable(html, "Shohei Ohtani")).toMatchObject({ found: true, player: "Shohei Ohtani", team: "LAD", years: 10 });
  });

  it("returns null (not an exception) when no row is an acceptable match", () => {
    expect(parseSpotracTable(page(row(1, "Juan Soto", "NYM", 15, "$765,000,000", "$51,000,000", "2039")), "Zzyzx Qwertyuiop")).toBeNull();
    expect(parseSpotracTable("<html>no table</html>", "Juan Soto")).toBeNull();
  });
});
