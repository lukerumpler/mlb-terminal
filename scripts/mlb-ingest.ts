/**
 * Ingest MLB game data into the SKIP warehouse (mlb_games / mlb_pitches / ...).
 *
 *   pnpm ingest:mlb --season 2026                 # discover + ingest, up to 200 games
 *   pnpm ingest:mlb --season 2026 --limit 1000    # larger batch
 *   pnpm ingest:mlb --season 2026 --refresh-days 3  # also re-ingest recent games (MLB corrections)
 *   pnpm ingest:mlb --season 2026 --skip-discovery  # only work the existing queue
 *   pnpm ingest:mlb --season 2026 --status          # print queue status, change nothing
 *
 * Safe to re-run: completed games are skipped, failed games are retried up to
 * --max-attempts, and re-ingesting a game replaces (never duplicates) its pitches.
 * Requires DATABASE_URL and the 0005_mlb_warehouse migration (pnpm db:push).
 */
import { getDb } from "../server/db.js";
import { runIngestion } from "../server/mlb-warehouse/ingest.js";
import { createDrizzleWarehouseStore } from "../server/mlb-warehouse/store.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const numArg = (name: string): number | undefined => {
  const v = arg(name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 0) {
    console.error(`--${name} must be a non-negative integer, got "${v}"`);
    process.exit(2);
  }
  return n;
};

async function main() {
  const season = numArg("season") ?? new Date().getUTCFullYear();
  const db = await getDb();
  if (!db) {
    console.error("DATABASE_URL is not set or the database is unreachable.");
    process.exit(2);
  }
  const store = createDrizzleWarehouseStore(db);

  if (flag("status")) {
    console.log(JSON.stringify({ season, status: await store.summary(season) }, null, 2));
    return;
  }

  const report = await runIngestion(
    {
      season,
      limit: numArg("limit"),
      maxAttempts: numArg("max-attempts"),
      concurrency: numArg("concurrency"),
      refreshRecentDays: numArg("refresh-days"),
      skipDiscovery: flag("skip-discovery"),
    },
    { store }
  );

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(err);
  process.exit(2);
});
