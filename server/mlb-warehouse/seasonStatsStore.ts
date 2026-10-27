import { getTableColumns, sql } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import { mlbSeasonStatSnapshots } from "../../drizzle/schema.js";
import type { SeasonStatStore, SeasonStatSnapshotRow } from "./seasonStats.js";

async function withLockRetry<T>(operation: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const code = (error as { code?: string })?.code;
      if (
        attempt >= 2 ||
        (code !== "ER_LOCK_DEADLOCK" && code !== "ER_LOCK_WAIT_TIMEOUT")
      ) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }
}

const CHUNK = 500;
const KEY_COLUMNS = new Set([
  "playerId",
  "season",
  "statGroup",
  "teamId",
  "snapshotDate",
  "source",
]);
const incoming = (column: AnyMySqlColumn) => sql`values(${column})`;

/**
 * Same-day rerun = replace that day's row with the latest observation (NULL
 * included, so a field the provider dropped is not left stale). Different day
 * = different primary key = a new row; older days are never touched.
 *
 * inserted/updated are derived from MySQL's affectedRows (1 per insert, 2 per
 * changed duplicate). ingested_at differs every run, so a duplicate always
 * counts as changed: updated = affected - n, inserted = 2n - affected.
 */
export function createDrizzleSeasonStatStore(
  db: MySql2Database<any>
): SeasonStatStore {
  const set: Record<string, any> = {};
  for (const [prop, column] of Object.entries(
    getTableColumns(mlbSeasonStatSnapshots)
  )) {
    if (!KEY_COLUMNS.has(prop)) set[prop] = incoming(column);
  }
  return {
    async upsertSnapshots(rows: SeasonStatSnapshotRow[]) {
      let inserted = 0;
      let updated = 0;
      let known = true;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const [header] = (await withLockRetry(() =>
          db
            .insert(mlbSeasonStatSnapshots)
            .values(chunk as any)
            .onDuplicateKeyUpdate({ set })
        )) as any;
        const affected = Number(header?.affectedRows);
        if (!Number.isFinite(affected)) {
          known = false;
          continue;
        }
        updated += affected - chunk.length;
        inserted += 2 * chunk.length - affected;
      }
      return known ? { inserted, updated } : { inserted: null, updated: null };
    },
  };
}
