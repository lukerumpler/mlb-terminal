import { describe, expect, it } from "vitest";
import { UPTIME_MONITOR_ENDPOINTS, buildDailyUptimeRunKey, isPassingUptimeStatus, probeUptimeEndpoint } from "./uptime-monitor";

describe("uptime-monitor branch contract", () => {
  it("keeps the four approved production targets explicit", () => {
    expect(UPTIME_MONITOR_ENDPOINTS.map(target => target.url)).toEqual([
      "https://mlb-terminal.vercel.app/api/health",
      "https://mlb-terminal.vercel.app/",
      "https://skipbasebal-mm6hz9ps.manus.space",
      "https://lukerumpler.com",
    ]);
  });

  it("classifies statuses and UTC daily run keys deterministically", () => {
    expect(isPassingUptimeStatus(200)).toBe(true);
    expect(isPassingUptimeStatus(302)).toBe(true);
    expect(isPassingUptimeStatus(500)).toBe(false);
    expect(buildDailyUptimeRunKey(new Date("2026-08-18T23:59:59.000Z"))).toBe("daily:2026-08-18");
  });

  it("persists a failed-probe contract when a request throws", async () => {
    const result = await probeUptimeEndpoint(
      UPTIME_MONITOR_ENDPOINTS[0].url,
      "daily:2026-08-18",
      new Date("2026-08-18T00:00:00.000Z"),
      (async () => { throw new Error("network unavailable"); }) as typeof fetch
    );
    expect(result).toMatchObject({ statusCode: 0, passed: false, runKey: "daily:2026-08-18" });
  });
});
