import { beforeEach, describe, expect, it, vi } from "vitest";

// Fixture-only: the sandbox cannot reach FanGraphs / Baseball-Reference. What this
// pins down is everything *after* the HTML arrives, for every club: parse -> team
// lookup (including provider abbreviation variants) -> signed WAR values intact.

const { loadAggregateWar, getTeamFinancialSnapshot } = vi.hoisted(() => ({
  loadAggregateWar: vi.fn(),
  getTeamFinancialSnapshot: vi.fn(),
}));

vi.mock("./fangraphs-models.js", async importOriginal => ({
  ...(await importOriginal<typeof import("./fangraphs-models.js")>()),
  loadAggregateWar,
}));
vi.mock("./team-financials.js", () => ({ getTeamFinancialSnapshot }));

import {
  parseBaseballReferenceTeamWarHtml,
  parseFanGraphsAggregateWarHtml,
} from "./fangraphs-models.js";
import {
  __resetTeamEfficiencyStateForTests,
  getTeamEfficiencySnapshot,
} from "./team-efficiency.js";

const SEASON = 2026;

// canonical = what the app asks for; fg = FanGraphs abbreviation; alias = another
// spelling the lookup must also accept; br = Baseball-Reference team name.
const TEAMS = [
  { canonical: "ARI", fg: "ARI", alias: "AZ", br: "Arizona Diamondbacks" },
  { canonical: "ATL", fg: "ATL", alias: "ATL", br: "Atlanta Braves" },
  { canonical: "BAL", fg: "BAL", alias: "BAL", br: "Baltimore Orioles" },
  { canonical: "BOS", fg: "BOS", alias: "BOS", br: "Boston Red Sox" },
  { canonical: "CHC", fg: "CHC", alias: "CHC", br: "Chicago Cubs" },
  { canonical: "CWS", fg: "CHW", alias: "CHW", br: "Chicago White Sox" },
  { canonical: "CIN", fg: "CIN", alias: "CIN", br: "Cincinnati Reds" },
  { canonical: "CLE", fg: "CLE", alias: "CLE", br: "Cleveland Guardians" },
  { canonical: "COL", fg: "COL", alias: "COL", br: "Colorado Rockies" },
  { canonical: "DET", fg: "DET", alias: "DET", br: "Detroit Tigers" },
  { canonical: "HOU", fg: "HOU", alias: "HOU", br: "Houston Astros" },
  { canonical: "KC", fg: "KCR", alias: "KCR", br: "Kansas City Royals" },
  { canonical: "LAA", fg: "LAA", alias: "LAA", br: "Los Angeles Angels" },
  { canonical: "LAD", fg: "LAD", alias: "LAD", br: "Los Angeles Dodgers" },
  { canonical: "MIA", fg: "MIA", alias: "MIA", br: "Miami Marlins" },
  { canonical: "MIL", fg: "MIL", alias: "MIL", br: "Milwaukee Brewers" },
  { canonical: "MIN", fg: "MIN", alias: "MIN", br: "Minnesota Twins" },
  { canonical: "NYM", fg: "NYM", alias: "NYM", br: "New York Mets" },
  { canonical: "NYY", fg: "NYY", alias: "NYY", br: "New York Yankees" },
  { canonical: "OAK", fg: "ATH", alias: "ATH", br: "Athletics" },
  { canonical: "PHI", fg: "PHI", alias: "PHI", br: "Philadelphia Phillies" },
  { canonical: "PIT", fg: "PIT", alias: "PIT", br: "Pittsburgh Pirates" },
  { canonical: "SD", fg: "SDP", alias: "SDP", br: "San Diego Padres" },
  { canonical: "SF", fg: "SFG", alias: "SFG", br: "San Francisco Giants" },
  { canonical: "SEA", fg: "SEA", alias: "SEA", br: "Seattle Mariners" },
  { canonical: "STL", fg: "STL", alias: "STL", br: "St. Louis Cardinals" },
  { canonical: "TB", fg: "TBR", alias: "TBR", br: "Tampa Bay Rays" },
  { canonical: "TEX", fg: "TEX", alias: "TEX", br: "Texas Rangers" },
  { canonical: "TOR", fg: "TOR", alias: "TOR", br: "Toronto Blue Jays" },
  { canonical: "WSH", fg: "WSN", alias: "WAS", br: "Washington Nationals" },
];

