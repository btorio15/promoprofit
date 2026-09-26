import { pgTable, text, boolean, integer, serial, timestamp, jsonb, index, primaryKey } from "drizzle-orm/pg-core";

/**
 * Colorado sportsbook configuration (ODDS-05, D-14, D-16). Seeded from
 * src/config/books.ts — the config file remains the single source of
 * truth and is what the app reads at runtime (WR-05); this table is a
 * display/seed metadata mirror only.
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
 * Cached spreads/totals odds events (D-16). This is the independent
 * spreads/totals cache: written and purged only by the "Search spreads &
 * totals" refresh (refreshExtended -> store.commitSpreadsTotalsRefresh), in
 * the same transaction as that run's h2h projection into cached_odds.
 * A normal h2h refresh never touches this table. Because both caches are
 * committed all-or-nothing, a failed search leaves the finder's WR-01
 * latest-batch query on cached_odds unaffected.
 * raw_response stores the full event including h2h+spreads+totals
 * bookmakers.
 */
export const cachedExtendedOdds = pgTable(
  "cached_extended_odds",
  {
    eventId: text("event_id").primaryKey(),
    sportKey: text("sport_key").notNull(),
    commenceTime: timestamp("commence_time", { withTimezone: true }).notNull(),
    rawResponse: jsonb("raw_response").notNull(),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("cached_extended_odds_sport_key_idx").on(table.sportKey),
    index("cached_extended_odds_commence_time_idx").on(table.commenceTime),
  ],
);

/**
 * Invited-friends accounts (DASH-04, D-01, D-05). The ONLY code path that
 * inserts a row here is src/lib/auth/accounts.ts's
 * redeemInviteAndCreateUser (D-01) -- there is no signup route. email is
 * always stored lowercased+trimmed (D-05) so "Mike@X.com" and "mike@x.com"
 * are the same account. failed_login_attempts/locked_until are the
 * DB-backed login-throttle columns (no in-memory rate limiter, since
 * serverless functions don't share process state).
 */
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  failedLoginAttempts: integer("failed_login_attempts").notNull().default(0),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Single-use invite links (D-02, D-03, D-04). token_hash is the SHA-256 hex
 * digest of the plaintext token -- the plaintext itself is never stored,
 * only ever printed once to the owner's terminal by scripts/invite-create.ts
 * (T-02-01). expires_at enforces the 7-day TTL; used_at/used_by_user_id are
 * set atomically by redeemInviteAndCreateUser's single CTE statement so a
 * concurrent double-redemption can create at most one user (T-02-02).
 */
export const invites = pgTable("invites", {
  id: serial("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  usedByUserId: integer("used_by_user_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Per-user selected Colorado sportsbooks (D-12). Normalized join table --
 * NOT a jsonb/array column on users -- so a future books.ts config change
 * (e.g. a book losing API coverage) can never leave a silently-orphaned key
 * in a user's selection (RESEARCH.md Pitfall 4). Composite PK enforces at
 * most one row per (user, book) pair.
 */
export const userBooks = pgTable(
  "user_books",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    bookKey: text("book_key")
      .notNull()
      .references(() => books.key),
  },
  (table) => [primaryKey({ columns: [table.userId, table.bookKey] })],
);

/**
 * Credit-quota history (ODDS-02, D-10/D-11). Plan 04's refreshOdds action
 * writes one row per refresh from the Odds API's x-requests-* headers;
 * Plan 05's credit meter reads the most recent row.
 * triggered_by_user_id (D-21) attributes a refresh to the user who clicked
 * it -- nullable and ON DELETE SET NULL since legacy rows recorded before
 * this phase (and any future user deletion) must never break this read.
 */
export const creditUsage = pgTable("credit_usage", {
  id: serial("id").primaryKey(),
  requestsRemaining: integer("requests_remaining").notNull(),
  requestsUsed: integer("requests_used").notNull(),
  refreshCost: integer("refresh_cost").notNull(),
  sportsFetched: integer("sports_fetched").notNull(),
  recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
  triggeredByUserId: integer("triggered_by_user_id").references(() => users.id, { onDelete: "set null" }),
});

/**
 * Single-row server-side lock serializing odds refreshes (WR-03). neon-http
 * is stateless, so a session-level advisory lock can't span the refresh's
 * several API calls; instead a refresh claims row id=1 with a conditional
 * upsert that only succeeds when no unexpired lock is held. locked_until
 * bounds how long a crashed refresh can hold the lock.
 */
export const refreshLock = pgTable("refresh_lock", {
  id: integer("id").primaryKey(),
  holder: text("holder").notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }).notNull(),
});
