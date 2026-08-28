import { readFileSync } from "node:fs";
import path from "node:path";
import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";

// Serves historical per-player season rows only to supplement a missing career
// season for an already identified player. The client never uses this endpoint
// to expand search results or replace live MLB statistics.
const DATA_PATH = path.join(process.cwd(), "server", "data", "lahman", "players.json");

let cachedDataset = null;
function loadDataset() {
  if (cachedDataset) return cachedDataset;
  try {
    cachedDataset = JSON.parse(readFileSync(DATA_PATH, "utf8"));
  } catch {
    cachedDataset = { players: {} };
  }
  return cachedDataset;
}

export default async function lahmanHandler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  if (isRateLimited(req, "lahman")) return rateLimitResponse(res);

  const mlbam = String(req.query?.mlbam || "").trim();
  if (!/^[0-9]+$/.test(mlbam)) {
    return res.status(400).json({ error: "Valid mlbam parameter is required" });
  }

  const dataset = loadDataset();
  const player = dataset.players?.[mlbam];
  if (!player) return res.status(200).json({ found: false, mlbam });

  return res.status(200).json({
    found: true,
    mlbam,
    source: "Lahman baseball database",
    sourceVersion: dataset.sourceVersion || null,
    batting: player.batting || [],
    pitching: player.pitching || [],
  });
}
