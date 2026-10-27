import { and, asc, eq, gte, lt, or, sql } from "drizzle-orm";
import type { AnyMySqlColumn } from "drizzle-orm/mysql-core";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  mlbGames,
  mlbIngestionState,
  mlbPitches,
  mlbPlateAppearances,
  mlbPlayers,
} from "../../drizzle/schema.js";
import { STALE_PROCESSING_MS } from "./ingest.js";
import type {
  DiscoveredGame,
  StatusSummary,
  WarehouseStore,
  WorkItem,
} from "./ingest.js";
import type { ParsedGame } from "./parse.js";

const PITCH_INSERT_CHUNK = 500;

/** MySQL: 1213 = ER_LOCK_DEADLOCK, 1205 = ER_LOCK_WAIT_TIMEOUT. */
const RETRYABLE_LOCK_ERRNOS = new Set([1213, 1205]);
const RETRYABLE_LOCK_CODES = new Set([
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
]);

/**
 * Drizzle wraps driver errors (DrizzleQueryError.cause), so walk the cause
 * chain looking for a deadlock / lock-wait-timeout from the driver.
 */
export function isRetryableLockError(err: unknown): boolean {
  let cur: any = err;
  for (let depth = 0; cur && depth < 5; depth++) {
    if (
      RETRYABLE_LOCK_ERRNOS.has(cur.errno) ||
      RETRYABLE_LOCK_CODES.has(cur.code)
    ) {
      return true;
    }
    cur = cur.cause;
  }
  return false;
}

/**
 * InnoDB resolves a deadlock by rolling one transaction back; the right
 * response is to run it again. Jittered backoff keeps the colliding
 * transactions from colliding again in lockstep.
 */
export async function withLockRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  const attempts = opts.attempts ?? 5;
  const base = opts.baseDelayMs ?? 25;
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= attempts || !isRetryableLockError(err)) throw err;
      const delay = base * 2 ** (attempt - 1) * (0.5 + Math.random());
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

/** Reference the incoming value of a column inside ON DUPLICATE KEY UPDATE. */
const incoming = (column: AnyMySqlColumn) => sql`values(${column})`;

/**
 * Like incoming(), but a missing (NULL) incoming value keeps what we already
 * know. Feeds for different games disagree about which optional player fields
 * they carry (e.g. a call-up with no birth date yet); a sparse feed must not
 * erase a value a fuller one supplied.
 */
const incomingOrKeep = (column: AnyMySqlColumn) =>
  sql`coalesce(values(${column}), ${column})`;

