import {
  pgTable,
  text,
  boolean,
  integer,
  serial,
  timestamp,
  jsonb,
  index,
  primaryKey,
  numeric,
  doublePrecision,
} from "drizzle-orm/pg-core";

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

/**
 * Scraped/reviewed sportsbook promos (PROMO-03, PROMO-04; D-08, D-10, D-11,
 * D-12, D-13, D-16, D-17, D-18, D-19). The ONLY code path that inserts/
 * updates a row here from a scrape is src/ingestion/promos/store.ts
 * (Plan 06); member review actions (confirm/correct/dismiss/flag/enter-caps,
 * Plans 07-09) write through src/db/promoReview.ts. dedupe_key is unique so
 * a re-scrape of the same live promo updates last_seen_at instead of
 * inserting a duplicate row (D-19). parsed holds the full validated scrape
 * parse (jsonb) so the matcher can re-run later without re-scraping.
 * unparsed_cap_fields defaults to an empty jsonb array (D-18): the math
 * never guesses a cap, so any field that couldn't be parsed is a name in
 * this array until a human enters it. Every *_by_user_id attribution column
 * mirrors credit_usage.triggered_by_user_id's nullable
 * `references(() => users.id, { onDelete: "set null" })` shape (D-12) so a
 * later user deletion can never break an existing promo row.
 *
 * scope_kind / window_start / window_end (migration 0005, PROMO-03-04
 * 03-RECON.md Design Implication 1) model the real promo shapes: most
 * promos are game-wide or sport+date-wide, not tied to one pre-specified
 * market/side. scope_kind "event" uses event_id/sport_key/
 * event_commence_time/home_team/away_team (the single named game);
 * scope_kind "sport_window" uses sport_key/window_start/window_end instead,
 * with event_id null (any event of that sport whose commence_time falls in
 * the window). market_type/line/side are now the OPTIONAL pinned selection
 * (D-02) -- null means the app itself picks the best market/side inside the
 * promo's scope (src/domain/promos/selection.ts,
 * src/domain/promos/rankPromoHedges.ts), the same way the bonus-bet finder
 * searches across markets. All scope columns (scope_kind, event_id,
 * sport_key, window_start, window_end) are null while a promo is
 * unmatched/pending_review.
 */
