/*
Our goal is to make sure every one of the 30 MLB teams gets its WAR numbers through our code correctly, including teams with
negative WAR and teams that a website spells differently (for example the White Sox are CWS for us, CHW for FanGraphs). We
can't reach FanGraphs or Baseball-Reference from our test setup, so we give our code small made-up pages instead and check
everything that happens AFTER a page arrives.

To solve this we are going to:
  1. Build a FanGraphs page and a Baseball-Reference page that list all 30 teams, using WAR values we chose ourselves
  2. Run those pages through our real parsers and our real team lookup (only the network calls are faked)
  3. Check, for every team, that each WAR value comes out exactly the way we put it in, sign included
  4. Cross-check the backup plan: block FanGraphs and make sure Baseball-Reference alone still works and fWAR says
     "unavailable" (null) instead of a made-up 0
*/
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseBaseballReferenceTeamWarHtml,
  parseFanGraphsAggregateWarHtml,
} from "./fangraphs-models.js";
import {
  __resetTeamEfficiencyStateForTests,
  getTeamEfficiencySnapshot,
} from "./team-efficiency.js";

// Section A: Setting up our fake network calls
// Only the two things that talk to the internet are faked, everything else is the real code

const { loadAggregateWar, getTeamFinancialSnapshot } = vi.hoisted(() => ({
  loadAggregateWar: vi.fn(),                  // Stands in for "download the WAR pages"
  getTeamFinancialSnapshot: vi.fn(),          // Stands in for "download the payroll page"
}));

vi.mock("./fangraphs-models.js", async importOriginal => ({
  ...(await importOriginal<typeof import("./fangraphs-models.js")>()),   // Keep the real parsers
  loadAggregateWar,                                                       // Swap in only the download
}));
vi.mock("./team-financials.js", () => ({ getTeamFinancialSnapshot }));


// Section B: Inputs

const SEASON = 2026;

// canonical = the abbreviation our app asks for, fg = the FanGraphs abbreviation,
// alias = another spelling our lookup also has to accept, br = the Baseball-Reference team name
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

if (TEAMS.length !== 30) {                                                       // Sanity check, the whole point of this file is every club
  throw new Error("We need exactly 30 teams in our table");
}

// Every WAR value below is a whole number of tenths of a win (so 120 means 12.0). Whole numbers keep our expected
// answers exact, with no rounding surprises. i is the team's position in TEAMS, so every team gets different values.
// Team 20 adds up to exactly 0.0 (a real zero) and teams 21 through 29 add up to less than zero.
const fgBatTenths = (i: number) => 120 - 6 * i;        // FanGraphs batting WAR
const fgPitTenths = (i: number) => 100 - 5 * i;        // FanGraphs pitching WAR
const brOffTenths = (i: number) => 110 - 6 * i;        // Baseball-Reference oWAR, offense only, never blended with anything
const brBatTenths = (i: number) => 130 - 6 * i;        // Baseball-Reference position-player WAR, comparable to FanGraphs batting WAR
const brPitTenths = (i: number) => 96 - 5 * i;         // Baseball-Reference pitching WAR
const brFldTenths = (i: number) => 20 - i;             // Baseball-Reference fielding, this one goes negative too
const brTotalTenths = (i: number) => 225 - 11 * i;     // Baseball-Reference total WAR

// The average of two providers' tenths, written as wins. We built the fixtures so the two always add up to an even number.
const blendTenths = (a: number, b: number) => (a + b) / 2 / 10;


// Section C: Building our fake pages

function printed(tenths: number, i: number) {
  /*
  Our "printed" is a function that writes a WAR value the way the websites really print it. When we give it:
                  a value in tenths and the team's position i
  it returns to us:
                  text like "12.0", or for a negative value one of the five ways sites print a minus sign
                  (we rotate through them by team so every style gets tested)
  */
  const absolute = (Math.abs(tenths) / 10).toFixed(1);                           // The value without its sign, like "1.5"
  if (tenths >= 0) {
    return absolute;                                                             // Positive values and zero have no minus sign
  }
  const styles = [
    `\u2212${absolute}`,                                                         // A real minus sign
    `-${absolute}`,                                                              // A plain hyphen
    `\u2013${absolute}`,                                                         // An en dash
    `(${absolute})`,                                                             // Parentheses, like accountants write it
    `\u2014${absolute}`,                                                         // An em dash
  ];
  return styles[i % 5];                                                          // Each team gets the next style in the list
}

