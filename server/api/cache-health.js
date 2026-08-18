import { applyCors } from "./_shared.js";
import { readCacheHealth } from "../cache-health";

export default async function handler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  const health = await readCacheHealth();
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ...health, source: "SKIP cache telemetry" });
}