export const promos = pgTable(
  "promos",
  {
    id: serial("id").primaryKey(),
    bookKey: text("book_key")
      .notNull()
      .references(() => books.key),
    dedupeKey: text("dedupe_key").notNull().unique(),
    promoType: text("promo_type").notNull(),
    status: text("status").notNull(),
    reviewReason: text("review_reason"),
    autoMatched: boolean("auto_matched").notNull().default(false),
    autoMatchBlocked: boolean("auto_match_blocked").notNull().default(false),
    sportKey: text("sport_key"),
    eventId: text("event_id"),
    eventCommenceTime: timestamp("event_commence_time", { withTimezone: true }),
    homeTeam: text("home_team"),
    awayTeam: text("away_team"),
    marketType: text("market_type"),
    line: doublePrecision("line"),
    side: text("side"),
    scopeKind: text("scope_kind"),
    windowStart: timestamp("window_start", { withTimezone: true }),
    windowEnd: timestamp("window_end", { withTimezone: true }),
    bestGuess: jsonb("best_guess"),
    parsed: jsonb("parsed").notNull(),
    boostPercent: numeric("boost_percent", { precision: 7, scale: 2 }),
    boostedOddsAmerican: integer("boosted_odds_american"),
    baseOddsAmerican: integer("base_odds_american"),
    bonusAmount: numeric("bonus_amount", { precision: 10, scale: 2 }),
    maxStake: numeric("max_stake", { precision: 10, scale: 2 }),
    maxWinnings: numeric("max_winnings", { precision: 10, scale: 2 }),
    maxWinningsKind: text("max_winnings_kind"),
    minOddsAmerican: integer("min_odds_american"),
    unparsedCapFields: jsonb("unparsed_cap_fields").notNull().default([]),
    finePrintNote: text("fine_print_note"),
    rawText: text("raw_text").notNull(),
    sourceUrl: text("source_url").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    confirmedByUserId: integer("confirmed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    correctedByUserId: integer("corrected_by_user_id").references(() => users.id, { onDelete: "set null" }),
    capEnteredByUserId: integer("cap_entered_by_user_id").references(() => users.id, { onDelete: "set null" }),
    dismissedByUserId: integer("dismissed_by_user_id").references(() => users.id, { onDelete: "set null" }),
    flaggedByUserId: integer("flagged_by_user_id").references(() => users.id, { onDelete: "set null" }),
    // null = scraped/group promo; set = personal hand-added promo visible only
    // to that user (D-01). Cascade (NOT set null): set null would turn a
    // private promo into a visible-to-everyone promo when its owner is deleted.
    addedByUserId: integer("added_by_user_id").references(() => users.id, { onDelete: "cascade" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
  },
  (table) => [
    index("promos_status_idx").on(table.status),
    index("promos_book_key_idx").on(table.bookKey),
    index("promos_added_by_user_id_idx").on(table.addedByUserId),
  ],
);

/**
 * Append-only per-book scrape run history (D-08). One row per book per run,
 * written only by scrapers/*.ts (Plan 05/06) after each scheduled run. The
 * Promos tab's scrape-status panel reads the latest ok run and latest run's
 * status per book via src/db/promos.ts's getScrapeStatus -- a failed run
 * never deletes or alters existing promos, it only affects the freshness
 * label shown for that book.
 */
export const scrapeRuns = pgTable(
  "scrape_runs",
  {
    id: serial("id").primaryKey(),
    bookKey: text("book_key")
      .notNull()
      .references(() => books.key),
    ranAt: timestamp("ran_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
    promosFound: integer("promos_found").notNull(),
    promosKept: integer("promos_kept").notNull(),
    errorMessage: text("error_message"),
  },
  (table) => [index("scrape_runs_book_key_ran_at_idx").on(table.bookKey, table.ranAt)],
);

/**
 * quick-260928-kc5: content-addressed cache for the Claude Haiku 4.5 promo
 * reader (PROMO-03). content_hash is readingCacheKey(bookKey, text) --
 * sha256 of [prompt version, model, book key, whitespace-normalized text] --
 * so a prompt-version bump naturally invalidates every cached row without a
 * migration (a bumped version is simply never looked up again). No FK on
 * book_key: the cache must never depend on `books` being seeded first. Rows
 * are re-validated against PromoReadingSchema on every read
 * (readerCache.ts) -- an invalid cached row counts as a miss, never a crash.
 */
export const promoReadings = pgTable("promo_readings", {
  contentHash: text("content_hash").primaryKey(),
  bookKey: text("book_key").notNull(),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  reading: jsonb("reading").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * quick-260927-n12 (owner decision 2): per-member "mark used" state. A
 * member marking a promo used only affects THEIR OWN feed/total -- other
 * members still see the promo -- so this is a join table keyed on
 * (user_id, promo_id), never a column on promos itself. Composite PK makes
 * repeat marks idempotent (mirrors user_books' shape). ON DELETE CASCADE on
 * both FKs: a deleted user or a deleted promo (never happens in practice,
 * but the FK is there) should never leave an orphaned completion row.
 */
export const promoCompletions = pgTable(
  "promo_completions",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    promoId: integer("promo_id")
      .notNull()
      .references(() => promos.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
    /**
     * quick-260929-igk: frozen, server-computed snapshot of what the member's
     * row showed when they marked the promo done (versioned JSON, see
     * src/domain/promos/doneSnapshot.ts). NULL on legacy rows completed
     * before profit tracking existed (shown as "Marked done before profit
     * tracking", counted as $0).
     */
    snapshot: jsonb("snapshot"),
    /** Guaranteed profit recorded at mark-done time, exact cents. Legacy rows default to 0. */
    profitExtracted: numeric("profit_extracted", { precision: 10, scale: 2 }).notNull().default("0"),
  },
  (table) => [primaryKey({ columns: [table.userId, table.promoId] })],
);

/**
 * quick-260927-n12 (owner decision 3): the best guaranteed profit observed
 * for a promo on a given America/Denver calendar day, recorded by getPromos
 * on every Promos-tab load (never by the scraper -- see get-promos.ts's
 * doc comment) from already-cached odds, so this never costs an Odds API
 * credit. Keyed (promo_id, denver_date) so a repeat load on the same day
 * can only ever raise the stored value (GREATEST upsert in
 * src/db/promoTracking.ts), never duplicate a day's row. denver_date is
 * TEXT ("YYYY-MM-DD"), not a DATE/timestamp column, specifically so no
 * driver/session timezone can silently coerce it -- the Denver calendar day
 * is computed once in application code (profitTotals.ts's denverDate) and
 * stored verbatim.
 */
/**
 * quick-260928-mgi (owner decision 3): new-customer/sign-up offers found by
 * the scraper, kept for informational display only. Deliberately a
 * SEPARATE table from `promos` -- a sign-up offer never enters profit
 * ranking, the review queue, promo dedupe, or the dismissed-classify-row
 * collision space (rows 6-11 of that table's own history). dedupe_key is
 * unique (upsert target); status flips to 'expired' on any successful
 * scrape of that book that no longer sees the offer (signupStore.ts) --
 * a FAILED book run never expires anything. first_seen_at is never
 * overwritten by the upsert (signupStore.ts's ON CONFLICT clause omits it).
 */
export const signupOffers = pgTable(
  "signup_offers",
  {
    id: serial("id").primaryKey(),
    bookKey: text("book_key")
      .notNull()
      .references(() => books.key),
    dedupeKey: text("dedupe_key").notNull().unique(),
    externalId: text("external_id"),
    title: text("title").notNull(),
    description: text("description").notNull(),
    rawText: text("raw_text").notNull(),
    bonusAmount: numeric("bonus_amount", { precision: 10, scale: 2 }),
    sourceUrl: text("source_url").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(),
  },
  (table) => [
    index("signup_offers_status_idx").on(table.status),
    index("signup_offers_book_key_idx").on(table.bookKey),
  ],
);

export const promoProfitObservations = pgTable(
  "promo_profit_observations",
  {
    promoId: integer("promo_id")
      .notNull()
      .references(() => promos.id, { onDelete: "cascade" }),
    denverDate: text("denver_date").notNull(),
    bookKey: text("book_key")
      .notNull()
      .references(() => books.key),
    maxGuaranteedProfit: numeric("max_guaranteed_profit", { precision: 10, scale: 2 }).notNull(),
    lastObservedAt: timestamp("last_observed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.promoId, table.denverDate] }),
    index("promo_profit_observations_denver_date_idx").on(table.denverDate),
  ],
);
