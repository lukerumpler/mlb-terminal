import { describe, expect, it } from "vitest";
import { isRateLimited } from "./_shared.js";

function request(ip = "203.0.113.42") {
  return {
    headers: { "x-forwarded-for": ip },
    socket: { remoteAddress: ip },
  };
}

describe("proxy rate-limit buckets", () => {
  it("keeps the MLB budget independent from other feeds", () => {
    const req = request();
    for (let index = 0; index < 30; index += 1) {
      expect(isRateLimited(req, "mlb")).toBe(false);
    }
    expect(isRateLimited(req, "mlb")).toBe(true);
    expect(isRateLimited(req, "team-financials")).toBe(false);
    expect(isRateLimited(req, "fangraphs")).toBe(false);
  });
});
