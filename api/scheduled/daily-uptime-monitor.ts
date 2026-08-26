import {
  scheduledDailyUptimeMonitor,
  type UptimeMonitorRequest,
  type UptimeMonitorResponse,
} from "../../server/api/uptime-monitor.js";

export default function handler(req: UptimeMonitorRequest, res: UptimeMonitorResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method-not-allowed" });
  }
  return scheduledDailyUptimeMonitor(req, res);
}
