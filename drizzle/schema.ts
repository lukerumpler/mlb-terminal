import {
  boolean,
  date,
  datetime,
  double,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  longtext,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Shared server-side API cache. Payloads are provider responses only; callers
 * still decide whether a fresh or stale record is acceptable for their route.
 */
export const apiResponseCache = mysqlTable("apiResponseCache", {
  id: int("id").autoincrement().primaryKey(),
  cacheKey: varchar("cacheKey", { length: 512 }).notNull().unique(),
  source: varchar("source", { length: 128 }).notNull(),
  payload: longtext("payload").notNull(),
  freshUntil: timestamp("freshUntil").notNull(),
  staleUntil: timestamp("staleUntil").notNull(),
  lastAttemptDay: varchar("lastAttemptDay", { length: 10 }),
  failureUntil: timestamp("failureUntil"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiResponseCache = typeof apiResponseCache.$inferSelect;
export type InsertApiResponseCache = typeof apiResponseCache.$inferInsert;

/** Aggregated cache outcomes for the current and recent UTC days. */
export const apiCacheTelemetry = mysqlTable("apiCacheTelemetry", {
  id: int("id").autoincrement().primaryKey(),
  telemetryKey: varchar("telemetryKey", { length: 256 }).notNull().unique(),
  provider: varchar("provider", { length: 128 }).notNull(),
  outcome: varchar("outcome", { length: 32 }).notNull(),
  day: varchar("day", { length: 10 }).notNull(),
  count: int("count").default(0).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiCacheTelemetry = typeof apiCacheTelemetry.$inferSelect;
export type InsertApiCacheTelemetry = typeof apiCacheTelemetry.$inferInsert;

/** UTC-backed observations for the uptime-monitor feature. */
export const uptimeMonitorChecks = mysqlTable(
  "uptime_monitor_checks",
  {
    id: int("id").autoincrement().primaryKey(),
    endpoint: varchar("endpoint", { length: 512 }).notNull(),
    statusCode: int("status_code").notNull(),
    latencyMs: int("latency_ms").notNull(),
    passed: boolean("passed").notNull(),
    checkedAt: timestamp("checked_at").notNull(),
    runKey: varchar("run_key", { length: 96 }).notNull(),
  },
  table => [
    index("uptime_monitor_endpoint_checked_idx").on(table.endpoint, table.checkedAt),
    uniqueIndex("uptime_monitor_endpoint_run_idx").on(table.endpoint, table.runKey),
  ]
);

/** The scheduled callback is authorized by its platform task identity. */
export const uptimeMonitorSchedules = mysqlTable(
  "uptime_monitor_schedules",
  {
    id: int("id").autoincrement().primaryKey(),
    name: varchar("name", { length: 96 }).notNull().unique(),
    scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }),
    cronExpression: varchar("cron_expression", { length: 64 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("uptime_monitor_task_uid_idx").on(table.scheduleCronTaskUid)]
);

export type UptimeMonitorCheck = typeof uptimeMonitorChecks.$inferSelect;
export type InsertUptimeMonitorCheck = typeof uptimeMonitorChecks.$inferInsert;

/** Personal scouting notes and structured reports. */
export const scoutingNotes = mysqlTable("scoutingNotes", {
  id: varchar("id", { length: 64 }).primaryKey(),
  userId: int("userId").notNull(),
  type: varchar("type", { length: 32 }).notNull(), // 'quick' | 'report'
  player: varchar("player", { length: 255 }).notNull(),
  team: varchar("team", { length: 128 }),
  pos: varchar("pos", { length: 64 }),
  pinned: boolean("pinned").default(false).notNull(),
  text: longtext("text"),
  summary: longtext("summary"),
  isPitcher: boolean("isPitcher").default(false).notNull(),
  grades: longtext("grades"), // JSON stringified tool grades
  fv: varchar("fv", { length: 32 }),
  risk: varchar("risk", { length: 32 }),
  eta: varchar("eta", { length: 32 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  deletedAt: timestamp("deletedAt"), // For soft delete sync
}, (table) => [
  index("scouting_notes_user_idx").on(table.userId),
  index("scouting_notes_updated_idx").on(table.updatedAt),
]);

export type ScoutingNote = typeof scoutingNotes.$inferSelect;
export type InsertScoutingNote = typeof scoutingNotes.$inferInsert;
/**
 * PASTE at the end of drizzle/schema.ts (all imports used here are already
 * imported at the top of that file: date, datetime, double, index, int,
 * longtext, mysqlEnum, mysqlTable, primaryKey, varchar).
 *
 * One row = the provider's season line for one player, one stat group, one team,
 * as observed on one UTC day. team_id 0 = the provider's all-teams total row.
 * Readers must pick the total row OR the team rows, never sum both.
 * Pitching and hitting columns share the table; the other group's are NULL.
 */
export const mlbSeasonStatSnapshots = mysqlTable(
  "mlb_season_stat_snapshots",
  {
    playerId: int("player_id").notNull(),
    season: int("season").notNull(),
    statGroup: mysqlEnum("stat_group", ["hitting", "pitching"]).notNull(),
    teamId: int("team_id").default(0).notNull(),
    snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
    source: varchar("source", { length: 32 }).notNull(),
    ingestedAt: datetime("ingested_at", { mode: "date", fsp: 3 }).notNull(),
    sourceUpdatedAt: datetime("source_updated_at", { mode: "date", fsp: 3 }),
    definitionVersion: int("definition_version").default(1).notNull(),
    numTeams: int("num_teams"),
    /** Provider stat object verbatim (JSON text; engine-agnostic on purpose). */
    rawStat: longtext("raw_stat"),
    games: int("games"),
    // hitting
    plateAppearances: int("plate_appearances"),
    atBats: int("at_bats"),
    runs: int("runs"),
    hits: int("hits"),
    doubles: int("doubles"),
    triples: int("triples"),
    homeRuns: int("home_runs"),
    rbi: int("rbi"),
    walks: int("walks"),
    intentionalWalks: int("intentional_walks"),
    strikeOuts: int("strike_outs"),
    stolenBases: int("stolen_bases"),
    caughtStealing: int("caught_stealing"),
    hitByPitch: int("hit_by_pitch"),
    sacFlies: int("sac_flies"),
    sacBunts: int("sac_bunts"),
    groundIntoDoublePlay: int("ground_into_double_play"),
    totalBases: int("total_bases"),
    avg: double("avg"),
    obp: double("obp"),
    slg: double("slg"),
    ops: double("ops"),
    // pitching
    gamesStarted: int("games_started"),
    wins: int("wins"),
    losses: int("losses"),
    outsPitched: int("outs_pitched"),
    hitsAllowed: int("hits_allowed"),
    earnedRuns: int("earned_runs"),
    homeRunsAllowed: int("home_runs_allowed"),
    walksAllowed: int("walks_allowed"),
    strikeOutsPitched: int("strike_outs_pitched"),
    battersFaced: int("batters_faced"),
    wildPitches: int("wild_pitches"),
    balks: int("balks"),
    saves: int("saves"),
    holds: int("holds"),
    blownSaves: int("blown_saves"),
    qualityStarts: int("quality_starts"),
    inheritedRunners: int("inherited_runners"),
    inheritedRunnersScored: int("inherited_runners_scored"),
    era: double("era"),
    whip: double("whip"),
  },
  table => [
    primaryKey({
      name: "mlb_season_stat_snapshots_pk",
      columns: [
        table.playerId,
        table.season,
        table.statGroup,
        table.teamId,
        table.snapshotDate,
        table.source,
      ],
    }),
    index("mlb_snap_date_idx").on(
      table.season,
      table.statGroup,
      table.snapshotDate
    ),
    index("mlb_snap_player_idx").on(table.playerId, table.season),
  ]
);

export type MlbSeasonStatSnapshot = typeof mlbSeasonStatSnapshots.$inferSelect;
export type InsertMlbSeasonStatSnapshot =
  typeof mlbSeasonStatSnapshots.$inferInsert;
