import { getDb } from "../db.js";
import { createMlbWarehouseQueries } from "../mlb-warehouse/queries.js";

/**
 * Keep this helper separate from the route's lazy import. As a TypeScript module,
 * Vercel compiles these static `.js` specifiers to the database and query modules,
 * while database initialization errors remain inside the route's 503 handler.
 */
export async function loadMlbWarehouseQueries() {
  const db = await getDb();
  if (!db) return null;
  return createMlbWarehouseQueries(db);
}
