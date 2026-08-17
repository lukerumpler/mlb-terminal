import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildBaseballReferencePlayerUrl,
  extractBaseballReferenceId,
  isExactIdentityNameMatch,
  parseBaseballReferencePlayerPageName,
  parseBaseballReferenceSearchCandidates,
  selectExactBaseballReferenceCandidate,
  resolvePlayerProviderIdentity,
  __resetPlayerIdentityStateForTests,
} from "./player-identity.js";

afterEach(() => {
  vi.unstubAllGlobals();
  __resetPlayerIdentityStateForTests();
});

describe("Baseball-Reference player identity resolution", () => {
  const searchHtml = `
    <div class="search-item"><a href="/players/o/ohtansh01.shtml">Shohei Ohtani</a></div>
    <div class="search-item"><a href="/players/o/ohtansh02.shtml">Shohei Ohtan</a></div>
    <div class="search-item"><a href="/players/o/othertst01.shtml">Other Player</a></div>
  `;

  it("normalizes harmless presentation differences while requiring an exact identity name", () => {
    expect(isExactIdentityNameMatch("José Ramírez", "Jose Ramirez")).toBe(true);
    expect(isExactIdentityNameMatch("Shohei Ohtani", "Shohei Ohtan")).toBe(false);
    expect(isExactIdentityNameMatch("Aaron Judge", "Aaron Judges")).toBe(false);
  });

  it("selects the exact candidate and rejects near-name Baseball-Reference results", () => {
    const candidates = parseBaseballReferenceSearchCandidates(searchHtml);
    expect(selectExactBaseballReferenceCandidate(candidates, "Shohei Ohtani")).toMatchObject({
      id: "ohtansh01",
      name: "Shohei Ohtani",
      canonicalUrl: "https://www.baseball-reference.com/players/o/ohtansh01.shtml",
    });
    expect(selectExactBaseballReferenceCandidate(candidates, "Shohei Ohtan")).toMatchObject({
      id: "ohtansh02",
      name: "Shohei Ohtan",
    });
    expect(selectExactBaseballReferenceCandidate(candidates, "Shohei Ohtani Jr.")).toBeNull();
  });

  it("accepts only canonical Baseball-Reference player identifiers", () => {
    expect(extractBaseballReferenceId("/players/o/ohtansh01.shtml?source=search")).toBe("ohtansh01");
    expect(extractBaseballReferenceId("/players/o/ohtansh1.shtml")).toBeNull();
    expect(extractBaseballReferenceId("/register/player.fcgi?id=ohtani001sho")).toBeNull();
    expect(buildBaseballReferencePlayerUrl("ohtansh01")).toBe("https://www.baseball-reference.com/players/o/ohtansh01.shtml");
    expect(buildBaseballReferencePlayerUrl("../../etc/passwd")).toBeNull();
  });

  it("extracts a canonical player-page name for direct-ID validation", () => {
    expect(parseBaseballReferencePlayerPageName("<h1>José Ramírez</h1>")).toBe("José Ramírez");
    expect(parseBaseballReferencePlayerPageName("<title>Shohei Ohtani Stats, Height, Weight, Position, Rookie Status & More</title>")).toBe("Shohei Ohtani");
  });

  it("uses a stored Baseball-Reference ID directly without reopening name search", async () => {
    const fetchMock = vi.fn(async () => new Response("<h1>Shohei Ohtani</h1>", { status:200 }));
    vi.stubGlobal("fetch", fetchMock);

    const identity = await resolvePlayerProviderIdentity({
      mlbId:"660271",
      name:"Shohei Ohtani",
      baseballReferenceId:"ohtansh01",
    });

    expect(identity?.baseballReference).toMatchObject({
      id:"ohtansh01",
      confidence:"exact-name",
      canonicalUrl:"https://www.baseball-reference.com/players/o/ohtansh01.shtml",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://www.baseball-reference.com/players/o/ohtansh01.shtml");
  });

  it("does not map a near-name search result to historical data", async () => {
    const fetchMock = vi.fn(async () => new Response(
      '<a href="/players/o/ohtansh02.shtml">Shohei Ohtan</a>',
      { status:200 },
    ));
    vi.stubGlobal("fetch", fetchMock);

    const identity = await resolvePlayerProviderIdentity({ mlbId:"660271", name:"Shohei Ohtani" });
    expect(identity).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/search/search.fcgi?search=Shohei%20Ohtani");
  });
});
