import { EventEmitter } from "events";
import { createServer } from "http";
import type { AddressInfo } from "net";
import { describe, expect, it, vi } from "vitest";
import { installGracefulShutdown } from "./shutdown";

function harness(
  handler: Parameters<typeof createServer>[1],
  opts: Record<string, unknown> = {}
) {
  const server = createServer(handler);
  const proc = new EventEmitter();
  const exits: number[] = [];
  const logs: string[] = [];
  const done = new Promise<void>(resolve => {
    const uninstall = installGracefulShutdown(server, {
      proc: proc as never,
      exit: code => {
        exits.push(code);
        resolve();
      },
      log: m => logs.push(m),
      ...opts,
    });
    void uninstall;
  });
  return { server, proc, exits, logs, done };
}

const listen = (server: ReturnType<typeof createServer>) =>
  new Promise<number>(resolve =>
    server.listen(0, "127.0.0.1", () =>
      resolve((server.address() as AddressInfo).port)
    )
  );

describe("installGracefulShutdown", () => {
  it("lets an in-flight request finish, then exits 0", async () => {
    const h = harness((_req, res) => setTimeout(() => res.end("slow-ok"), 200));
    const port = await listen(h.server);
    const inflight = fetch(`http://127.0.0.1:${port}/`).then(r => r.text());
    await new Promise(r => setTimeout(r, 50));
    h.proc.emit("SIGTERM", "SIGTERM");

    expect(await inflight).toBe("slow-ok");
    await h.done;
    expect(h.exits).toEqual([0]);
    expect(h.logs.join("\n")).toContain("clean exit");
  });

  it("stops accepting new connections once draining", async () => {
    const h = harness((_req, res) => setTimeout(() => res.end("x"), 300));
    const port = await listen(h.server);
    const inflight = fetch(`http://127.0.0.1:${port}/`);
    await new Promise(r => setTimeout(r, 30));
    h.proc.emit("SIGINT", "SIGINT");
    await new Promise(r => setTimeout(r, 30));
    await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
    await (await inflight).text();
    await h.done;
  });

  it("forces exit 1 when the drain exceeds the timeout", async () => {
    const h = harness(
      () => {
        /* never answers */
      },
      { timeoutMs: 100 }
    );
    const port = await listen(h.server);
    void fetch(`http://127.0.0.1:${port}/`).catch(() => {});
    await new Promise(r => setTimeout(r, 30));
    h.proc.emit("SIGTERM", "SIGTERM");
    await h.done;
    expect(h.exits).toEqual([1]);
    expect(h.logs.join("\n")).toContain("forcing exit");
    h.server.closeAllConnections();
  });

  it("exits immediately on a second signal and runs onClose after draining", async () => {
    const onClose = vi.fn();
    const h = harness(() => {}, { onClose });
    await listen(h.server);
    h.proc.emit("SIGTERM", "SIGTERM");
    await h.done;
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(h.exits).toEqual([0]);

    const g = harness((_req, res) => setTimeout(() => res.end(), 500), {
      timeoutMs: 5000,
    });
    const port = await listen(g.server);
    void fetch(`http://127.0.0.1:${port}/`).catch(() => {});
    await new Promise(r => setTimeout(r, 30));
    g.proc.emit("SIGTERM", "SIGTERM");
    g.proc.emit("SIGTERM", "SIGTERM");
    await g.done;
    expect(g.exits[0]).toBe(1);
    g.server.closeAllConnections();
  });

  it("returns an uninstall function", () => {
    const server = createServer();
    const proc = new EventEmitter();
    const uninstall = installGracefulShutdown(server, {
      proc: proc as never,
      exit: () => {},
      log: () => {},
    });
    expect(proc.listenerCount("SIGTERM")).toBe(1);
    uninstall();
    expect(proc.listenerCount("SIGTERM")).toBe(0);
  });
});
