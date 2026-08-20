import express from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "http";

const { authenticateRequest } = vi.hoisted(() => ({
  authenticateRequest: vi.fn(async () => ({ isCron: false, taskUid: undefined })),
}));
vi.mock("../_core/sdk", () => ({ sdk: { authenticateRequest } }));

import { registerUptimeMonitorRoutes } from "./uptime-monitor";

const servers: Server[] = [];

afterEach(async () => {
  authenticateRequest.mockClear();
  await Promise.all(
    servers.splice(0).map(server => new Promise<void>(resolve => server.close(() => resolve())))
  );
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
  it("returns the dashboard through the shared API route", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/uptime-monitor?days=30`);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ rangeDays: 30, targets: [] });
  });

  it("rejects non-cron requests to the scheduled callback", async () => {
    const baseUrl = await startServer();
    const response = await fetch(`${baseUrl}/api/scheduled/daily-uptime-monitor`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "cron-only" });
    expect(authenticateRequest).toHaveBeenCalledOnce();
  });
});
