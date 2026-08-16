import { describe, expect, it } from "vitest";
import { getExtensionTaxWarning } from "../client/src/pages/PlayersPage.jsx";
import {
  buildTeamFinancialCsv,
  buildTeamFinancialCsvRows,
} from "../client/src/lib/csvExports.js";

describe("player extension surcharge warnings", () => {
  it("warns when current tax payroll is above the CBT threshold", () => {
    const warning = getExtensionTaxWarning({
      teamFinancials: {
        tax: {
          taxPayroll: 430_000_000,
          taxThreshold: 244_000_000,
          estimatedTaxBill: 180_000_000,
          repeaterYears: 3,
          repeaterTier: "Third consecutive year or more",
        },
      },
    });
    expect(warning.kind).toBe("warning");
    expect(warning.overage).toBe(186_000_000);
    expect(warning.severity.key).toBe("severe");
    expect(warning.message).toContain("above the CBT threshold");
    expect(warning.message).toContain("surcharge");
  });

  it("does not fabricate a warning when verified payroll fields are unavailable", () => {
    expect(
      getExtensionTaxWarning({
        teamFinancials: { tax: { taxPayroll: null, taxThreshold: null } },
      })
    ).toBeNull();
  });
});

describe("team financial CSV export", () => {
  const financials = {
    season: 2026,
    source: "Spotrac payroll tracker",
    sourceUrls: { tax: "https://www.spotrac.com/mlb/tax" },
    payroll: { payroll: 311_496_026 },
    tax: {
      taxPayroll: 430_290_578,
      taxThreshold: 244_000_000,
      estimatedTaxBill: 180_319_636,
      taxSpace: -186_290_578,
      repeaterTier: "History unavailable",
    },
  };
  const projection = {
    source: "https://www.mlb.com/glossary/transactions/competitive-balance-tax",
    rows: [
      {
        season: 2026,
        projectedAav: 25_000_000,
        projectedTaxPayroll: 455_000_000,
        overage: 211_000_000,
        repeaterTier: "History unavailable",
        surchargeBand: "+$60M or more surcharge",
        estimatedTax: null,
      },
    ],
  };

  it("includes payroll, CBT, repeater, and projection records with source URLs", () => {
    const rows = buildTeamFinancialCsvRows({
      teamName: "Los Angeles Dodgers",
      teamFinancials: financials,
      taxProjection: projection,
    });
    expect(rows[0]).toEqual([
      "record_type",
      "team",
      "season",
      "metric",
      "value",
      "source",
    ]);
    expect(rows.some(row => row[3] === "repeater_tier")).toBe(true);
    expect(rows.some(row => row[3] === "surcharge_band")).toBe(true);
    expect(rows.at(-1)?.at(-1)).toContain(
      "mlb.com/glossary/transactions/competitive-balance-tax"
    );
  });

  it("returns a valid CSV with a header and escaped team names", () => {
    const csv = buildTeamFinancialCsv({
      teamName: "Club, Test",
      teamFinancials: financials,
      taxProjection: projection,
    });
    expect(
      csv.startsWith("record_type,team,season,metric,value,source\n")
    ).toBe(true);
    expect(csv).toContain('"Club, Test"');
    expect(csv).toContain("estimated_tax");
  });
});

describe("surcharge risk badge and historical trend data", () => {
  it("renders only for a verified surcharge warning and carries accessible source-backed text", async () => {
    const { SurchargeRiskBadge } = await import(
      "../client/src/pages/PlayersPage.jsx"
    );
    const warning = getExtensionTaxWarning({
      teamFinancials: {
        tax: {
          taxPayroll: 430_000_000,
          taxThreshold: 244_000_000,
          repeaterYears: 3,
          repeaterTier: "Third consecutive year or more",
        },
      },
    });
    const element = SurchargeRiskBadge({ warning, compact: true });
    expect(element).not.toBeNull();
    expect(element.props.role).toBe("status");
    expect(element.props["aria-label"]).toContain("SURCHARGE RISK");
    expect(element.props["aria-label"]).toContain("+$60M or more surcharge");
    expect(
      SurchargeRiskBadge({
        warning: getExtensionTaxWarning({
          teamFinancials: {
            tax: { taxPayroll: 200_000_000, taxThreshold: 244_000_000 },
          },
        }),
      })
    ).toBeNull();
  });

  it("keeps missing season-specific financial rows unavailable instead of imputing them", async () => {
    const { buildHistoricalTaxTrendRows } = await import(
      "../client/src/pages/OverviewPage.jsx"
    );
    expect(
      buildHistoricalTaxTrendRows([
        {
          season: 2024,
          tax: {
            taxPayroll: 250_000_000,
            estimatedTaxBill: 3_000_000,
            taxThreshold: 237_000_000,
          },
          sourceUrls: { tax: "https://www.spotrac.com/mlb/tax/_/year/2024" },
        },
        null,
        {
          season: 2026,
          tax: {
            taxPayroll: 260_000_000,
            estimatedTaxBill: null,
            taxThreshold: 244_000_000,
          },
          sourceUrls: { tax: "https://www.spotrac.com/mlb/tax/_/year/2026" },
        },
      ])
    ).toEqual([
      {
        season: 2024,
        taxPayroll: 250_000_000,
        estimatedTaxBill: 3_000_000,
        taxThreshold: 237_000_000,
        sourceUrl: "https://www.spotrac.com/mlb/tax/_/year/2024",
      },
      {
        season: 2025,
        taxPayroll: null,
        estimatedTaxBill: null,
        taxThreshold: null,
        sourceUrl: null,
      },
      {
        season: 2026,
        taxPayroll: 260_000_000,
        estimatedTaxBill: null,
        taxThreshold: 244_000_000,
        sourceUrl: "https://www.spotrac.com/mlb/tax/_/year/2026",
      },
    ]);
  });
});
