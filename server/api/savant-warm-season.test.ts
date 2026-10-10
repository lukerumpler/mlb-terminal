import { afterEach, describe, expect, it, vi } from "vitest";

describe("warmSavantCache default season", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("requests the calendar season when called with no argument", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2027-06-01T00:00:00Z"));
    const urls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        urls.push(String(input));
        return new Response("", { status: 500 });
      })
    );
    vi.resetModules();
    const { warmSavantCache } = await import("./savant.js");
    await warmSavantCache();
    const savantUrls = urls.filter(url => /savant/i.test(url));
    expect(savantUrls.length).toBeGreaterThan(0);
    expect(savantUrls.every(url => url.includes("2027"))).toBe(true);
    expect(savantUrls.some(url => url.includes("2026"))).toBe(false);
  });
});
