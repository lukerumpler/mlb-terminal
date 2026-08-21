import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Vercel API routing", () => {
  it("bundles the primary and catch-all API entries from explicit shared-handler imports", () => {
    const catchAllSource = readFileSync(
      resolve(process.cwd(), "api/[...path].ts"),
      "utf8"
    );
    const primarySource = readFileSync(
      resolve(process.cwd(), "api/index.ts"),
      "utf8"
    );
    expect(catchAllSource).toContain('import handler from "../server/vercel-handler";');
    expect(catchAllSource).toContain("export default handler;");
    expect(catchAllSource).not.toContain('from "./index"');
    expect(primarySource).toContain('import handler, {');
    expect(primarySource).toContain('} from "../server/vercel-handler";');
    expect(primarySource).toContain("export { normalizeServerlessRequestUrl };");
    expect(primarySource).toContain("export default handler;");
  });

  it("handles anonymous nested tRPC auth requests before dynamic app loading", () => {
    const source = readFileSync(
      resolve(process.cwd(), "api/trpc/[...path].ts"),
      "utf8"
    );
    expect(source).toContain("isAnonymousAuthMe");
    expect(source).toContain("result: { data: { json: null } }");
  });

  it("gives uptime monitoring dedicated serverless entries outside the heavyweight catch-all", () => {
    const dashboardSource = readFileSync(
      resolve(process.cwd(), "api/uptime-monitor.ts"),
      "utf8"
    );
    const scheduledSource = readFileSync(
      resolve(process.cwd(), "api/scheduled/daily-uptime-monitor.ts"),
      "utf8"
    );

    expect(dashboardSource).toContain('from "../server/api/uptime-monitor"');
    expect(dashboardSource).toContain("serveUptimeMonitorDashboard");
    expect(scheduledSource).toContain('from "../../server/api/uptime-monitor"');
    expect(scheduledSource).toContain("scheduledDailyUptimeMonitor");
  });

  it("keeps uptime database access handler-bound so initialization errors become controlled responses", () => {
    const source = readFileSync(resolve(process.cwd(), "server/api/uptime-monitor.ts"), "utf8");

    expect(source).not.toContain('from "../db"');
    expect(source).toContain('await import("../db")');
  });
});
