import {
  boolean,
  date,
  datetime,
  double,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  longtext,
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

/* -------------------------------------------------------------------------- */
/* MLB warehouse                                                               */
/*                                                                             */
/* Source data from the MLB Stats API (GUMBO live feed), normalized into game  */
/* and pitch facts. Nothing in these tables is a SKIP calculation: grades and  */
/* other derived metrics belong in separate, versioned tables. Missing source  */
/* values stay NULL - they are never defaulted to 0.                           */
/* -------------------------------------------------------------------------- */

/** One row per MLB game, keyed by the MLB game identifier (gamePk). */
export const mlbGames = mysqlTable(
  "mlb_games",
  {
    gamePk: int("game_pk").primaryKey(),
    season: int("season").notNull(),
    gameType: varchar("game_type", { length: 4 }).notNull(),
    officialDate: date("official_date", { mode: "string" }).notNull(),
    startTime: datetime("start_time", { mode: "date", fsp: 3 }),
    dayNight: varchar("day_night", { length: 16 }),
    doubleHeader: varchar("double_header", { length: 4 }),
    gameNumber: int("game_number"),
    statusCode: varchar("status_code", { length: 8 }),
    detailedState: varchar("detailed_state", { length: 64 }),
    homeTeamId: int("home_team_id").notNull(),
    homeTeamName: varchar("home_team_name", { length: 128 }).notNull(),
    homeTeamAbbr: varchar("home_team_abbr", { length: 8 }),
    awayTeamId: int("away_team_id").notNull(),
    awayTeamName: varchar("away_team_name", { length: 128 }).notNull(),
    awayTeamAbbr: varchar("away_team_abbr", { length: 8 }),
    venueId: int("venue_id"),
    venueName: varchar("venue_name", { length: 128 }),
    weatherCondition: varchar("weather_condition", { length: 64 }),
    weatherTemp: int("weather_temp"),
    weatherWind: varchar("weather_wind", { length: 128 }),
    homeScore: int("home_score"),
    awayScore: int("away_score"),
    /** Version of the parser that produced this row, for reprocessing. */
    parserVersion: int("parser_version").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("mlb_games_season_date_idx").on(table.season, table.officialDate),
    index("mlb_games_home_team_idx").on(table.homeTeamId, table.season),
    index("mlb_games_away_team_idx").on(table.awayTeamId, table.season),
  ]
);

export type MlbGame = typeof mlbGames.$inferSelect;
export type InsertMlbGame = typeof mlbGames.$inferInsert;

/** Players keyed by MLB person id. Names are never used as identity. */
export const mlbPlayers = mysqlTable("mlb_players", {
  mlbId: int("mlb_id").primaryKey(),
  fullName: varchar("full_name", { length: 128 }).notNull(),
  firstName: varchar("first_name", { length: 64 }),
  lastName: varchar("last_name", { length: 64 }),
  position: varchar("position", { length: 8 }),
  bats: varchar("bats", { length: 2 }),
  throws: varchar("throws", { length: 2 }),
  birthDate: date("birth_date", { mode: "string" }),
  active: boolean("active"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
});

export type MlbPlayer = typeof mlbPlayers.$inferSelect;
export type InsertMlbPlayer = typeof mlbPlayers.$inferInsert;

/**
 * One row per pitch. Identity is (game_pk, at_bat_index, event_index), which
 * is stable across re-ingestion of the same game.
 *
 * source_pitch_type_* is exactly what MLB sent; skip_pitch_type is SKIP's
 * controlled taxonomy. Both are kept so normalization never destroys source
 * information.
 */
export const mlbPitches = mysqlTable(
  "mlb_pitches",
  {
    gamePk: int("game_pk").notNull(),
    atBatIndex: int("at_bat_index").notNull(),
    eventIndex: int("event_index").notNull(),
    season: int("season").notNull(),
    officialDate: date("official_date", { mode: "string" }).notNull(),
    inning: int("inning").notNull(),
    halfInning: varchar("half_inning", { length: 8 }).notNull(),
    pitchNumber: int("pitch_number"),
    batterId: int("batter_id").notNull(),
    pitcherId: int("pitcher_id").notNull(),
    batSide: varchar("bat_side", { length: 2 }),
    pitchHand: varchar("pitch_hand", { length: 2 }),
    outs: int("outs"),
    ballsBefore: int("balls_before"),
    strikesBefore: int("strikes_before"),
    ballsAfter: int("balls_after"),
    strikesAfter: int("strikes_after"),
    sourcePitchTypeCode: varchar("source_pitch_type_code", { length: 4 }),
    sourcePitchTypeName: varchar("source_pitch_type_name", { length: 64 }),
    skipPitchType: varchar("skip_pitch_type", { length: 32 }),
    callCode: varchar("call_code", { length: 4 }),
    callDescription: varchar("call_description", { length: 64 }),
    isInPlay: boolean("is_in_play"),
    isStrike: boolean("is_strike"),
    isBall: boolean("is_ball"),
    /** Result of the plate appearance this pitch belongs to, not of the pitch. */
    paEvent: varchar("pa_event", { length: 64 }),
    paEventType: varchar("pa_event_type", { length: 64 }),
    startSpeed: double("start_speed"),
    endSpeed: double("end_speed"),
    zone: int("zone"),
    strikeZoneTop: double("strike_zone_top"),
    strikeZoneBottom: double("strike_zone_bottom"),
    spinRate: double("spin_rate"),
    spinDirection: double("spin_direction"),
    extension: double("extension"),
    plateTime: double("plate_time"),
    breakAngle: double("break_angle"),
    breakLength: double("break_length"),
    breakVertical: double("break_vertical"),
    breakVerticalInduced: double("break_vertical_induced"),
    breakHorizontal: double("break_horizontal"),
    pfxX: double("pfx_x"),
    pfxZ: double("pfx_z"),
    plateX: double("plate_x"),
    plateZ: double("plate_z"),
    releaseX: double("release_x"),
    releaseY: double("release_y"),
    releaseZ: double("release_z"),
    vx0: double("vx0"),
    vy0: double("vy0"),
    vz0: double("vz0"),
    ax: double("ax"),
    ay: double("ay"),
    az: double("az"),
    coordX: double("coord_x"),
    coordY: double("coord_y"),
    /** Batted-ball fields the MLB feed itself provides on balls in play. */
    launchSpeed: double("launch_speed"),
    launchAngle: double("launch_angle"),
    totalDistance: double("total_distance"),
    playId: varchar("play_id", { length: 64 }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  table => [
    primaryKey({
      name: "mlb_pitches_pk",
      columns: [table.gamePk, table.atBatIndex, table.eventIndex],
    }),
    index("mlb_pitches_pitcher_idx").on(
      table.pitcherId,
      table.season,
      table.skipPitchType
    ),
    index("mlb_pitches_batter_idx").on(table.batterId, table.season),
    index("mlb_pitches_date_idx").on(table.officialDate),
  ]
);

export type MlbPitch = typeof mlbPitches.$inferSelect;
export type InsertMlbPitch = typeof mlbPitches.$inferInsert;

/**
 * One row per plate appearance, including ones with no pitches (automatic
 * intentional walks), which mlb_pitches cannot represent. Carries the base-out
 * state and runs that mlb_pitches lacks, so run expectancy, linear weights and
 * innings pitched can be computed from the project's own data.
 *
 * Every value is read from the feed or derived from it; unknown stays NULL.
 *  - outs_before / outs_after: outs at the start and end of the play.
 *  - bases_before / bases_after: bitmask, 1 = runner on 1B, 2 = on 2B, 4 = on 3B.
 *    bases_before is NULL when the previous play's end state does not reconcile
 *    with this play's movement (for example the extra-inning runner).
 *  - runs_on_play: change in the batting team's score across the play.
 *  - earned_runs_on_play: runners who scored with the feed's earned flag. This is
 *    the feed's flag, not the official scorer's final ruling. NULL when the
 *    scoring runners cannot be reconciled with runs_on_play.
 */
export const mlbPlateAppearances = mysqlTable(
  "mlb_plate_appearances",
  {
    gamePk: int("game_pk").notNull(),
    atBatIndex: int("at_bat_index").notNull(),
    season: int("season").notNull(),
    officialDate: date("official_date", { mode: "string" }).notNull(),
    inning: int("inning").notNull(),
    halfInning: varchar("half_inning", { length: 8 }).notNull(),
    battingTeamId: int("batting_team_id").notNull(),
    batterId: int("batter_id").notNull(),
    pitcherId: int("pitcher_id").notNull(),
    paEvent: varchar("pa_event", { length: 64 }),
    paEventType: varchar("pa_event_type", { length: 64 }),
    isComplete: boolean("is_complete"),
    outsBefore: int("outs_before"),
    outsAfter: int("outs_after"),
    basesBefore: int("bases_before"),
    basesAfter: int("bases_after"),
    runsOnPlay: int("runs_on_play"),
    earnedRunsOnPlay: int("earned_runs_on_play"),
  },
  table => [
    primaryKey({
      name: "mlb_plate_appearances_pk",
      columns: [table.gamePk, table.atBatIndex],
    }),
    index("mlb_pa_batter_idx").on(table.batterId, table.season),
    index("mlb_pa_pitcher_idx").on(table.pitcherId, table.season),
    index("mlb_pa_season_date_idx").on(table.season, table.officialDate),
  ]
);

export type MlbPlateAppearance = typeof mlbPlateAppearances.$inferSelect;
export type InsertMlbPlateAppearance =
  typeof mlbPlateAppearances.$inferInsert;

/**
 * Per-game ingestion bookkeeping: what exists, what succeeded, what failed and
 * why. This is what makes backfills resumable - a failed game is retried on
 * its own instead of restarting the season.
 */
export const mlbIngestionState = mysqlTable(
  "mlb_ingestion_state",
  {
    gamePk: int("game_pk").primaryKey(),
    season: int("season").notNull(),
    officialDate: date("official_date", { mode: "string" }).notNull(),
    status: mysqlEnum("status", [
      "pending",
      "processing",
      "complete",
      "failed",
    ])
      .default("pending")
      .notNull(),
    attemptCount: int("attempt_count").default(0).notNull(),
    lastAttemptAt: datetime("last_attempt_at", { mode: "date", fsp: 3 }),
    lastSuccessAt: datetime("last_success_at", { mode: "date", fsp: 3 }),
    pitchCount: int("pitch_count"),
    parserVersion: int("parser_version"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("mlb_ingestion_status_idx").on(table.status, table.season),
    index("mlb_ingestion_date_idx").on(table.officialDate),
  ]
);

export type MlbIngestionState = typeof mlbIngestionState.$inferSelect;
export type InsertMlbIngestionState = typeof mlbIngestionState.$inferInsert;


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
