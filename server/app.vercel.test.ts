import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      server =>
        new Promise<void>(resolve => {
          server.close(() => resolve());
        })
    )
  );
});

async function startTestServer() {
  const app = await createApp();
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Test server did not expose a port");
  return `http://127.0.0.1:${address.port}`;
}

describe("Vercel-compatible API app", () => {
  it("serves a health response without starting a listener in the module", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/health`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: "skip-baseball-api",
    });
  });

  it("serves the public tRPC auth.me procedure for anonymous users", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/trpc/auth.me`);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.result.data.json).toBeNull();
  });

  it("registers the MLB proxy route under the expected Vercel API path", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(`${baseUrl}/api/mlb?path=not-a-real-path`);
    expect(response.status).not.toBe(404);
  });

  it("matches multi-segment storage keys with the Express 5 wildcard route", async () => {
    const baseUrl = await startTestServer();
    const response = await fetch(
      `${baseUrl}/manus-storage/snapshots/2026/player.json`
    );
    expect(response.status).toBe(500);
    expect(await response.text()).toBe("Storage proxy not configured");
  });
});
