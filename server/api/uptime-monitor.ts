import type { Express, Request, Response } from "express";
import type { UptimeMonitorCheck } from "../../drizzle/schema";
import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";

export const UPTIME_MONITOR_ENDPOINTS = [
  { key: "mlbApi", label: "MLB API health", url: "https://mlb-terminal.vercel.app/api/health" },
  { key: "mlbPublic", label: "MLB Terminal", url: "https://mlb-terminal.vercel.app/" },
  { key: "skipPlatform", label: "SKIP platform", url: "https://skipbasebal-mm6hz9ps.manus.space" },
  { key: "lukerumpler", label: "lukerumpler.com", url: "https://lukerumpler.com" },
] as const;

export function isPassingUptimeStatus(statusCode: number) {
  return statusCode >= 200 && statusCode < 400;
}

export function buildDailyUptimeRunKey(checkedAt: Date) {
  return `daily:${checkedAt.toISOString().slice(0, 10)}`;
}

export async function probeUptimeEndpoint(endpoint: string, runKey: string, checkedAt = new Date(), fetchImpl: typeof fetch = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const startedAt = performance.now();
  try {
    const response = await fetchImpl(endpoint, { method: "GET", redirect: "follow", signal: controller.signal, headers: { "User-Agent": "SKIP-Uptime-Monitor/1.0" } });
    const latencyMs = Math.max(0, Math.round(performance.now() - startedAt));
    return { endpoint, statusCode: response.status, latencyMs, passed: isPassingUptimeStatus(response.status), checkedAt, runKey };
  } catch {
    return { endpoint, statusCode: 0, latencyMs: Math.max(0, Math.round(performance.now() - startedAt)), passed: false, checkedAt, runKey };
  } finally {
    clearTimeout(timeout);
  }
}

export async function runUptimeMonitorBatch(runKey: string, checkedAt = new Date(), fetchImpl: typeof fetch = fetch) {
  const results = await Promise.all(UPTIME_MONITOR_ENDPOINTS.map(target => probeUptimeEndpoint(target.url, runKey, checkedAt, fetchImpl)));
  const { recordUptimeMonitorCheck } = await import("../db");
  await Promise.all(results.map(result => recordUptimeMonitorCheck(result)));
  return results;
}

function summaryForTarget(target: (typeof UPTIME_MONITOR_ENDPOINTS)[number], checks: UptimeMonitorCheck[]) {
  const matching = checks.filter(check => check.endpoint === target.url);
  const passed = matching.filter(check => check.passed).length;
  const total = matching.length;
  return {
    ...target,
    total,
    passed,
    failed: total - passed,
    uptimePercent: total ? Number(((passed / total) * 100).toFixed(2)) : null,
    averageLatencyMs: total ? Math.round(matching.reduce((sum, check) => sum + check.latencyMs, 0) / total) : null,
    latest: matching[0] ?? null,
  };
}

export async function getUptimeMonitorDashboard(days: 7 | 30) {
  const now = new Date();
  const since30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const { listUptimeMonitorChecksSince } = await import("../db");
  const all30DayChecks = await listUptimeMonitorChecksSince(since30Days);
  const sinceSelectedRange = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const selectedChecks = all30DayChecks.filter(check => check.checkedAt >= sinceSelectedRange);
  return {
    generatedAt: now,
    rangeDays: days,
    targets: UPTIME_MONITOR_ENDPOINTS.map(target => summaryForTarget(target, selectedChecks)),
    trend30Days: [...all30DayChecks].sort((a, b) => a.checkedAt.getTime() - b.checkedAt.getTime()),
    recentByTarget: UPTIME_MONITOR_ENDPOINTS.map(target => ({ ...target, checks: all30DayChecks.filter(check => check.endpoint === target.url).slice(0, 50) })),
  };
}

export async function scheduledDailyUptimeMonitor(req: Request, res: Response) {
  try {
    const { sdk } = await import("../_core/sdk");
    const user = await sdk.authenticateRequest(req as unknown as Request);
    if (!user.isCron || !user.taskUid) return res.status(403).json({ error: "cron-only", timestamp: new Date().toISOString() });
    const { getUptimeMonitorScheduleByTaskUid } = await import("../db");
    const schedule = await getUptimeMonitorScheduleByTaskUid(user.taskUid);
    if (!schedule || !schedule.enabled) return res.json({ ok: true, skipped: "orphaned-or-disabled-schedule" });
    const checkedAt = new Date();
    const results = await runUptimeMonitorBatch(buildDailyUptimeRunKey(checkedAt), checkedAt);
    return res.json({ ok: true, checkedAt: checkedAt.toISOString(), results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[uptime-monitor] scheduled run failed", message);
    return res.status(500).json({ error: message, context: { url: req.originalUrl }, timestamp: new Date().toISOString() });
  }
}

export async function serveUptimeMonitorDashboard(
  req: Request,
  res: Response,
  loadDashboard: typeof getUptimeMonitorDashboard = getUptimeMonitorDashboard
) {
  applyCors(req, res);
  if (isRateLimited(req, "uptime-monitor")) return rateLimitResponse(res);
  try {
    const requestedDays = Number(req.query.days);
    const days: 7 | 30 = requestedDays === 30 ? 30 : 7;
    res.setHeader("Cache-Control", "private, max-age=15");
    return res.json(await loadDashboard(days));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[uptime-monitor] dashboard query failed", message);
    return res.status(503).json({ error: "uptime-monitor-unavailable" });
  }
}

export function registerUptimeMonitorRoutes(
  app: Express,
  loadDashboard: typeof getUptimeMonitorDashboard = getUptimeMonitorDashboard
) {
  app.get("/api/uptime-monitor", (req, res) => serveUptimeMonitorDashboard(req, res, loadDashboard));
  app.post("/api/scheduled/daily-uptime-monitor", scheduledDailyUptimeMonitor);
}
