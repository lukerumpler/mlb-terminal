import type { Request, Response } from "express";
import { serveUptimeMonitorDashboard } from "../server/api/uptime-monitor";

export default function handler(req: Request, res: Response) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method-not-allowed" });
  }
  return serveUptimeMonitorDashboard(req, res);
}