export function createDrizzleWarehouseStore(
  db: MySql2Database<any>
): WarehouseStore {
  return {
    async registerGames(games: DiscoveredGame[]) {
      for (let i = 0; i < games.length; i += PITCH_INSERT_CHUNK) {
        const chunk = games.slice(i, i + PITCH_INSERT_CHUNK);
        if (chunk.length === 0) continue;
        await db
          .insert(mlbIngestionState)
          .values(
            chunk.map(g => ({
              gamePk: g.gamePk,
              season: g.season,
              officialDate: g.officialDate,
            }))
          )
          // Status/attempts are never reset (complete, failed, ... stay put),
          // but a rescheduled game's date follows the schedule. The schedule is the
          // single authority for season/date on this table; saveGame never writes them.
          .onDuplicateKeyUpdate({
            set: {
              season: incoming(mlbIngestionState.season),
              officialDate: incoming(mlbIngestionState.officialDate),
            },
          });
      }
    },

    async listWork({
      season,
      maxAttempts,
      staleBefore,
      limit,
    }): Promise<WorkItem[]> {
      const rows = await db
        .select({
          gamePk: mlbIngestionState.gamePk,
          attemptCount: mlbIngestionState.attemptCount,
        })
        .from(mlbIngestionState)
        .where(
          and(
            eq(mlbIngestionState.season, season),
            or(
              eq(mlbIngestionState.status, "pending"),
              and(
                eq(mlbIngestionState.status, "failed"),
                lt(mlbIngestionState.attemptCount, maxAttempts)
              ),
              and(
                eq(mlbIngestionState.status, "processing"),
                or(
                  sql`${mlbIngestionState.lastAttemptAt} is null`,
                  lt(mlbIngestionState.lastAttemptAt, staleBefore)
                )
              )
            )
          )
        )
        .orderBy(
          asc(mlbIngestionState.officialDate),
          asc(mlbIngestionState.gamePk)
        )
        .limit(limit);
      return rows;
    },

    async requeueComplete({ season, sinceDate }) {
      const [result] = await db
        .update(mlbIngestionState)
        // A requeued game starts a fresh retry budget; its earlier successes
        // must not count against it.
        .set({ status: "pending", attemptCount: 0 })
        .where(
          and(
            eq(mlbIngestionState.season, season),
            eq(mlbIngestionState.status, "complete"),
            gte(mlbIngestionState.officialDate, sinceDate)
          )
        );
      return Number((result as any)?.affectedRows ?? 0);
    },

    async requeueFailed({ season }) {
      const [result] = await db
        .update(mlbIngestionState)
        .set({ status: "pending", attemptCount: 0 })
        .where(
          and(
            eq(mlbIngestionState.season, season),
            eq(mlbIngestionState.status, "failed")
          )
        );
      return Number((result as any)?.affectedRows ?? 0);
    },

    async markProcessing(gamePk, now, claim) {
      const staleBefore =
        claim?.staleBefore ?? new Date(now.getTime() - STALE_PROCESSING_MS);
      // Single conditional UPDATE = the claim. MySQL serialises concurrent
      // updates on the row, and the loser re-evaluates the WHERE against the
      // winner's committed 'processing' + fresh lastAttemptAt, matching 0 rows.
      const failedEligible =
        claim?.maxAttempts === undefined
          ? eq(mlbIngestionState.status, "failed")
          : and(
              eq(mlbIngestionState.status, "failed"),
              lt(mlbIngestionState.attemptCount, claim.maxAttempts)
            );
      const [result] = await db
        .update(mlbIngestionState)
        .set({
          status: "processing",
          attemptCount: sql`${mlbIngestionState.attemptCount} + 1`,
          lastAttemptAt: now,
        })
        .where(
          and(
            eq(mlbIngestionState.gamePk, gamePk),
            or(
              eq(mlbIngestionState.status, "pending"),
              failedEligible,
              and(
                eq(mlbIngestionState.status, "processing"),
                or(
                  sql`${mlbIngestionState.lastAttemptAt} is null`,
                  lt(mlbIngestionState.lastAttemptAt, staleBefore)
                )
              )
            )
          )
        );
      return Number((result as any)?.affectedRows ?? 0) === 1;
    },

    async saveGame(parsed: ParsedGame, now) {
      const { game, pitches, plateAppearances } = parsed;
      // Always lock player rows in ascending id order. Two games written
      // concurrently share many players; inconsistent order is what makes
      // InnoDB deadlock. (Retry below is the backstop, not the fix.)
      const players = parsed.players.slice().sort((a, b) => a.mlbId - b.mlbId);
      await withLockRetry(() =>
        db.transaction(async tx => {
          await tx
            .insert(mlbGames)
            .values(game)
            .onDuplicateKeyUpdate({
              set: {
                season: incoming(mlbGames.season),
                gameType: incoming(mlbGames.gameType),
                officialDate: incoming(mlbGames.officialDate),
                startTime: incoming(mlbGames.startTime),
                dayNight: incoming(mlbGames.dayNight),
                doubleHeader: incoming(mlbGames.doubleHeader),
                gameNumber: incoming(mlbGames.gameNumber),
                statusCode: incoming(mlbGames.statusCode),
                detailedState: incoming(mlbGames.detailedState),
                homeTeamId: incoming(mlbGames.homeTeamId),
                homeTeamName: incoming(mlbGames.homeTeamName),
                homeTeamAbbr: incoming(mlbGames.homeTeamAbbr),
                awayTeamId: incoming(mlbGames.awayTeamId),
                awayTeamName: incoming(mlbGames.awayTeamName),
                awayTeamAbbr: incoming(mlbGames.awayTeamAbbr),
                venueId: incoming(mlbGames.venueId),
                venueName: incoming(mlbGames.venueName),
                weatherCondition: incoming(mlbGames.weatherCondition),
                weatherTemp: incoming(mlbGames.weatherTemp),
                weatherWind: incoming(mlbGames.weatherWind),
                homeScore: incoming(mlbGames.homeScore),
                awayScore: incoming(mlbGames.awayScore),
                parserVersion: incoming(mlbGames.parserVersion),
              },
            });

          if (players.length > 0) {
            await tx
              .insert(mlbPlayers)
              .values(players)
              .onDuplicateKeyUpdate({
                set: {
                  fullName: incoming(mlbPlayers.fullName),
                  firstName: incomingOrKeep(mlbPlayers.firstName),
                  lastName: incomingOrKeep(mlbPlayers.lastName),
                  position: incomingOrKeep(mlbPlayers.position),
                  bats: incomingOrKeep(mlbPlayers.bats),
                  throws: incomingOrKeep(mlbPlayers.throws),
                  birthDate: incomingOrKeep(mlbPlayers.birthDate),
                  active: incoming(mlbPlayers.active),
                },
              });
          }

          // Replace, don't merge: if MLB removed or re-indexed a pitch in a
          // correction, stale rows must not survive. Same transaction, so
          // readers never see a half-replaced game.
          await tx.delete(mlbPitches).where(eq(mlbPitches.gamePk, game.gamePk));
          for (let i = 0; i < pitches.length; i += PITCH_INSERT_CHUNK) {
            await tx
              .insert(mlbPitches)
              .values(pitches.slice(i, i + PITCH_INSERT_CHUNK));
          }

          // Same replace-not-merge rule for plate appearances.
          await tx
            .delete(mlbPlateAppearances)
            .where(eq(mlbPlateAppearances.gamePk, game.gamePk));
          for (
            let i = 0;
            i < plateAppearances.length;
            i += PITCH_INSERT_CHUNK
          ) {
            await tx
              .insert(mlbPlateAppearances)
              .values(plateAppearances.slice(i, i + PITCH_INSERT_CHUNK));
          }

          await tx
            .insert(mlbIngestionState)
            .values({
              gamePk: game.gamePk,
              season: game.season,
              officialDate: game.officialDate,
              status: "complete",
              lastSuccessAt: now,
              lastAttemptAt: now,
              pitchCount: pitches.length,
              parserVersion: game.parserVersion,
              error: null,
            })
            .onDuplicateKeyUpdate({
              set: {
                status: "complete",
                lastSuccessAt: now,
                // attemptCount means "failed/in-flight attempts since the last
                // success". Resetting here keeps a game that is refreshed often
                // from exhausting its retry budget by succeeding.
                attemptCount: 0,
                pitchCount: pitches.length,
                parserVersion: game.parserVersion,
                error: null,
              },
            });
        })
      );
    },

    async markFailed(gamePk, error, now) {
      await db
        .update(mlbIngestionState)
        .set({ status: "failed", error, lastAttemptAt: now })
        .where(eq(mlbIngestionState.gamePk, gamePk));
    },

    async summary(season): Promise<StatusSummary> {
      const rows = await db
        .select({
          status: mlbIngestionState.status,
          n: sql<number>`count(*)`,
        })
        .from(mlbIngestionState)
        .where(eq(mlbIngestionState.season, season))
        .groupBy(mlbIngestionState.status);
      const out: StatusSummary = {
        pending: 0,
        processing: 0,
        complete: 0,
        failed: 0,
      };
      for (const r of rows) out[r.status] = Number(r.n);
      return out;
    },
  };
}
