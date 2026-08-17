import {
  int,
  mysqlEnum,
  mysqlTable,
  longtext,
  text,
  timestamp,
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

