import { describe, expect, it } from "vitest";
import { assessReleaseComparison } from "../scripts/release-shared-comparison.mjs";
import {
  classifyProviderResult,
  summarizeProviderResults,
} from "../scripts/provider-health-smoke.mjs";

const baseline = {
  githubRepository: "lukerumpler/mlb-terminal",
  acceptedGithubMain: "ffb803e6c417897dfad0dbfa95d898468edab4f7",
  audit: "GITHUB_SYNC_AUDIT.md",
};

describe("release gate tools", () => {
  it("passes the GitHub comparison only when main matches the reviewed baseline", () => {
    const result = assessReleaseComparison({
      sharedCommit: "eac81214",
      githubCommit: baseline.acceptedGithubMain,
      baseline,
    });
    expect(result.status).toBe("pass");
    expect(result.exitCode).toBe(0);
  });

  it("requires a compatibility review instead of silently accepting a newer GitHub main", () => {
    const result = assessReleaseComparison({
      sharedCommit: "eac81214",
      githubCommit: "1234567890abcdef",
      baseline,
    });
    expect(result.status).toBe("review-required");
    expect(result.exitCode).toBe(2);
    expect(result.audit).toBe("GITHUB_SYNC_AUDIT.md");
  });

  it("fails only required provider probes while retaining transparent degraded states", () => {
    const required = {
      id: "mlb",
      critical: true,
      accepts: body => Array.isArray(body?.teams),
    };
    const optional = {
      id: "fangraphs",
      critical: false,
      accepts: body => typeof body === "object" && body !== null,
    };
    const mlb = classifyProviderResult(required, {
      status: 200,
      body: { teams: [] },
      headers: { "x-proxy-cache": "HIT" },
    });
    const fanGraphs = classifyProviderResult(optional, {
      status: 503,
      body: { error: "Provider blocked", providerBlocked: true },
    });
    const summary = summarizeProviderResults([mlb, fanGraphs]);
    expect(mlb.status).toBe("pass");
    expect(fanGraphs.status).toBe("degraded");
    expect(fanGraphs.providerBlocked).toBe(true);
    expect(summary.status).toBe("pass-with-degraded-providers");
    expect(summary.exitCode).toBe(0);
  });

  it("fails the provider gate when a critical provider does not satisfy its JSON contract", () => {
    const required = { id: "savant", critical: true, accepts: Array.isArray };
    const result = classifyProviderResult(required, {
      status: 502,
      body: { error: "Upstream unavailable" },
    });
    expect(result.status).toBe("fail");
    expect(summarizeProviderResults([result]).exitCode).toBe(1);
  });
});