function fgTable(tenths: (i: number) => number) {
  let rows = "";                                                                 // We build the table rows one team at a time
  for (let i = 0; i < TEAMS.length; i += 1) {
    rows += `<tr><td>${i + 1}</td><td>${TEAMS[i].fg}</td><td>${printed(tenths(i), i)}</td></tr>`;
  }
  const totalRow = "<tr><td></td><td>Total</td><td>999.9</td></tr>";            // A total row, our code has to ignore this one
  return `<table><tr><th>#</th><th>Team</th><th>WAR</th></tr>${rows}${totalRow}</table>`;
}

function brTable() {
  const header =
    `<thead><tr><th></th><th colspan="5">Position players / pitchers</th><th></th></tr>` +   // A grouped header row, like the real page has
    `<tr><th>Rk</th><th>Tm</th><th>oWAR</th><th>Batting WAR</th><th>pWAR</th><th>Fld</th><th>WAR</th></tr></thead>`;

  let rows = "";                                                                 // We build the table rows one team at a time
  for (let i = 0; i < TEAMS.length; i += 1) {
    const link = `<a href="/teams/${TEAMS[i].fg}/${SEASON}.shtml">${TEAMS[i].br}</a>`;   // The team name is a link, like on the real page
    rows +=
      `<tr><th>${i + 1}</th><td>${link}</td>` +
      `<td>${printed(brOffTenths(i), i)}</td><td>${printed(brBatTenths(i), i + 4)}</td>` +
      `<td>${printed(brPitTenths(i), i + 1)}</td>` +
      `<td>${printed(brFldTenths(i), i + 2)}</td><td>${printed(brTotalTenths(i), i + 3)}</td></tr>`;
  }
  const averageRow = "<tr><td>Lg Avg</td><td>Average</td><td>1</td><td>1</td><td>1</td><td>1</td><td>999.9</td></tr>";   // Our code has to ignore this one

  return `<table>${header}<tbody>${rows}${averageRow}</tbody></table>`;
}


// Section D: Running our fake pages through the real code

const fgParsed = () =>
  parseFanGraphsAggregateWarHtml(
    { battingHtml: fgTable(fgBatTenths), pitchingHtml: fgTable(fgPitTenths) },   // FanGraphs gives batting and pitching on two pages
    SEASON
  );
const brParsed = () => parseBaseballReferenceTeamWarHtml(brTable(), SEASON);     // Baseball-Reference gives everything on one page

function mockProviders({ fanGraphsBlocked = false } = {}) {
  /*
  Our "mockProviders" is a function that decides what our fake download returns. When FanGraphs is blocked it returns
  only Baseball-Reference, otherwise it returns both websites, in the same shape the real download uses.
  */
  const fgTeams = fanGraphsBlocked ? [] : fgParsed().teams;                      // A blocked website gives us no teams at all
  const brTeams = brParsed();
  const fanGraphs = fanGraphsBlocked ? null : { source: "FanGraphs", teams: fgTeams };
  const baseballReference = { source: "Baseball-Reference", teams: brTeams };

  loadAggregateWar.mockResolvedValue({
    data: {
      ...(fanGraphsBlocked ? baseballReference : fanGraphs),                     // The main source is FanGraphs unless it is blocked
      season: SEASON,
      freshness: "live",
      providerSnapshots: { fanGraphs, baseballReference },                       // Both websites, side by side
    },
    cache: "MISS",
  });
}

beforeEach(() => {
  __resetTeamEfficiencyStateForTests();                                          // Forget any answer saved from the last test
  loadAggregateWar.mockReset();
  getTeamFinancialSnapshot.mockReset();
  getTeamFinancialSnapshot.mockResolvedValue({
    found: true,
    source: "Spotrac",
    freshness: "live",
    payroll: { payroll: 150_000_000 },                                           // Every team gets the same payroll, we only care about WAR here
  });
});


// Section E: Our checks

