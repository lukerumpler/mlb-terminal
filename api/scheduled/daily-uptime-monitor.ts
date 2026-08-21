import type { Request, Response } from "express";
import { scheduledDailyUptimeMonitor } from "../../server/api/uptime-monitor";

export default function handler(req: Request, res: Response) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method-not-allowed" });
  }
  return scheduledDailyUptimeMonitor(req, res);
}
