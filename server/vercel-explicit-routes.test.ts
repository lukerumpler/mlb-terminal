import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import healthHandler from "../api/health";
import trpcApp from "../api/trpc";

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

describe("explicit Vercel API functions", () => {
  it("returns the health contract", () => {
    const json = vi.fn();
    const response = { status: vi.fn(() => ({ json })) };
    healthHandler({} as never, response as never);
    expect(response.status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      ok: true,
      service: "skip-baseball-api",
    });
  });

  it("serves anonymous auth.me through the explicit tRPC function", async () => {
    const server = createServer(trpcApp);
    servers.push(server);
    await new Promise<void>(resolve => server.listen(0, resolve));
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("No test port");
    const response = await fetch(
      `http://127.0.0.1:${address.port}/api/trpc/auth.me`
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      result: { data: { json: null } },
    });
  });
});
