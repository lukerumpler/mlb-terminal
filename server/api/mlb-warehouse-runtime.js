import { getDb } from "../db.ts";
import { createMlbWarehouseQueries } from "../mlb-warehouse/queries.ts";

/**
 * Keep this helper separate from the route's lazy import. Static TypeScript
 * imports here let Vercel trace the database modules into the function bundle,
 * while database initialization errors remain inside the route's 503 handler.
 */
export async function loadMlbWarehouseQueries() {
  const db = await getDb();
  if (!db) return null;
  return createMlbWarehouseQueries(db);
}
