import type { Request, Response } from "express";
import { sdk } from "../_core/sdk";
import { getDb } from "../db";
import { runSnapshot } from "../mlb-warehouse/seasonStats";
import { createDrizzleSeasonStatStore } from "../mlb-warehouse/seasonStatsStore";

const MLB_BASE = "https://statsapi.mlb.com/api/v1";
export const currentMlbSeason = () => new Date().getUTCFullYear();
export async function fetchMlbJson(path: string) {
  const response = await fetch(
    path.startsWith("http") ? path : `${MLB_BASE}${path}`
  );
  if (!response.ok)
    throw new Error(`MLB API responded with ${response.status}`);
  return response.json();
}

// Daily season-stat snapshot for owner-managed Heartbeat. Same-day reruns replace
// that day's observations; the report remains HTTP 200 with ok:false on group failure.
export async function scheduledSnapshotStats(req: Request, res: Response) {
  try {
    const user = await sdk.authenticateRequest(req);
    if (!user.isCron) return res.status(403).json({ error: "cron-only" });
    const db = await getDb();
    if (!db)
      return res
        .status(503)
        .json({ ok: false, reason: "database-not-configured" });
    const report = await runSnapshot(
      { season: currentMlbSeason() },
      { fetchJson: fetchMlbJson, store: createDrizzleSeasonStatStore(db) }
    );
    return res.json(report);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Season stat snapshot failed";
    console.error("[scheduled-snapshot-stats]", error);
    return res
      .status(500)
      .json({ error: message, timestamp: new Date().toISOString() });
  }
}
