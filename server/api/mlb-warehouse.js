import { applyCors, isRateLimited, rateLimitResponse } from "./_shared.js";

// Read-only HTTP surface over the MLB warehouse (server/mlb-warehouse/queries.ts).
// Everything is loaded lazily so a missing DATABASE_URL, a missing migration or a
// driver problem becomes a controlled "unavailable" response instead of taking
// down unrelated routes at function initialization (same rule as the Vercel
// catch-all).

const SOURCE = "MLB Stats API (SKIP warehouse)";
const VIEWS = ["status", "arsenal", "pitches", "game", "team-games"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Warehouse break values come straight from the MLB feed. They are NOT the same
// quantity as Baseball Savant's pfx_x / pitcher_break_x (a recorded fixture reads
// -4.1 vs +2.83 for the same pitch), so consumers must not plot them together.
const FIELD_NOTES = {
  avgIVB: "breakVerticalInduced (MLB Stats API)",
  avgHB:
    "breakHorizontal (MLB Stats API); sign and magnitude differ from Savant pfx_x, do not mix sources",
};

class BadRequest extends Error {}

function positiveInt(
  query,
  name,
  { required = true, max = 2_000_000_000 } = {}
) {
  const raw = query?.[name];
  if (raw === undefined || raw === "") {
    if (required) throw new BadRequest(`${name} is required`);
    return undefined;
  }
  if (typeof raw !== "string" || !/^[0-9]{1,10}$/.test(raw)) {
    throw new BadRequest(`${name} must be a positive integer`);
  }
  const value = Number(raw);
  if (value < 1 || value > max) throw new BadRequest(`${name} is out of range`);
  return value;
}

function season(query) {
  const value = positiveInt(query, "season");
  const latest = new Date().getUTCFullYear() + 1;
  if (value < 1876 || value > latest)
    throw new BadRequest("season is out of range");
  return value;
}

function optionalDate(query, name) {
  const raw = query?.[name];
  if (raw === undefined || raw === "") return undefined;
  if (
    typeof raw !== "string" ||
    !DATE_RE.test(raw) ||
    Number.isNaN(Date.parse(raw))
  ) {
    throw new BadRequest(`${name} must be YYYY-MM-DD`);
  }
  return raw;
}

function unavailable(res, reason) {
  res.setHeader("Cache-Control", "no-store");
  return res.status(503).json({ available: false, source: SOURCE, reason });
}

export default async function mlbWarehouseHandler(req, res) {
  applyCors(req, res);
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET")
    return res.status(405).json({ error: "Method not allowed" });
  if (isRateLimited(req, "mlb-warehouse")) return rateLimitResponse(res);

  const query = req.query || {};
  const view = typeof query.view === "string" ? query.view : "";
  if (!VIEWS.includes(view)) {
    return res
      .status(400)
      .json({ error: `view must be one of: ${VIEWS.join(", ")}` });
  }

  // Validate before touching the database so bad input never costs a connection.
  let run;
  try {
    const page = positiveInt(query, "page", { required: false, max: 100_000 });
    const pageSize = positiveInt(query, "pageSize", {
      required: false,
      max: 250,
    });
    if (view === "status") {
      const s = season(query);
      run = q =>
        q.getIngestionStatus(s).then(status => ({ season: s, status }));
    } else if (view === "arsenal") {
      const player = positiveInt(query, "player");
      const s = season(query);
      run = q =>
        q.getPlayerArsenal(player, s).then(arsenal => ({
          season: s,
          player,
          arsenal,
          fieldNotes: FIELD_NOTES,
        }));
    } else if (view === "pitches") {
      const player = positiveInt(query, "player");
      const s = season(query);
      const from = optionalDate(query, "from");
      const to = optionalDate(query, "to");
      run = q =>
        q
          .getPlayerPitches(player, s, { from, to, page, pageSize })
          .then(result => ({
            season: s,
            player,
            ...result,
            fieldNotes: FIELD_NOTES,
          }));
    } else if (view === "game") {
      const game = positiveInt(query, "game");
      run = async q => {
        const found = await q.getGame(game);
        if (!found) return { notFound: true };
        const pitches = await q.getGamePitches(game, { page, pageSize });
        return { game: found, ...pitches, fieldNotes: FIELD_NOTES };
      };
    } else {
      const team = positiveInt(query, "team");
      const s = season(query);
      const limit = positiveInt(query, "limit", { required: false, max: 250 });
      run = q =>
        q
          .getTeamGames(team, s, limit)
          .then(games => ({ season: s, team, games }));
    }
  } catch (error) {
    if (error instanceof BadRequest)
      return res.status(400).json({ error: error.message });
    throw error;
  }

  let queries;
  try {
    const { getDb } = await import("../db.ts");
    const db = await getDb();
    if (!db) return unavailable(res, "database-not-configured");
    const { createMlbWarehouseQueries } = await import(
      "../mlb-warehouse/queries.ts"
    );
    queries = createMlbWarehouseQueries(db);
  } catch (error) {
    console.error("[mlb-warehouse] init failed", error);
    return unavailable(res, "warehouse-init-failed");
  }

  try {
    const data = await run(queries);
    if (data.notFound) {
      res.setHeader("Cache-Control", "no-store");
      return res
        .status(404)
        .json({ available: true, source: SOURCE, view, error: "Not found" });
    }
    // Finished-game data changes slowly; ingestion status is the exception.
    res.setHeader(
      "Cache-Control",
      view === "status"
        ? "public, s-maxage=60, stale-while-revalidate=300"
        : "public, s-maxage=300, stale-while-revalidate=1800"
    );
    return res
      .status(200)
      .json({ available: true, source: SOURCE, view, ...data });
  } catch (error) {
    // Typically: migration 0005 not applied yet, or the database is unreachable.
    console.error(`[mlb-warehouse] ${view} query failed`, error);
    return unavailable(res, "warehouse-query-failed");
  }
}
