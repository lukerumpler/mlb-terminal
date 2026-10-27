/*
Our goal is to make sure that when we warm up the Baseball Savant cache without saying which season we want, it asks for the
CURRENT season and not a year that was typed into the code. Before we fixed it, the default was the text "2026", so it would
have kept asking for 2026 data long after the season changed.

To solve this we are going to:
  1. Set our clock to June 2027 (only the date is faked)
  2. Replace the internet with a fake fetch that writes down every address we ask for
  3. Call warmSavantCache() with no season, and check every Savant address mentions 2027 and none mention 2026
*/
import { afterEach, describe, expect, it, vi } from "vitest";

describe("warmSavantCache default season", () => {
  afterEach(() => {
    vi.useRealTimers();                                                              // Put the real clock back
    vi.unstubAllGlobals();                                                           // Put the real fetch back
    vi.resetModules();                                                               // Forget the copy of savant.js that saw our fake clock
  });

  it("requests the calendar season when called with no argument", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });                                          // Fake only the date, nothing else
    vi.setSystemTime(new Date("2027-06-01T00:00:00Z"));                              // Pretend it is June 2027

    const urls: string[] = [];                                                       // Every address our code asks for
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: unknown) => {
        urls.push(String(input));                                                    // Write down what we were asked for
        return new Response("", { status: 500 });                                    // The answer does not matter, only the question
      })
    );

    vi.resetModules();                                                               // Load savant.js fresh so it sees our fake date
    const { warmSavantCache } = await import("./savant.js");
    await warmSavantCache();                                                         // No season given, this is what we are testing

    const savantUrls = urls.filter(url => /savant/i.test(url));                      // Only the Baseball Savant addresses
    expect(savantUrls.length).toBeGreaterThan(0);                                    // We did ask for something
    expect(savantUrls.every(url => url.includes("2027"))).toBe(true);                // Every address is for the current season
    expect(savantUrls.some(url => url.includes("2026"))).toBe(false);                // And none is for the old hardcoded one
  });
});
