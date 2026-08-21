import {
  serveUptimeMonitorDashboard,
  type UptimeMonitorRequest,
  type UptimeMonitorResponse,
} from "../server/api/uptime-monitor.js";

export default function handler(req: UptimeMonitorRequest, res: UptimeMonitorResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "method-not-allowed" });
  }
  return serveUptimeMonitorDashboard(req, res);
}
