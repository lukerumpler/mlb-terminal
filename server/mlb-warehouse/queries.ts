/**
 * Read-side warehouse queries used by API routes and the SKIP dashboard.
 *
 * Keeping these queries outside route handlers prevents each page from
 * inventing its own SQL and gives us one place to enforce pagination/limits.
 */
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  mlbGames,
  mlbIngestionState,
  mlbPitches,
  mlbPlayers,
} from "../../drizzle/schema.js";

const MAX_PAGE_SIZE = 250;
/** Keeps (page - 1) * pageSize far inside Number.MAX_SAFE_INTEGER. */
const MAX_PAGE = 100_000;

/** Route handlers hand us Number(req.query.x): NaN/Infinity must not reach SQL. */
const toInt = (value: number | undefined, fallback: number) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.trunc(value)
    : fallback;

export const clampPageSize = (value: number | undefined) =>
  Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(value, 50)));
export const clampPage = (value: number | undefined) =>
  Math.min(MAX_PAGE, Math.max(1, toInt(value, 1)));

export function createMlbWarehouseQueries(db: MySql2Database<any>) {
  return {
    async getGame(gamePk: number) {
      const [game] = await db
        .select()
        .from(mlbGames)
        .where(eq(mlbGames.gamePk, gamePk))
        .limit(1);
      return game ?? null;
    },

    async getGamePitches(
      gamePk: number,
      opts: { page?: number; pageSize?: number } = {}
    ) {
      const page = clampPage(opts.page);
      const pageSize = clampPageSize(opts.pageSize);
      const offset = (page - 1) * pageSize;
      const pitches = await db
        .select()
        .from(mlbPitches)
        .where(eq(mlbPitches.gamePk, gamePk))
        .orderBy(mlbPitches.atBatIndex, mlbPitches.eventIndex)
        .limit(pageSize)
        .offset(offset);
      return { page, pageSize, pitches };
    },

    async getPlayer(playerId: number) {
      const [player] = await db
        .select()
        .from(mlbPlayers)
        .where(eq(mlbPlayers.mlbId, playerId))
        .limit(1);
      return player ?? null;
    },

    async getPlayerArsenal(playerId: number, season: number) {
      const rows = await db
        .select({
          pitchType: mlbPitches.skipPitchType,
          pitches: sql<number>`count(*)`,
          avgVelocity: sql<number | null>`avg(${mlbPitches.startSpeed})`,
          avgSpinRate: sql<number | null>`avg(${mlbPitches.spinRate})`,
          avgIVB: sql<number | null>`avg(${mlbPitches.breakVerticalInduced})`,
          avgHB: sql<number | null>`avg(${mlbPitches.breakHorizontal})`,
          avgPfxX: sql<number | null>`avg(${mlbPitches.pfxX})`,
          avgPfxZ: sql<number | null>`avg(${mlbPitches.pfxZ})`,
        })
        .from(mlbPitches)
        .where(
          and(
            eq(mlbPitches.pitcherId, playerId),
            eq(mlbPitches.season, season),
            sql`${mlbPitches.skipPitchType} is not null`
          )
        )
        .groupBy(mlbPitches.skipPitchType)
        .orderBy(desc(sql`count(*)`));

      return rows.map(row => ({
        pitchType: row.pitchType,
        pitches: Number(row.pitches),
        avgVelocity: row.avgVelocity == null ? null : Number(row.avgVelocity),
        avgSpinRate: row.avgSpinRate == null ? null : Number(row.avgSpinRate),
        avgIVB: row.avgIVB == null ? null : Number(row.avgIVB),
        avgHB: row.avgHB == null ? null : Number(row.avgHB),
        avgPfxX: row.avgPfxX == null ? null : Number(row.avgPfxX),
        avgPfxZ: row.avgPfxZ == null ? null : Number(row.avgPfxZ),
      }));
    },

    async getPlayerPitches(
      playerId: number,
      season: number,
      opts: {
        from?: string;
        to?: string;
        page?: number;
        pageSize?: number;
      } = {}
    ) {
      const page = clampPage(opts.page);
      const pageSize = clampPageSize(opts.pageSize);
      const offset = (page - 1) * pageSize;
      const conditions = [
        eq(mlbPitches.pitcherId, playerId),
        eq(mlbPitches.season, season),
      ];
      if (opts.from) conditions.push(gte(mlbPitches.officialDate, opts.from));
      if (opts.to) conditions.push(lte(mlbPitches.officialDate, opts.to));

      const pitches = await db
        .select()
        .from(mlbPitches)
        .where(and(...conditions))
        .orderBy(
          desc(mlbPitches.officialDate),
          desc(mlbPitches.gamePk),
          desc(mlbPitches.atBatIndex),
          desc(mlbPitches.eventIndex)
        )
        .limit(pageSize)
        .offset(offset);
      return { page, pageSize, pitches };
    },

    async getTeamGames(teamId: number, season: number, limit = 100) {
      const safeLimit = Math.min(MAX_PAGE_SIZE, Math.max(1, toInt(limit, 100)));
      return db
        .select()
        .from(mlbGames)
        .where(
          and(
            eq(mlbGames.season, season),
            sql`(${mlbGames.homeTeamId} = ${teamId} or ${mlbGames.awayTeamId} = ${teamId})`
          )
        )
        .orderBy(desc(mlbGames.officialDate), desc(mlbGames.gamePk))
        .limit(safeLimit);
    },

    async getIngestionStatus(season: number) {
      const rows = await db
        .select({
          status: mlbIngestionState.status,
          count: sql<number>`count(*)`,
        })
        .from(mlbIngestionState)
        .where(eq(mlbIngestionState.season, season))
        .groupBy(mlbIngestionState.status);

      const status = { pending: 0, processing: 0, complete: 0, failed: 0 };
      for (const row of rows) status[row.status] = Number(row.count);
      return status;
    },
  };
}