// Values in tenths of a win so expected numbers are exact. Team 20 totals exactly
// 0.0 (a real zero); teams 21-29 total below zero.
const fgBatTenths = (i: number) => 120 - 6 * i;
const fgPitTenths = (i: number) => 100 - 5 * i;
const brOffTenths = (i: number) => 110 - 6 * i; // oWAR: offence-only, never blended
const brBatTenths = (i: number) => 130 - 6 * i; // position-player WAR, comparable to FanGraphs batting WAR
const brPitTenths = (i: number) => 96 - 5 * i;
// Mean of two providers' tenths; the fixtures are built so the sum is always even.
const blendTenths = (a: number, b: number) => (a + b) / 2 / 10;
const brFldTenths = (i: number) => 20 - i; // goes negative too
const brTotalTenths = (i: number) => 225 - 11 * i;

// Negative values the way providers actually print them, rotated per team.
function printed(tenths: number, i: number) {
  const abs = (Math.abs(tenths) / 10).toFixed(1);
  if (tenths >= 0) return abs;
  return [`\u2212${abs}`, `-${abs}`, `\u2013${abs}`, `(${abs})`, `\u2014${abs}`][i % 5];
}

const fgTable = (tenths: (i: number) => number) =>
  `<table><tr><th>#</th><th>Team</th><th>WAR</th></tr>${TEAMS.map(
    (team, i) => `<tr><td>${i + 1}</td><td>${team.fg}</td><td>${printed(tenths(i), i)}</td></tr>`
  ).join("")}<tr><td></td><td>Total</td><td>999.9</td></tr></table>`;

const brTable = () =>
  `<table><thead><tr><th></th><th colspan="5">Position players / pitchers</th><th></th></tr>` +
  `<tr><th>Rk</th><th>Tm</th><th>oWAR</th><th>Batting WAR</th><th>pWAR</th><th>Fld</th><th>WAR</th></tr></thead><tbody>${TEAMS.map(
    (team, i) =>
      `<tr><th>${i + 1}</th><td><a href="/teams/${team.fg}/${SEASON}.shtml">${team.br}</a></td>` +
      `<td>${printed(brOffTenths(i), i)}</td><td>${printed(brBatTenths(i), i + 4)}</td>` +
      `<td>${printed(brPitTenths(i), i + 1)}</td>` +
      `<td>${printed(brFldTenths(i), i + 2)}</td><td>${printed(brTotalTenths(i), i + 3)}</td></tr>`
  ).join("")}<tr><td>Lg Avg</td><td>Average</td><td>1</td><td>1</td><td>1</td><td>1</td><td>999.9</td></tr></tbody></table>`;

const fgParsed = () =>
  parseFanGraphsAggregateWarHtml(
    { battingHtml: fgTable(fgBatTenths), pitchingHtml: fgTable(fgPitTenths) },
    SEASON
  );
const brParsed = () => parseBaseballReferenceTeamWarHtml(brTable(), SEASON);

function mockProviders({ fanGraphsBlocked = false } = {}) {
  const fgTeams = fanGraphsBlocked ? [] : fgParsed().teams;
  const brTeams = brParsed();
  const fanGraphs = fanGraphsBlocked ? null : { source: "FanGraphs", teams: fgTeams };
  const baseballReference = { source: "Baseball-Reference", teams: brTeams };
  loadAggregateWar.mockResolvedValue({
    data: {
      ...(fanGraphsBlocked ? baseballReference : fanGraphs),
      season: SEASON,
      freshness: "live",
      providerSnapshots: { fanGraphs, baseballReference },
    },
    cache: "MISS",
  });
}

beforeEach(() => {
  __resetTeamEfficiencyStateForTests();
  loadAggregateWar.mockReset();
  getTeamFinancialSnapshot.mockReset();
  getTeamFinancialSnapshot.mockResolvedValue({
    found: true,
    source: "Spotrac",
    freshness: "live",
    payroll: { payroll: 150_000_000 },
  });
});

describe("parsers on a full 30-team table", () => {
  it("FanGraphs: 30 distinct teams, no total row, every sign intact", () => {
    const { teams } = fgParsed();
    expect(teams).toHaveLength(30);
    expect(new Set(teams.map(team => team.team)).size).toBe(30);
    TEAMS.forEach((team, i) => {
      const row = teams.find(item => item.team === team.fg)!;
      expect(row.battingWAR).toBe(fgBatTenths(i) / 10);
      expect(row.pitchingWAR).toBe(fgPitTenths(i) / 10);
      expect(row.totalWAR).toBe((fgBatTenths(i) + fgPitTenths(i)) / 10);
    });
  });

  it("Baseball-Reference: 30 distinct teams, no average row, split columns and signs intact", () => {
    const teams = brParsed();
    expect(teams).toHaveLength(30);
    expect(new Set(teams.map(team => team.team)).size).toBe(30);
    TEAMS.forEach((team, i) => {
      const row = teams.find(item => item.team === team.br)!;
      expect(row.totalWAR).toBe(brTotalTenths(i) / 10);
      expect(row.battingWAR).toBe(brBatTenths(i) / 10);
      expect(row.offensiveWAR).toBe(brOffTenths(i) / 10);
      expect(row.pitchingWAR).toBe(brPitTenths(i) / 10);
      expect(row.defensiveWAR).toBe(brFldTenths(i) / 10);
    });
  });
});

