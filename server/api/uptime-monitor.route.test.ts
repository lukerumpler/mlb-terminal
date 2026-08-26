import express from "express";
import { afterEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "http";
import { registerUptimeMonitorRoutes } from "./uptime-monitor";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve()))));
});

async function startServer() {
  const app = express();
  registerUptimeMonitorRoutes(app, async days => ({
    generatedAt: new Date("2026-08-18T00:00:00.000Z"),
    rangeDays: days,
    targets: [],
    trend30Days: [],
    recentByTarget: [],
  }));
  const server = createServer(app);
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Test server did not expose a port");
  return `http://127.0.0.1:${address.port}`;
}

describe("uptime-monitor route safeguards", () => {
  it("uses the shared rate limiter and returns Retry-After rather than bypassing API protection", async () => {
    const baseUrl = await startServer();
    const headers = { "x-forwarded-for": "198.51.100.77" };
    for (let attempt = 0; attempt < 30; attempt += 1) {
      const response = await fetch(`${baseUrl}/api/uptime-monitor?days=7`, { headers });
      expect(response.status).toBe(200);
    }
    const limited = await fetch(`${baseUrl}/api/uptime-monitor?days=7`, { headers });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("10");
  });
});
