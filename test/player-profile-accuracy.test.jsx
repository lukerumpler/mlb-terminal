import { describe, expect, it } from "vitest";
import {
  formatProfileMetric,
  savantField,
  getLivePerformanceItems,
  metricPopulationPercentile,
  buildSavantPercentileRow,
  buildSavantPercentileAxes,
  normalizeSprayPoint,
  buildRecentGameSeries,
  buildAdvancedMetricTrendSeries,
  MetricSparkline,
} from "../client/src/pages/PlayersPage.jsx";
import { computeAMD } from "../client/src/engine/skip.js";
import {
  selectSeasonSplit,
  normalizeSeasonAdvancedStat,
  normalizeYearByYearAdvancedStats,
  mergeAdvancedMetricSources,
} from "../client/src/api/mlb.js";
import { parseBaseballReferenceAdvanced } from "../server/api/player-advanced.js";
import { percentileLabel } from "../client/src/lib/percentile.js";
import {
  comparisonAxes,
  comparisonIdentity,
} from "../client/src/components/PlayerComparisonModal.jsx";

describe("player profile data accuracy guards", () => {
  it("normalizes the last five verified WAR and wRC+ seasons without filling gaps", () => {
    expect(buildAdvancedMetricTrendSeries([
      { season: 2021, stat: { war: 2.1, wRCPlus: 111 } },
      { season: 2022, stat: { fWAR: 3.4 } },
      { season: 2023, stat: { war: null, wrc_plus: 124 } },
      { season: 2024, stat: { bWAR: 4.2, wRCPlus: 131 } },
      { season: 2025, stat: { war: 5.1, wRCPlus: 142 } },
      { season: 2026, stat: { rWAR: 6.0, wRCPlus: 150 } },
    ])).toEqual([
      { season: 2022, war: 3.4, wrcPlus: null },
      { season: 2023, war: null, wrcPlus: 124 },
      { season: 2024, war: 4.2, wrcPlus: 131 },
      { season: 2025, war: 5.1, wrcPlus: 142 },
      { season: 2026, war: 6.0, wrcPlus: 150 },
    ]);
  });

  it("normalizes official yearByYearAdvanced rows without treating OPS+ as wRC+", () => {
    const rows = normalizeYearByYearAdvancedStats({ stats: [{ group: { displayName: "hitting" }, splits: [
      { season: "2024", stat: { war: 4.2, wRCPlus: 131 } },
      { season: "2025", stat: { OPSPlus: 150 } },
    ] }] });
    expect(rows).toEqual([
      { season: 2024, war: 4.2, wrcPlus: 131, source: "MLB Stats API yearByYearAdvanced", status: "live" },
      { season: 2025, war: null, wrcPlus: null, source: "MLB Stats API yearByYearAdvanced", status: "unavailable" },
    ]);
  });

  it("uses fallback values only for missing primary fields and records per-field provenance", () => {
    expect(mergeAdvancedMetricSources(
      { season: 2026, war: 2.8, wrcPlus: null, source: "MLB Stats API seasonAdvanced" },
      { season: 2026, war: 4.1, wrcPlus: 131, source: "Baseball-Reference player summary" },
    )).toMatchObject({
      war: 2.8,
      wrcPlus: 131,
      provenance: {
        war: "MLB Stats API seasonAdvanced",
        wrcPlus: "Baseball-Reference player summary",
      },
      status: "live",
    });
  });

  it("fills a missing primary WAR field from the verified fallback while keeping wRC+ unavailable", () => {
    const merged = mergeAdvancedMetricSources(
      { season: 2026, war: null, wrcPlus: null, source: "MLB Stats API seasonAdvanced" },
      { season: 2026, war: 6.4, wrcPlus: null, source: "Baseball-Reference player summary" },
    );
    expect(merged).toMatchObject({
      war: 6.4,
      wrcPlus: null,
      provenance: { war: "Baseball-Reference player summary", wrcPlus: null },
      status: "live",
    });
  });

  it("parses only explicit Baseball-Reference WAR and wRC+ fields", () => {
    const parsed = parseBaseballReferenceAdvanced(
      '<main>SUMMARY 2026 Career WAR 6.4 57.7 OPS+ 156 160</main>',
      2026,
    );
    expect(parsed).toMatchObject({ war: 6.4, wrcPlus: null, status: "live" });
  });

  it("formats percentile labels with the correct ordinal suffix", () => {
    expect([92, 93, 98, 99, 100].map(percentileLabel)).toEqual([
      "92nd",
      "93rd",
      "98th",
      "99th",
      "100th",
    ]);
    expect(percentileLabel(null)).toBe("—");
  });

  it("renders missing advanced metrics as unavailable and preserves real zeroes", () => {
    const empty = getLivePerformanceItems({});
    expect(empty).toHaveLength(7);
    expect(empty.every(item => item.val === "—")).toBe(true);

    const values = getLivePerformanceItems({
      avg_hit_speed: 0,
      launch_angle_avg: 12.34,
      sweet_spot_percent: 0,
      brl_percent: 7.8,
      hard_hit_percent: 0,
      oz_swing_percent: 28.2,
      z_contact_percent: 86.4,
    });
    expect(values.map(item => item.val)).toEqual([
      "0.0 mph",
      "12.3°",
      "0.0%",
      "7.8%",
      "0.0%",
      "28.2%",
      "86.4%",
    ]);
  });

  it("reads renamed Savant aliases consistently without turning missing fields into estimates", () => {
    expect(savantField({ anglesweetspotpercent: 31.2 }, ["sweet_spot_percent", "anglesweetspotpercent"])).toBe(31.2);
    expect(savantField({ barrel_percent: 9.4 }, ["brl_percent", "barrel_percent", "barrels_per_bbe_percent"])).toBe(9.4);
    expect(savantField({ ev95percent: 44.1 }, ["hard_hit_percent", "ev95percent", "hard_hit_pct"])).toBe(44.1);
    expect(savantField({ sweet_spot_percent: 0 }, ["sweet_spot_percent", "anglesweetspotpercent"])).toBe(0);
    expect(savantField({}, ["brl_percent", "barrel_percent"])).toBeUndefined();

    expect(getLivePerformanceItems({
      anglesweetspotpercent: 31.2,
      barrel_percent: 9.4,
      ev95percent: 44.1,
    }).slice(2, 5).map(item => item.val)).toEqual(["31.2%", "9.4%", "44.1%"]);

    expect(buildSavantPercentileRow({
      label: "Sweet Spot %",
      data: { anglesweetspotpercent: 0 },
      aliases: ["sweet_spot_percent", "anglesweetspotpercent"],
      population: [
        { anglesweetspotpercent: 0 },
        { anglesweetspotpercent: 10 },
        { anglesweetspotpercent: 20 },
      ],
    })).toMatchObject({
      lbl: "Sweet Spot %",
      val: "0.0%",
      raw: 0,
      pct: 0,
    });
  });

  it("normalizes Baseball Savant spray coordinates and preserves hover metrics", () => {
    expect(
      normalizeSprayPoint({
        hc_x: 125,
        hc_y: 198,
        events: "field_out",
        launch_speed: 101.2,
        launch_angle: 28.4,
        hit_distance_sc: 390,
      })
    ).toMatchObject({
      cx: 70,
      cy: 80,
      launchSpeed: 101.2,
      launchAngle: 28.4,
      distance: 390,
      color: expect.any(String),
    });
    const pulled = normalizeSprayPoint({
      hc_x: 40,
      hc_y: 30,
      events: "home_run",
    });
    expect(pulled.cx).toBeLessThan(20);
    expect(pulled.cy).toBeGreaterThan(15);
    expect(pulled.color).toBeTruthy();
    expect(
      normalizeSprayPoint({ intercept_ball_minus_batter_pos_x_inches: 4 })
    ).toBeNull();
  });

  it("does not convert invalid or empty metric values into proxy numbers", () => {
    expect(formatProfileMetric(undefined, 1, " mph")).toBe("—");
    expect(formatProfileMetric("", 1, "%")).toBe("—");
    expect(formatProfileMetric("not-a-number", 3)).toBe("—");
    expect(formatProfileMetric(0, 3)).toBe("0.000");
  });

  it("maps raw Savant values to percentile widths and preserves a 99th-percentile xSLG", () => {
    const expected = Array.from({ length: 100 }, (_, i) => ({
      est_slg: 0.4 + i * 0.002,
    }));
    const axes = buildSavantPercentileAxes(
      {
        savant: {
          est_woba: 0.5,
          est_slg: 0.598,
          avg_hit_speed: 95,
          whiff_percent: 20,
          oz_swing_percent: 20,
        },
        expectedStatisticsPopulation: expected,
        statcastPopulation: [
          { avg_hit_speed: 80, whiff_percent: 30, oz_swing_percent: 40 },
          { avg_hit_speed: 90, whiff_percent: 25, oz_swing_percent: 30 },
          { avg_hit_speed: 95, whiff_percent: 20, oz_swing_percent: 20 },
        ],
        batTrackingPopulation: [],
        batTracking: { avg_bat_speed: 75 },
      },
      false
    );

    const xslg = axes.find(row => row.axis === "xSLG");
    expect(xslg.rawLabel).toBe("0.598");
    expect(xslg.pct).toBe(99);
    expect(xslg.pct).not.toBe(Math.round(xslg.raw * 100));
    expect(
      metricPopulationPercentile(
        90,
        [{ value: 70 }, { value: 80 }, { value: 90 }],
        ["value"],
        false
      )
    ).toBe(0);
  });

  it("keeps percentile radar inputs bounded and label-ready for clean geometry", () => {
    const axes = buildSavantPercentileAxes(
      {
        savant: {
          est_woba: 0.41,
          est_slg: 0.56,
          avg_hit_speed: 92,
          whiff_percent: 18,
          oz_swing_percent: 24,
        },
        expectedStatisticsPopulation: [
          { est_woba: 0.3, est_slg: 0.4 },
          { est_woba: 0.41, est_slg: 0.56 },
          { est_woba: 0.45, est_slg: 0.62 },
        ],
        statcastPopulation: [
          { avg_hit_speed: 82, whiff_percent: 30, oz_swing_percent: 34 },
          { avg_hit_speed: 92, whiff_percent: 18, oz_swing_percent: 24 },
          { avg_hit_speed: 98, whiff_percent: 12, oz_swing_percent: 18 },
        ],
        batTrackingPopulation: [
          { avg_bat_speed: 68 },
          { avg_bat_speed: 74 },
          { avg_bat_speed: 80 },
        ],
        batTracking: { avg_bat_speed: 74 },
      },
      false
    );
    expect(axes.length).toBeGreaterThanOrEqual(3);
    expect(
      axes.every(
        axis => Number.isFinite(axis.pct) && axis.pct >= 0 && axis.pct <= 100
      )
    ).toBe(true);
    expect(
      axes.every(
        axis =>
          typeof axis.axis === "string" && typeof axis.rawLabel === "string"
      )
    ).toBe(true);
  });

  it("does not create a percentile radar from missing Savant populations", () => {
    expect(
      buildSavantPercentileAxes({ savant: { est_slg: 0.6 } }, false)
    ).toEqual([]);
    expect(formatProfileMetric(0.598, 3)).toBe("0.598");
  });

  it("keeps comparison profiles on the same percentile axes as the player page", () => {
    const player = {
      profile: {
        fullName: "Juan Soto",
        currentTeam: { name: "New York Mets" },
        primaryPosition: { abbreviation: "RF" },
      },
    };
    const axes = comparisonAxes(
      player,
      () => [{ axis: "Power", pct: 99, rawLabel: "99" }],
      false
    );
    expect(comparisonIdentity(player)).toEqual({
      name: "Juan Soto",
      identity: "New York Mets · RF",
    });
    expect(axes[0]).toMatchObject({
      axis: "Power",
      pct: 99,
      label: "99th",
      color: expect.any(String),
    });
  });

  it("normalizes recent boxscore games into a chronological last-10 series", () => {
    const recentGames = Array.from({ length: 12 }, (_, index) => ({
      batting: { ops: 0.7 + index * 0.01 },
    }));
    expect(
      buildRecentGameSeries({ recentGames }, "ops", 10).map(value =>
        Number(value.toFixed(2))
      )
    ).toEqual([0.79, 0.78, 0.77, 0.76, 0.75, 0.74, 0.73, 0.72, 0.71, 0.7]);
    expect(
      buildRecentGameSeries(
        { recentGames: [{ batting: { ops: null } }] },
        "ops",
        10
      )
    ).toEqual([]);
    expect(
      MetricSparkline({ values: [0.8], tone: "#168c7a" }).props.className
    ).toBe("skip-summary-sparkline-unavailable");
  });

  it("normalizes only explicit provider WAR and wRC+ fields", () => {
    expect(
      normalizeSeasonAdvancedStat({ fWAR: 3.4, wRCPlus: 128 }, 2026)
    ).toMatchObject({ war: 3.4, wrcPlus: 128, status: "live" });
    expect(normalizeSeasonAdvancedStat({ ops: 0.842 }, 2026)).toMatchObject({
      war: null,
      wrcPlus: null,
      status: "unavailable",
    });
  });

  it("prefers a current-sport aggregate split over an arbitrary team split", () => {
    const split = selectSeasonSplit(
      [
        { sport: { id: 1 }, team: { id: 147 }, stat: { ops: ".900" } },
        { sport: { id: 1 }, isTotal: true, stat: { ops: "1.050" } },
        { sport: { id: 12 }, isTotal: true, stat: { ops: ".700" } },
      ],
      1
    );
    expect(split.stat.ops).toBe("1.050");

    const milbSplit = selectSeasonSplit(
      [
        { sport: { id: 12 }, team: { id: 120 }, stat: { era: "3.50" } },
        { sport: { id: 12 }, team: { id: 121 }, stat: { era: "4.10" } },
      ],
      12
    );
    expect(milbSplit.team.id).toBe(120);
  });

  it("requires complete valid bat-tracking inputs before computing AMD/IMD", () => {
    expect(computeAMD({ avg_bat_speed: 72 })).toBeNull();
    expect(
      computeAMD({
        squared_up_per_swing: "",
        blast_per_swing: 0,
        swings_competitive: 100,
        swords: 5,
      })
    ).toBeNull();
    expect(
      computeAMD({
        squared_up_per_swing: 0.32,
        blast_per_swing: 0.06,
        swings_competitive: 100,
        swords: 8,
        avg_bat_speed: 72,
      })
    ).toMatchObject({
      amdPlus: expect.any(Number),
      imdPlus: expect.any(Number),
      batSpeed: 72,
    });
  });
});
