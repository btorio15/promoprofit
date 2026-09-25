import { pgTable, text, boolean, integer, serial, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/**
 * Colorado sportsbook configuration (ODDS-05, D-14, D-16). Seeded from
 * src/config/books.ts — the config file remains the single source of
 * truth; this table is the DB mirror the app actually queries.
 */
export const books = pgTable("books", {
  key: text("key").primaryKey(),
  displayName: text("display_name").notNull(),
  region: text("region"),
  apiCoverage: boolean("api_coverage").notNull(),
  tier: text("tier").notNull(),
  sortOrder: integer("sort_order").notNull(),
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Cached Odds API events (ODDS-01/ODDS-03). One row per event; the full
 * API event object (all bookmakers/markets) is stored in raw_response so
 * findHedges never needs a fresh API call to compute results.
 */
export const cachedOdds = pgTable(
  "cached_odds",
  {
    eventId: text("event_id").primaryKey(),
    sportKey: text("sport_key").notNull(),
    commenceTime: timestamp("commence_time", { withTimezone: true }).notNull(),
    rawResponse: jsonb("raw_response").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("cached_odds_sport_key_idx").on(table.sportKey),
    index("cached_odds_commence_time_idx").on(table.commenceTime),
  ],
);

/**
 * Credit-quota history (ODDS-02, D-10/D-11). Plan 04's refreshOdds action
 * writes one row per refresh from the Odds API's x-requests-* headers;
 * Plan 05's credit meter reads the most recent row.
 */
export const creditUsage = pgTable("credit_usage", {
  id: serial("id").primaryKey(),
  requestsRemaining: integer("requests_remaining").notNull(),
  requestsUsed: integer("requests_used").notNull(),
  refreshCost: integer("refresh_cost").notNull(),
  sportsFetched: integer("sports_fetched").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
});
