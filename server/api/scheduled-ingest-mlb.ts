import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";
import {
  currentMlbSeason,
  runIngestion,
  splitFailures,
} from "../mlb-warehouse/ingest";
import { createDrizzleWarehouseStore } from "../mlb-warehouse/store";

// Sizing: ~15 games/day, so a 2-day refresh window requeues ~30 plus ~15 new games;
// the limit must stay above that or the backlog grows every night.
// Daily, bounded warehouse refresh for owner-managed Heartbeat. Small batches are
// safe because every game carries its own resumable state; leftover work is picked
// up on the next call. Autoscaled instances may overlap: the atomic game claim in
// the store keeps them from double-processing a game.
const DEFAULTS = {
  limit: 80,
  refreshRecentDays: 2,
  discoverSinceDays: 10,
  concurrency: 2,
};

export async function scheduledIngestMlb(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) return res.status(403).json({ error: "cron-only" });

    const db = await getDb();
    if (!db) {
      return res
        .status(503)
        .json({ ok: false, reason: "database-not-configured" });
    }

    const season = currentMlbSeason();
    const report = await runIngestion(
      { season, ...DEFAULTS },
      { store: createDrizzleWarehouseStore(db) }
    );
    const { knownEmpty, actionable } = splitFailures(report.failures);

    // 200 even when some games failed: the failures are reported data, and a 500
    // would make Heartbeat retry a run that already did useful work. `ok` is false
    // only for failures someone can act on (known-empty games never recover).
    return res.json({
      ok: actionable.length === 0 && report.discoveryErrors.length === 0,
      season,
      discovered: report.discovered,
      attempted: report.attempted,
      succeeded: report.succeeded,
      skipped: report.skipped,
      requeuedForRefresh: report.requeuedForRefresh,
      discoveryErrors: report.discoveryErrors,
      actionableFailures: actionable.slice(0, 20),
      knownEmptyGames: knownEmpty.map(f => f.gamePk),
      status: report.status,
      parserVersion: report.parserVersion,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "MLB warehouse ingest failed";
    console.error("[scheduled-ingest-mlb]", error);
    return res
      .status(500)
      .json({ error: message, timestamp: new Date().toISOString() });
  }
}