describe("team efficiency for every club, both providers present", () => {
  it.each(TEAMS.map((team, i) => [team.canonical, i] as const))(
    "%s keeps exact signed fWAR and bWAR and blends the comparable split",
    async (canonical, i) => {
      mockProviders();
      const record = await getTeamEfficiencySnapshot(canonical, SEASON);
      expect(record.teamAbbreviation).toBe(canonical);
      expect(record.war.fWAR).toBe((fgBatTenths(i) + fgPitTenths(i)) / 10);
      expect(record.war.bWAR).toBe(brTotalTenths(i) / 10);
      // Both providers publish position-player and pitcher WAR, so each is the mean of the two.
      expect(record.war.offensive).toBe(blendTenths(fgBatTenths(i), brBatTenths(i)));
      expect(record.war.pitching).toBe(blendTenths(fgPitTenths(i), brPitTenths(i)));
      expect(record.war.splitProvider).toBe("FanGraphs + Baseball-Reference");
      // oWAR is offence-only (no defense) and must not leak into either blend.
      expect(record.war.offensive).not.toBe(blendTenths(fgBatTenths(i), brOffTenths(i)));
      // The crowd view carries every provider's number and how far apart they are.
      expect(record.war.consensus.providerCount).toBe(2);
      expect(record.war.consensus.total.sources.map(source => source.provider)).toEqual(["FanGraphs", "Baseball-Reference"]);
      expect(record.war.consensus.total.spread).toBe(0.5);
      expect(record.war.consensus.agreement).toBe("high");
      // Whatever the total rule is, it must sit between the two providers' values
      // and a negative-WAR club must never be reported as a positive one.
      const lo = Math.min(record.war.fWAR, record.war.bWAR);
      const hi = Math.max(record.war.fWAR, record.war.bWAR);
      expect(record.war.total).toBeGreaterThanOrEqual(lo);
      expect(record.war.total).toBeLessThanOrEqual(hi);
      if (record.war.fWAR < 0 && record.war.bWAR < 0) expect(record.war.total).toBeLessThan(0);
      // Salary-per-WAR only exists for a positive total; the WAR itself is still shown.
      expect(record.found).toBe(record.war.total > 0);
    }
  );

  it.each(TEAMS.map((team, i) => [team.alias, team.canonical, i] as const))(
    "provider spelling %s resolves to %s",
    async (alias, canonical, i) => {
      mockProviders();
      const record = await getTeamEfficiencySnapshot(alias, SEASON);
      expect(record.teamAbbreviation).toBe(canonical);
      expect(record.war.bWAR).toBe(brTotalTenths(i) / 10);
      expect(record.war.fWAR).toBe((fgBatTenths(i) + fgPitTenths(i)) / 10);
    }
  );

  it("a team at exactly 0.0 WAR is a real zero, not a missing value", async () => {
    mockProviders();
    const record = await getTeamEfficiencySnapshot(TEAMS[20].canonical, SEASON);
    expect(record.war.fWAR).toBe(0);
    expect(record.war.fWAR).not.toBeNull();
  });
});

describe("team efficiency for every club, FanGraphs blocked", () => {
  it.each(TEAMS.map((team, i) => [team.canonical, i] as const))(
    "%s falls back to Baseball-Reference and leaves fWAR unavailable (null, not 0)",
    async (canonical, i) => {
      mockProviders({ fanGraphsBlocked: true });
      const record = await getTeamEfficiencySnapshot(canonical, SEASON);
      expect(record.war.fWAR).toBeNull();
      expect(record.war.bWAR).toBe(brTotalTenths(i) / 10);
      expect(record.war.total).toBe(brTotalTenths(i) / 10);
      expect(record.war.offensive).toBe(brBatTenths(i) / 10);
      expect(record.war.pitching).toBe(brPitTenths(i) / 10);
      expect(record.war.splitProvider).toBe("Baseball-Reference");
      expect(record.war.consensus.agreement).toBe("single-source");
      expect(record.efficiency.range).toBeNull();
      expect(record.war.provider).toBe("Baseball-Reference");
    }
  );
});
