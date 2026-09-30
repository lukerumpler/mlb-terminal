/**
 * Ingest MLB game data into the SKIP warehouse (mlb_games / mlb_pitches / ...).
 *
 *   pnpm ingest:mlb --season 2026                 # discover + ingest, up to 200 games
 *   pnpm ingest:mlb --season 2026 --limit 1000    # larger batch
 *   pnpm ingest:mlb --season 2026 --refresh-days 3  # also re-ingest recent games (MLB corrections)
 *   pnpm ingest:mlb --season 2026 --skip-discovery  # only work the existing queue
 *   pnpm ingest:mlb --season 2026 --requeue-failed  # give games that exhausted --max-attempts a fresh budget
 *   pnpm ingest:mlb --season 2026 --status          # print queue status, change nothing
 *
 * Safe to re-run: completed games are skipped, failed games are retried up to
 * --max-attempts, and re-ingesting a game replaces (never duplicates) its pitches.
 * Requires DATABASE_URL and the 0005_mlb_warehouse migration (pnpm db:push).
 */
import { getDb } from "../server/db.js";
import { checkArgs } from "../server/mlb-warehouse/cliArgs.js";
import { isValidSeason, runIngestion } from "../server/mlb-warehouse/ingest.js";
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

/** Runs the requested action and returns the process exit code. */
async function main(): Promise<number> {
  const argError = checkArgs(
    process.argv.slice(2),
    ["season", "limit", "max-attempts", "concurrency", "refresh-days"],
    ["status", "requeue-failed", "skip-discovery"]
  );
  if (argError) {
    console.error(
      `${argError}. See the usage at the top of scripts/mlb-ingest.ts.`
    );
    return 2;
  }
  const season = numArg("season") ?? new Date().getUTCFullYear();
  if (!isValidSeason(season)) {
    console.error(
      `--season must be a year from 1876 to next year, got ${season}`
    );
    return 2;
  }
  const db = await getDb();
  if (!db) {
    console.error("DATABASE_URL is not set or the database is unreachable.");
    return 2;
  }

  try {
    const store = createDrizzleWarehouseStore(db);

    if (flag("status")) {
      console.log(
        JSON.stringify({ season, status: await store.summary(season) }, null, 2)
      );
      return 0;
    }

    if (flag("requeue-failed")) {
      const n = await store.requeueFailed({ season });
      console.error(`Requeued ${n} failed game(s) for season ${season}.`);
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
    // Non-zero when anything needs a human: a failed game, or a schedule
    // window that could not be read (so discovery may be incomplete).
    return report.failed > 0 || report.discoveryErrors.length > 0 ? 1 : 0;
  } finally {
    // The mysql2 pool keeps the event loop alive; without this every code
    // path that returns normally (e.g. --status) hangs instead of exiting.
    await (db as any).$client?.end?.();
  }
}

main().then(
  code => process.exit(code),
  err => {
    console.error(err);
    process.exit(2);
  }
);
