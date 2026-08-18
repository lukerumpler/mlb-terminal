import express, { type Express } from "express";
import type { Server } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./_core/oauth";
import { registerStorageProxy } from "./_core/storageProxy";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { registerLegacyApiRoutes, legacyApiErrorHandler } from "./api/routes";
import { serveStatic, setupVite } from "./_core/vite";
import { scheduledSavantRefresh } from "./api/scheduled-savant-refresh";
import { scheduledCacheTelemetryCleanup } from "./api/scheduled-cache-telemetry-cleanup";
import { registerUptimeMonitorRoutes } from "./api/uptime-monitor";

export type CreateAppOptions = {
  serveFrontend?: boolean;
  viteServer?: Server;
};

/**
 * Builds the shared Express app used by both the local server and Vercel.
 * Vercel receives only the API middleware; the Vite frontend is served from
 * dist/public by Vercel's static output configuration.
 */
export async function createApp({
  serveFrontend = false,
  viteServer,
}: CreateAppOptions = {}): Promise<Express> {
  const app = express();

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, service: "skip-baseball-api" });
  });

  app.post("/api/scheduled/refresh-savant", scheduledSavantRefresh);
  app.post("/api/scheduled/cleanup-cache-telemetry", scheduledCacheTelemetryCleanup);
  registerUptimeMonitorRoutes(app);

  registerStorageProxy(app);
  registerOAuthRoutes(app);
  await registerLegacyApiRoutes(app);
  app.use(legacyApiErrorHandler);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (serveFrontend) {
    if (!viteServer) {
      throw new Error(
        "A Vite HTTP server is required when serveFrontend is enabled"
      );
    }
    if (process.env.NODE_ENV === "development") {
      await setupVite(app, viteServer);
    } else {
      serveStatic(app);
    }
  }

  return app;
}