describe("parsers on a full 30-team table", () => {
  it("FanGraphs: 30 distinct teams, no total row, every sign intact", () => {
    const { teams } = fgParsed();
    expect(teams).toHaveLength(30);                                              // The Total row must not count as a team
    expect(new Set(teams.map(team => team.team)).size).toBe(30);                 // No team shows up twice
    TEAMS.forEach((team, i) => {
      const row = teams.find(item => item.team === team.fg)!;
      expect(row.battingWAR).toBe(fgBatTenths(i) / 10);
      expect(row.pitchingWAR).toBe(fgPitTenths(i) / 10);
      expect(row.totalWAR).toBe((fgBatTenths(i) + fgPitTenths(i)) / 10);
    });
  });

  it("Baseball-Reference: 30 distinct teams, no average row, split columns and signs intact", () => {
    const teams = brParsed();
    expect(teams).toHaveLength(30);                                              // The Lg Avg row must not count as a team
    expect(new Set(teams.map(team => team.team)).size).toBe(30);
    TEAMS.forEach((team, i) => {
      const row = teams.find(item => item.team === team.br)!;
      expect(row.totalWAR).toBe(brTotalTenths(i) / 10);
      expect(row.battingWAR).toBe(brBatTenths(i) / 10);
      expect(row.offensiveWAR).toBe(brOffTenths(i) / 10);                        // oWAR is kept in its own field
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

      // Both websites publish position-player and pitcher WAR, so each of those is the average of the two
      expect(record.war.offensive).toBe(blendTenths(fgBatTenths(i), brBatTenths(i)));
      expect(record.war.pitching).toBe(blendTenths(fgPitTenths(i), brPitTenths(i)));
      expect(record.war.splitProvider).toBe("FanGraphs + Baseball-Reference");

      // oWAR leaves out defense, so it must never leak into either average
      expect(record.war.offensive).not.toBe(blendTenths(fgBatTenths(i), brOffTenths(i)));

      // The "crowd view" has to carry each website's number and how far apart they are
      expect(record.war.consensus.providerCount).toBe(2);
      expect(record.war.consensus.total.sources.map(source => source.provider)).toEqual(["FanGraphs", "Baseball-Reference"]);
      expect(record.war.consensus.total.spread).toBe(0.5);
      expect(record.war.consensus.agreement).toBe("high");

      // However we combine the two totals, the answer has to land between them,
      // and a team with negative WAR from both websites can never come out positive
      const low = Math.min(record.war.fWAR, record.war.bWAR);
      const high = Math.max(record.war.fWAR, record.war.bWAR);
      expect(record.war.total).toBeGreaterThanOrEqual(low);
      expect(record.war.total).toBeLessThanOrEqual(high);
      if (record.war.fWAR < 0 && record.war.bWAR < 0) {
        expect(record.war.total).toBeLessThan(0);
      }

      // Dollars per WAR only makes sense for a positive total, the WAR itself is always shown
      expect(record.found).toBe(record.war.total > 0);
    }
  );

  it.each(TEAMS.map((team, i) => [team.alias, team.canonical, i] as const))(
    "provider spelling %s resolves to %s",
    async (alias, canonical, i) => {
      mockProviders();
      const record = await getTeamEfficiencySnapshot(alias, SEASON);             // Ask with the other spelling
      expect(record.teamAbbreviation).toBe(canonical);                           // We still have to find the right team
      expect(record.war.bWAR).toBe(brTotalTenths(i) / 10);
      expect(record.war.fWAR).toBe((fgBatTenths(i) + fgPitTenths(i)) / 10);
    }
  );

  it("a team at exactly 0.0 WAR is a real zero, not a missing value", async () => {
    mockProviders();
    const record = await getTeamEfficiencySnapshot(TEAMS[20].canonical, SEASON);   // Team 20 is the one that adds up to exactly 0.0
    expect(record.war.fWAR).toBe(0);
    expect(record.war.fWAR).not.toBeNull();                                      // Zero is a real answer, null would mean "unknown"
  });
});

describe("team efficiency for every club, FanGraphs blocked", () => {
  it.each(TEAMS.map((team, i) => [team.canonical, i] as const))(
    "%s falls back to Baseball-Reference and leaves fWAR unavailable (null, not 0)",
    async (canonical, i) => {
      mockProviders({ fanGraphsBlocked: true });
      const record = await getTeamEfficiencySnapshot(canonical, SEASON);
      expect(record.war.fWAR).toBeNull();                                        // Unknown, not zero
      expect(record.war.bWAR).toBe(brTotalTenths(i) / 10);
      expect(record.war.total).toBe(brTotalTenths(i) / 10);                      // With one website, the total is just its number
      expect(record.war.offensive).toBe(brBatTenths(i) / 10);
      expect(record.war.pitching).toBe(brPitTenths(i) / 10);
      expect(record.war.splitProvider).toBe("Baseball-Reference");
      expect(record.war.consensus.agreement).toBe("single-source");              // One opinion is not a "crowd"
      expect(record.efficiency.range).toBeNull();                                // So there is no range to show either
      expect(record.war.provider).toBe("Baseball-Reference");
    }
  );
});
