import { describe, expect, it } from "vitest";

const baseUrl = (process.env.VERCEL_SMOKE_BASE_URL ?? "").replace(/\/$/, "");
const smokeTimeoutMs = Number(process.env.VERCEL_SMOKE_TIMEOUT_MS ?? 15_000);

async function fetchSmokePath(path: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), smokeTimeoutMs);
  try {
    return await fetch(`${baseUrl}${path}`, {
      headers: { accept: "application/json" },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function expectJsonContentType(response: Response) {
  expect(response.headers.get("content-type") ?? "").toMatch(
    /application\/json/i
  );
}

describe.skipIf(!baseUrl)("Vercel deployment smoke test", () => {
  it("serves the API health contract", async () => {
    const response = await fetchSmokePath("/api/health");
    expect(response.status).toBe(200);
    expectJsonContentType(response);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      service: "skip-baseball-api",
    });
  });

  it("serves the public tRPC auth.me procedure", async () => {
    const response = await fetchSmokePath("/api/trpc/auth.me");
    expect(response.status).toBe(200);
    expectJsonContentType(response);
    await expect(response.json()).resolves.toMatchObject({
      result: { data: { json: null } },
    });
  });

  it("routes an MLB data request through the serverless API", async () => {
    const response = await fetchSmokePath("/api/mlb?path=%2Fteams%2F119");
    expect(response.status).not.toBe(404);
    expectJsonContentType(response);
  });

  it("serves the MLB warehouse route (live data or a clean 'unavailable', never a 404)", async () => {
    const season = new Date().getUTCFullYear();
    const response = await fetchSmokePath(
      `/api/mlb-warehouse?view=status&season=${season}`
    );
    // 200 when DATABASE_URL is set and migrated; 503 {available:false} otherwise.
    expect([200, 503]).toContain(response.status);
    expectJsonContentType(response);
    const body = await response.json();
    expect(typeof body.available).toBe("boolean");
    expect(body.error ?? "").not.toMatch(/unknown api route/i);
  });

  it("rejects a malformed warehouse request with 400 (proves the handler, not a proxy, answered)", async () => {
    const response = await fetchSmokePath("/api/mlb-warehouse?view=bogus");
    expect(response.status).toBe(400);
    expectJsonContentType(response);
  });

  it("serves the team efficiency route (the catch-all must register it)", async () => {
    const response = await fetchSmokePath("/api/team-efficiency?team=SD");
    expect(response.status).not.toBe(404);
    expectJsonContentType(response);
    const body = await response.json();
    expect(body.error ?? "").not.toMatch(/unknown api route/i);
  });

  it("sends baseline security headers", async () => {
    const response = await fetchSmokePath("/api/health");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("referrer-policy")).toBeTruthy();
  });
});
