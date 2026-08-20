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
});
