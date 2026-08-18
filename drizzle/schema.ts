import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
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

/** UTC-backed observations for the dedicated uptime-monitor feature branch. */
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

/** The scheduled callback is authorized exclusively by its platform task identity. */
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
