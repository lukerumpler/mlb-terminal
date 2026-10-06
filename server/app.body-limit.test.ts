import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { createApp } from "./app";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(server => new Promise<void>(done => server.close(() => done())))
  );
});

async function start() {
  const server = createServer(await createApp());
  servers.push(server);
  await new Promise<void>(done => server.listen(0, done));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  return `http://127.0.0.1:${address.port}`;
}

const post = (url: string, bytes: number) =>
  fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filler: "x".repeat(bytes) }),
  });

describe("request body limits", () => {
  it("rejects a body over 2 MB on an ordinary JSON route with 413", async () => {
    const base = await start();
    expect(
      (await post(`${base}/api/comparison-summary`, 3 * 1024 * 1024)).status
    ).toBe(413);
  });

  it("still accepts a normal-sized body on an ordinary route (it reaches the handler)", async () => {
    const base = await start();
    // Reaches validation (400), not the body parser (413).
    expect((await post(`${base}/api/comparison-summary`, 1024)).status).toBe(
      400
    );
  });

  it("lets tRPC take a voice-note-sized body but not an unbounded one", async () => {
    const base = await start();
    // 10 MB would have been a 413 on any other route; on tRPC it reaches the router.
    const big = await post(`${base}/api/trpc/storage.upload`, 10 * 1024 * 1024);
    expect(big.status).not.toBe(413);
    const huge = await post(
      `${base}/api/trpc/storage.upload`,
      30 * 1024 * 1024
    );
    expect(huge.status).toBe(413);
  });

  it("reports malformed JSON as a 400 client error, not a 500", async () => {
    const base = await start();
    const res = await fetch(`${base}/api/comparison-summary`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ not json",
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toHaveProperty("error");
  });
});
