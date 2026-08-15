import { describe, expect, it } from "vitest";
import { hasVerifiedContractData } from "../server/api/contract.js";

describe("contract source accuracy", () => {
  it("does not treat MLB identity or debut metadata as a verified contract record", () => {
    expect(
      hasVerifiedContractData(null, {
        debutDate: "2018-07-01",
        serviceTime: null,
        mlbSalary: null,
        mlbAav: null,
        mlbYears: null,
        mlbExpiry: null,
      })
    ).toBe(false);
  });

  it("recognizes a scraped contract value when the source actually returned one", () => {
    expect(
      hasVerifiedContractData(
        { source: "Baseball-Reference", salary: 35000000 },
        null
      )
    ).toBe(true);
    expect(
      hasVerifiedContractData(
        { source: "Spotrac", aav: 45000000, total: null },
        null
      )
    ).toBe(true);
  });

  it("recognizes official MLB contract hydration fields without requiring a scrape", () => {
    expect(
      hasVerifiedContractData(null, {
        mlbSalary: 1000000,
        mlbAav: null,
        mlbYears: null,
        mlbExpiry: null,
      })
    ).toBe(true);
  });
});
