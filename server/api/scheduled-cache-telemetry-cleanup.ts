import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { cleanupExpiredCacheTelemetry } from "../cache-health";

export async function scheduledCacheTelemetryCleanup(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only" });
    const result = await cleanupExpiredCacheTelemetry();
    return res.json({
      ok: true,
      cleanup: "cache-telemetry",
      retentionDays: 30,
      ...result,
      executedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Cache telemetry cleanup failed";
    console.error("[scheduled-cache-telemetry-cleanup]", error);
    return res.status(500).json({ error: message, timestamp: new Date().toISOString() });
  }
}
