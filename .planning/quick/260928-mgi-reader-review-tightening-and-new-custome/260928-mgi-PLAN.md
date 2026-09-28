---
phase: quick-260928-mgi
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/domain/promos/scraped.ts
  - src/ingestion/promos/reviewTriage.ts
  - src/ingestion/promos/reconcile.ts
  - src/ingestion/promos/reconcile.test.ts
  - src/ingestion/promos/readerPass.ts
  - src/ingestion/promos/readerPass.test.ts
  - src/ingestion/promos/run.ts
  - src/ingestion/promos/run.test.ts
  - scripts/scrape-promos.ts
  - src/ingestion/promos/exclusions.ts
  - src/ingestion/promos/signupOffers.ts
  - src/ingestion/promos/signupOffers.test.ts
  - src/ingestion/promos/signupStore.ts
  - src/ingestion/promos/signupStore.test.ts
  - src/ingestion/promos/store.ts
  - src/db/schema.ts
  - drizzle/0008_signup_offers.sql
  - drizzle/meta/0008_snapshot.json
  - drizzle/meta/_journal.json
  - src/domain/promos/signupOffers.ts
  - src/domain/promos/signupOffers.test.ts
  - src/db/signupOffers.ts
  - src/app/actions/get-signup-offers.ts
  - src/app/actions/get-signup-offers.test.ts
  - src/components/signup/SignupOffersScreen.tsx
  - src/components/AppShell.tsx
autonomous: true
requirements: [QUICK-260928-mgi, PROMO-03]

must_haves:
  truths:
    - "When the parser skipped a promo for a clear reason (futures, outright, parlay, sgp, prop, live_only, new_customer, deposit, not_half_point), it stays skipped whatever the reader says. The disagreement is logged and counted (clearSkipOverrides) and never reaches the review queue."
    - "A reader rescue of a not_a_promo, unrecognized or unsupported_sport skip only reaches review when the reader has at least one guard-backed amount (boostPercent or bonusAmount). Otherwise the promo is skipped, logged and counted (rescuesWithoutAmount), and never becomes a classify review row."
    - "All 6 noise promos from the 2026-09-28 live run end up skipped, not in review: the Bally Stanley Cup boost, the two generic Bally boost pages, the DK Eagles @ Bears SGP boost, FanDuel's Bet $5 Get $50, and FanDuel's MLB Early Win Token."
    - "A high-confidence, schema-valid rescue still becomes a candidate. A candidate the pattern parser kept is never dropped, and a money disagreement on it still goes to review."
    - "New-customer promos are stored in a separate signup_offers table on every successful book scrape. Offers not seen in a successful scrape of that book expire. A failed book run never expires anything."
    - "Refer-a-friend promos are never stored as sign-up offers."
    - "A logged-in member sees a 'Sign-up offers' tab listing active sign-up offers grouped by book, only for books NOT in their saved book list. A member who has every book with an offer sees an empty state."
    - "The DraftKings 'Bet $5 Get $150 in Bonus Bets' offer shows a bonus amount of $150.00, and FanDuel 'Bet $5, Get $50 for 5 days' shows $250.00, the guaranteed total."
  artifacts:
    - path: "src/ingestion/promos/reconcile.ts"
      provides: "clear-reason-wins and rescue-needs-an-amount rules"
      contains: "rescue_without_amount"
    - path: "src/ingestion/promos/readerPass.test.ts"
      provides: "table-driven tests for the 6 noise cases"
    - path: "src/ingestion/promos/signupOffers.ts"
      provides: "extractSignupOffers: a pure, deterministic sign-up offer extractor (referral split, amount parsing)"
      exports: ["extractSignupOffers", "signupDedupeKey", "parseSignupBonusAmount"]
    - path: "src/ingestion/promos/signupStore.ts"
      provides: "commitSignupOffers: upsert plus expire-unseen in one db.batch"
      exports: ["commitSignupOffers"]
    - path: "src/db/schema.ts"
      provides: "signupOffers pgTable"
      contains: "signup_offers"
    - path: "drizzle/0008_signup_offers.sql"
      provides: "generated migration, not applied"
      contains: "CREATE TABLE \"signup_offers\""
    - path: "src/app/actions/get-signup-offers.ts"
      provides: "getSignupOffers server action (requireUser, userId from the session only)"
      exports: ["getSignupOffers"]
    - path: "src/components/signup/SignupOffersScreen.tsx"
      provides: "Sign-up offers tab body with loading, error and empty states"
  key_links:
    - from: "src/ingestion/promos/reconcile.ts"
      to: "src/ingestion/promos/reviewTriage.ts isReviewWorthySkip"
      via: "SkippedEntry.reviewSuppressed makes isReviewWorthySkip return false, so run.ts buildClassifyWrites never escalates a suppressed skip"
      pattern: "reviewSuppressed"
    - from: "src/ingestion/promos/run.ts"
      to: "src/ingestion/promos/signupStore.ts"
      via: "store.commitSignupOffers called unconditionally (even with []) on every ok book run and never on failed runs, using the parser's own new_customer skips taken before the reader pass"
      pattern: "commitSignupOffers"
    - from: "src/components/AppShell.tsx"
      to: "src/components/signup/SignupOffersScreen.tsx"
      via: "new TabsTrigger value=\"signup\" and keepMounted TabsContent"
      pattern: "value=\"signup\""
    - from: "src/app/actions/get-signup-offers.ts"
      to: "src/db/queries.ts getUserBookKeys"
      via: "requireUser().userId, never a client argument"
      pattern: "getUserBookKeys\\(user\\.userId\\)"
---

<objective>
Two changes to the promo scrape pipeline, plus one new tab.

1. Tighten the Claude promo reader's review routing so the kind of noise seen in the first live run (6 bad review rows on 2026-09-28) stops reaching the review queue. Owner decisions 1 and 2.
2. Stop throwing away new-customer promos. Store them in their own table and show them on a new "Sign-up offers" tab, listing only books the member doesn't have yet. Owner decision 3.

Purpose: the review queue should only show things a member can actually act on. Sign-up offers are useful when deciding which book to open next, but must never touch profit ranking, review or dedupe.
Output: reconcile/readerPass rule changes with tests; the sign-up extractor, store, table and migration (generated, not applied); run.ts wiring; the getSignupOffers action; the SignupOffersScreen tab.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/quick/260928-kc5-claude-haiku-promo-reader-with-verbatim-/260928-kc5-SUMMARY.md
@.planning/quick/260928-it1-uncertain-promos-to-review-queue-and-add/260928-it1-SUMMARY.md
@.planning/phases/03-promo-scraping-review/03-UI-SPEC.md
@src/ingestion/promos/reconcile.ts
@src/ingestion/promos/readerPass.ts
@src/ingestion/promos/run.ts

<interfaces>
Extracted from the codebase. Use these directly; no exploration needed.

src/domain/promos/scraped.ts:
- SKIP_REASONS = parlay, sgp, live_only, futures, outright, prop, new_customer, deposit, not_a_promo, unsupported_sport, not_half_point, unrecognized, schema_invalid
- interface SkipEvidence { rawText (<=2000 chars); sourceUrl; expiresAt: string|null; partial: Partial<ScrapedPromo>|null; dedupeKey?: string }
- interface SkippedEntry { reason: SkipReason; externalId: string|null; title: string; evidence?: SkipEvidence }
- interface ParseResult { found: number; candidates: ScrapedPromo[]; skipped: SkippedEntry[] }

src/ingestion/promos/reviewTriage.ts:
- CLEAR_SKIP_REASONS = new_customer, deposit, parlay, sgp, futures, outright, prop, live_only, not_half_point (exactly owner decision 1's list)
- REVIEW_SKIP_REASONS = unrecognized, unsupported_sport, schema_invalid
- isReviewWorthySkip(skip): true for REVIEW_SKIP_REASONS; false for CLEAR; for not_a_promo, true only if classifyExclusion finds nothing AND a concrete-offer regex matches
- buildClassifyDraft(bookKey, skip, fallbackSourceUrl): ScrapedPromo

src/ingestion/promos/reconcile.ts (current):
- ReconcileOutcome = candidate (via agree|merged|rescued|pattern_only) | review (why disagreement|guard_drop|reader_not_usable|rescue_needs_review|clear_reason_conflict) | skip (via agree_not_usable|pattern_only)
- reconcileSkip, usable branch: CLEAR_SKIP_REASONS -> review(clear_reason_conflict); otherwise overlay the draft, and if confidence high, droppedFields empty, teams ok, sport-or-teams and ScrapedPromoSchema passes -> candidate(rescued); else review(rescue_needs_review)
- GuardedReading: fields kind, skipReason, boostPercent, bonusAmount, maxStake, maxWinnings, minOddsAmerican, sport, teams, singleGame, liveOnly, parlayOrSgpOnly, propOnly, newCustomerOnly, eventDateText, confidence, droppedFields. A non-null boostPercent/bonusAmount on a GuardedReading has already survived guardReading, so it is "guard-backed".

src/ingestion/promos/readerPass.ts:
- interface ReaderBookStats { calls, cacheHits, fallbacks, disagreements, guardDrops, rescues, reviewRouted, skippedByReader, inputTokens, outputTokens }
- applyPromoReader({ bookKey, parseResult, reader, fallbackSourceUrl }) => Promise<{ parseResult, stats }>
- guardReading(result.reading, text) runs on the real text before reconcileEntry

src/ingestion/promos/promoReader.ts:
- interface PromoReader { read(input: { bookKey: string; text: string }): Promise<ReaderResult> }
- ReaderResult = { source: "cache"; reading } | { source: "api"; reading; usage: { inputTokens; outputTokens } } | { source: "fallback"; reason }

src/ingestion/promos/store.ts:
- interface PromoStore { recordScrapeRun(row); commitScrapedPromos(bookKey, writes, now, opts?) }
- export const promoStore: PromoStore = { recordScrapeRun, commitScrapedPromos }
- db.batch pattern for multi-statement atomicity; getDb() from @/db/client (drizzle neon-http, lazy)

src/ingestion/promos/exclusions.ts:
- NEW_CUSTOMER_TEXT_RE = /\bnew (?:customers?|users?)\b|\bfirst[- ]bet\b|\bsign[- ]up\b/i (module-private today)
- refer-a-friend regex carries a (?!\s+program) lookahead so DK's legal boilerplate "the refer-a-friend program" never matches

src/db/queries.ts: getUserBookKeys(userId: number): Promise<string[]> (raw saved keys)
src/lib/session.ts: requireUser(): Promise<SessionUser> (redirects to /login when there is no session; SessionUser has userId, email, displayName)
src/lib/format.ts: formatUsd(value: string): string
src/domain/promos/etTime.ts: etDayLabel(iso) (used by ClassifyQueueCard for "Expires ...")
src/config/books.ts: COLORADO_BOOKS: readonly { key, displayName, sortOrder, ... }[]
src/app/actions/get-promos.ts: private safeHttpUrl(url) allowlisting http:/https: (copy this pattern; do not import from a "use server" file)
src/components/AppShell.tsx: ActiveTab = "bonus" | "arbitrage" | "promos"; TabsList variant="line"; each TabsContent keepMounted
src/ingestion/promos/boundary.test.ts: nothing under src/app or src/components may import @/ingestion/promos, the Anthropic SDK, or scraper packages
</interfaces>

<fixture_facts>
Found by the planner by running each book's parser over src/test/fixtures/promos. Treat these as the expected ground truth; if a fixture parse disagrees, stop and report it rather than bending a regex to fit.

Noise cases (owner background):
- ballybet-promos.json: sbk-50-Stanley-Cup-Champion-Profit-Boost, reason futures, text "Get on the Ice with a 50% Profit Boost!"
- ballybet-promos.json: sbk-profit-boost-01 "Bally's Profit Boost", reason not_a_promo, text "Boost your profits and take your game to the next level! Increase your winnings up to 100%"
- ballybet-promos.json: sbk-odds-boost-01 "Bally's Odds Boost", reason not_a_promo
- draftkings-promos-2026-09-28.json: 1126077 "PHI Eagles @ CHI Bears 50% SGP Boost", reason sgp, text contains "Profit Boost: 50%"
- fanduel-promos-2026-09-28.json: ACQB5G50BB921 "Bet $5, Get $50 for 5 days", reason new_customer (FanDuel's ACQ tag), text "Get $250 in Bonus Bets guaranteed! Bet $5 each day for 5 days and earn $50 in Bonus Bets daily."
- FanDuel "MLB Early Win Token" is NOT in any fixture. Build a synthetic SkippedEntry for it, and test it both as reason unrecognized and as not_a_promo.

Every new_customer skip in the real fixtures (DK entries are identical in draftkings-promos.json, -2026-09-27 and -2026-09-28):
- DK 1118611 "New Sportsbook Customers Bet $5 Get $150 in Bonus Bets, Paid Over 14 Days" (category "New Customers"). Sign-up offer, amount 150.00.
- DK 779769 "New Customers: Deposit Bonus up to $1,000". A sign-up offer. The "$1,000" is a deposit-match cap ("20% Bonus up to $1,000"), not "$N in bonus bets", so the amount is null.
- DK 1107235 "GET $10 IN CROWN CASH" (category "DK Horse"). Its terms require signing up for a new DK Racing account, so it's a real new-account offer. Kept, amount null ("Crown Cash" is not bonus-bet wording).
- DK 1098873 "Daily Rewards Rocket Turbo!" is a false positive. Its only new-customer signal is DK's logged-out boilerplate "Please log in or sign up to view terms and conditions." It's an existing-customer loyalty promo, so NOT a sign-up offer.
- DK 882364 and 782037 "Refer a Friend!" are marked new_customer only because of that same boilerplate. Referral offers, excluded.
- FanDuel ACQB5G50BB921 "Bet $5, Get $50 for 5 days". Sign-up offer, amount 250.00 (see the headline-amount rule).
- FanDuel ACQPECBB1G100ST "New User Bet & Get" ("New Customers Bet $1+ and Get $100 in Bonus Bets ..."). Sign-up offer, amount 100.00.
- Bally promo-code-sports "Promo Code" ("sign up using your promo code to redeem an exclusive bonus"). Sign-up offer, amount null.
- FanDuel RAF092126STAT "Refer-A-Friend Get Bonus Bets" is already not_a_promo (never new_customer), so it never reaches the extractor. The extractor's referral filter still covers this wording in a unit test.

Every scraped sourceUrl is an internal JSON API endpoint (api.draftkings.com/..., api.sportsbook.fanduel.com/..., dx-config-service...ballys.tech/...). A link there shows raw JSON. The public sites already used as each scraper's `referer` header are https://sportsbook.draftkings.com/, https://sportsbook.fanduel.com/ and https://play.ballybet.com/.
</fixture_facts>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Clear parser exclusions always win, and a reader rescue needs a guard-backed amount to reach review</name>
  <files>src/domain/promos/scraped.ts, src/ingestion/promos/reviewTriage.ts, src/ingestion/promos/reconcile.ts, src/ingestion/promos/reconcile.test.ts, src/ingestion/promos/readerPass.ts, src/ingestion/promos/readerPass.test.ts, src/ingestion/promos/run.ts, scripts/scrape-promos.ts</files>
  <behavior>
    readerPass.test.ts (new). Table-driven over applyPromoReader with a fake PromoReader whose read() returns source "api" with a per-text PromoReading (pre-guard, with evidence strings) and usage 1/1. Each case's real text goes through the real guardReading.
    - Case 1, Bally Stanley Cup (futures). Reading: profit_boost, boostPercent "50", evidence "50% Profit Boost", high. Result: skipped with reason still futures, not in candidates, isReviewWorthySkip false, stats.clearSkipOverrides counts it.
    - Case 2, Bally's Profit Boost (not_a_promo). Reading: profit_boost, boostPercent "100", evidence "Increase your winnings up to 100%", high. The guard drops it (no "boost" word in the evidence). Result: skipped, reviewSuppressed set, isReviewWorthySkip false, stats.rescuesWithoutAmount counts it.
    - Case 3, Bally's Odds Boost (not_a_promo). Reading: profit_boost, every amount null, medium. Result: skipped and suppressed, rescuesWithoutAmount.
    - Case 4, DK 1126077 SGP boost (sgp). Reading: profit_boost, boostPercent "50", evidence "Profit Boost: 50%", high. Result: stays sgp, clearSkipOverrides.
    - Case 5, FanDuel ACQB5G50BB921 (new_customer). Reading: bonus_bet, bonusAmount "250", evidence "$250 in Bonus Bets", high. Result: stays new_customer, clearSkipOverrides.
    - Case 6a and 6b, synthetic FanDuel "MLB Early Win Token" as unrecognized and as not_a_promo. Reading: bonus_bet, bonusAmount null, medium. Result: skipped, suppressed, isReviewWorthySkip false (this matters most for 6a, since unrecognized is normally always review-worthy), rescuesWithoutAmount.
    - One combined run over all six: stats.reviewRouted 0, candidates empty, and every output skip fails isReviewWorthySkip. A console.warn spy sees one "clear skip kept" line per clear case and one "rescue skipped, no guard-backed amount" line per rescue case.
    - Regression row: a pattern-kept candidate (DK 1125873) with a guard-backed money disagreement (maxStake differs) still comes out as review(disagreement).
    reconcile.test.ts updates (keep every other case untouched):
    - (g) DK 1126078 futures against a usable profit_boost reading now gives kind "skip", via "clear_reason_kept", reason still futures. The old review(clear_reason_conflict) expectation is replaced as owner decision 1 requires.
    - (j) mislabeled rescue. Run it first. If the guard leaves boostPercent non-null, the existing review(rescue_needs_review) assertions stay as they are. If the same-occurrence rule drops boostPercent too (so no guard-backed amount), change only the outcome assertion to kind "skip", via "rescue_without_amount". Keep the guard assertions (maxStake null, droppedFields contains maxStake) and the "never a candidate" guarantee. MANDATORY: the SUMMARY must state which branch fired for (j) (review kept, or changed to skip), with the observed guarded.boostPercent value. A SUMMARY without this line is incomplete.
    - (e) rescue candidate and (e-medium) review stay unchanged (both have guard-backed boostPercent "50.00").
    - New case: a not_a_promo skip plus a high-confidence usable reading with no amount gives skip(rescue_without_amount) with reviewSuppressed "reader_rescue_without_amount".
    - New case: an unsupported_sport skip plus a medium-confidence reading with a guard-backed bonusAmount still gives review(rescue_needs_review).
  </behavior>
  <action>
    Per owner decisions 1 and 2:

    (1) scraped.ts: add an optional field to SkippedEntry, `reviewSuppressed?: "reader_rescue_without_amount"`. Give it a doc comment saying the promo reader tried to rescue this skip without any guard-backed amount (quick-260928-mgi), so it must never become a classify review row.

    (2) reviewTriage.ts: make the first line of isReviewWorthySkip return false when skip.reviewSuppressed is set. That covers REVIEW_SKIP_REASONS too, which is what keeps the Early Win "unrecognized" case out of run.ts's buildClassifyWrites. No other change to reviewTriage.

    (3) reconcile.ts:
    - ReconcileOutcome skip `via` gains "clear_reason_kept" and "rescue_without_amount".
    - Remove "clear_reason_conflict" from the review `why` union and from the ReviewWhy type, since it's no longer produced. Grep src and scripts for any other reference and update it.
    - In reconcileSkip's usable branch, a skip whose reason is in CLEAR_SKIP_REASONS now returns kind "skip", via "clear_reason_kept", with the skip unchanged (reason not rewritten).
    - For the uncertain branch, keep the existing overlay and high-confidence candidate attempt exactly as today, so a schema-valid rescue can still become a candidate.
    - Just before the final review(rescue_needs_review) return, add a gate. If reading.boostPercent is null AND reading.bonusAmount is null (no guard-backed concrete amount), return kind "skip", via "rescue_without_amount", with the original skip plus reviewSuppressed "reader_rescue_without_amount".
    - Candidate-entry rules (reconcileCandidate) are untouched: a pattern-kept candidate is never dropped, and a money disagreement still goes to review.
    - Update the reconcileSkip doc comment to describe the new order.

    (4) readerPass.ts:
    - ReaderBookStats gains clearSkipOverrides and rescuesWithoutAmount, both 0 in emptyStats.
    - In applyOutcome's skip branch, for via "clear_reason_kept", increment clearSkipOverrides and console.warn "applyPromoReader: clear skip kept for {bookKey} {externalId}: parser {reason}, reader said {kind} ({confidence}) -- not sent to review". This needs the reading, so pass the guarded reading into applyOutcome or build the message before calling it. Your choice; keep it pure-logging.
    - For via "rescue_without_amount", increment rescuesWithoutAmount and console.warn "applyPromoReader: rescue skipped for {bookKey} {externalId}: reader said {kind} ({confidence}) with no guard-backed amount -- not sent to review".
    - Both still push the skip into `skipped`.

    (5) run.ts: add clearSkipOverrides: 0 and rescuesWithoutAmount: 0 to the reader-pass-exception fallback ReaderBookStats literal. No other run.ts change in this task.

    (6) scripts/scrape-promos.ts: add clearSkipOverrides and rescuesWithoutAmount to the reader totals reduce and to the "promo reader usage:" line.

    Write the tests first (RED), then implement (GREEN). In readerPass.test.ts, load the Bally list fixture with ballybetScraper.parse({ listBody, detailBodies: {} }, ctx), and DK and FanDuel with their scrapers' parse, the same way reconcile.test.ts and the book tests do. Look each entry up by externalId. Do not add a new fixture file.
  </action>
  <verify>
    <automated>npx vitest run src/ingestion/promos/reconcile.test.ts src/ingestion/promos/readerPass.test.ts src/ingestion/promos/run.test.ts src/ingestion/promos/reviewTriage.test.ts && npx tsc --noEmit 2>&1 | grep -v LayoutProps | grep -c "error TS" | grep -qx 0 && test "$(grep -v '^\s*//' src/ingestion/promos/reconcile.ts | grep -v '^\s*\*' | grep -c clear_reason_conflict)" = "0"</automated>
  </verify>
  <done>All 6 noise cases (7 rows including both Early Win variants) end up skipped, logged and counted, and none is review-worthy. (g) now expects skip(clear_reason_kept). Rescue, merge, disagreement and mislabel guarantees still pass. The typecheck has no errors besides the pre-existing LayoutProps one. clear_reason_conflict no longer appears in reconcile.ts code.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Sign-up offer extraction, dedupe key and amount parsing (pure)</name>
  <files>src/ingestion/promos/exclusions.ts, src/ingestion/promos/signupOffers.ts, src/ingestion/promos/signupOffers.test.ts</files>
  <behavior>
    signupOffers.test.ts:
    - Real fixtures, DK 2026-09-28 parse. Extracted offers are exactly externalIds 1118611, 779769, 1107235, with bonusAmount "150.00" for 1118611 and null for the other two. referralsExcluded is 2 (882364, 782037). notSignup is 1 (1098873, the boilerplate-only trigger).
    - FanDuel 2026-09-28: ACQB5G50BB921 gives "250.00" and ACQPECBB1G100ST gives "100.00".
    - Bally list fixture: promo-code-sports with amount null.
    - parseSignupBonusAmount table:
      - "Bet $5 Get $150 in Bonus Bets" gives "150.00".
      - "$1,000 in Bonus Bets" gives "1000.00".
      - "$50 bonus bet" gives "50.00".
      - "Get $25.50 in bonus" gives "25.50".
      - "Deposit Bonus up to $1,000" gives null (the $ isn't followed by bonus wording).
      - "Bet $5, Get $50 for 5 days" gives null.
      - "GET $10 IN CROWN CASH" gives null.
      - No "$" at all gives null.
      - Title match wins over body: title "$150 in Bonus Bets", body "$500 in Bonus Bets" gives "150.00".
      - No title match and body "Get $250 in Bonus Bets ... earn $50 in Bonus Bets daily" gives "250.00".
    - Referral filter: titles or text "Refer a Friend!", "Refer-A-Friend Get Bonus Bets", "Invite your friends to join" and "referral bonus" are excluded. DK boilerplate "the refer-a-friend program" alone does NOT exclude.
    - Only new_customer skips with evidence are considered. Other skip reasons are ignored.
    - signupDedupeKey: "signup:draftkings:1118611" when there's an externalId. When externalId is null, a stable "signup:{bookKey}:t:" plus a 16-hex sha256 of the whitespace-collapsed, lowercased title.
    - sourceUrl for every offer is the book's public site from SIGNUP_PAGE_URLS, never the scraped API URL.
    - description is the whitespace-collapsed rawText with the DK login boilerplate removed, at most 280 chars, ending in "…" when trimmed.
  </behavior>
  <action>
    Per owner decision 3 and the storage requirements:

    (1) exclusions.ts: export a small helper, `mentionsNewCustomer(text: string): boolean`, that tests the existing NEW_CUSTOMER_TEXT_RE. Don't change any regex or classifyExclusion behavior.

    (2) New src/ingestion/promos/signupOffers.ts. Pure, no DB or network.
    - Export SIGNUP_PAGE_URLS: Record<string, string> = draftkings https://sportsbook.draftkings.com/, fanduel https://sportsbook.fanduel.com/, ballybet https://play.ballybet.com/. These are the public origins each scraper already uses as its referer. The scraped sourceUrls are JSON API endpoints, so linking there would show a member raw JSON. An unknown book key gets no offer URL: skip the entry and count it as notSignup.
    - Export interface SignupOfferInput { bookKey, dedupeKey, externalId: string|null, title, description, rawText (<=2000), bonusAmount: string|null, sourceUrl, expiresAt: string|null }. Task 3 consumes this interface.
    - Export extractSignupOffers(bookKey, skipped: readonly SkippedEntry[]) returning { offers: SignupOfferInput[]; referralsExcluded: number; notSignup: number }.
      - Consider only reason === "new_customer" entries that have evidence.
      - Let combined = title plus rawText.
      - Referral rule first. REFERRAL_RE matches refer-a-friend or refer a friend (with the same (?!\s+program) lookahead exclusions.ts uses), a whole-word "referral" or "referred", and "invite your friends?". A match is excluded and counts toward referralsExcluded.
        - Why referrals are out: these reward an existing customer for bringing someone in. A member who lacks the book can't claim one; they'd need an existing customer to refer them. So it's not a sign-up offer for the member. Put this in a doc comment and the SUMMARY.
      - Boilerplate rule next. If the rawText contains DK's logged-out boilerplate (regex /please log in or sign up to view terms and conditions\.?/gi), strip it. The entry then only counts as a sign-up offer if mentionsNewCustomer(title plus stripped text) is still true; otherwise it counts toward notSignup. This excludes DK 1098873 "Daily Rewards Rocket Turbo!". Entries without that boilerplate keep the parser's new_customer verdict, since FanDuel flags these by its ACQ tag and DK by category, neither of which is visible here.
      - Dedupe entries within one call by dedupeKey. The first one wins.
    - Export parseSignupBonusAmount(title, body): string|null.
      - Deterministic only; never use the reader for money.
      - Use a global regex anchored to "$" and bonus wording: "\$" then an amount, which is either digits with comma thousands separators or plain digits, with an optional .dd, then optional whitespace, then an optional "in ", then "bonus bets", "bonus bet" or "bonus", case-insensitive, word-bounded.
      - Strip commas and normalize to a 2-dp string with decimal.js (never a JS number).
      - Search the title first. If it has any match, return the largest title match. Otherwise return the largest match in the body. Otherwise null.
      - Headline justification (for the doc comment and the SUMMARY): the headline is the total bonus a new customer receives. DK's title "$150 in Bonus Bets, Paid Over 14 Days" is the total paid in parts. FanDuel's title "$50" is followed by "for 5 days", not bonus wording, so it isn't a match, and the body's "$250 in Bonus Bets guaranteed" is the total of the five $50 daily installments. So 250.00 is consistent with DK's total-offer semantics.
    - Export signupDedupeKey(bookKey, externalId, title) as described in <behavior>, using node:crypto sha256.
    - description: whitespace-collapsed rawText with the boilerplate stripped, at most 280 chars plus "…".
  </action>
  <verify>
    <automated>npx vitest run src/ingestion/promos/signupOffers.test.ts src/ingestion/promos/exclusions.test.ts src/ingestion/promos/boundary.test.ts</automated>
  </verify>
  <done>Every expectation in the fixture table passes: DK 150.00, FanDuel 250.00 and 100.00, Bally null, both DK referrals and Rocket Turbo excluded. Every amount-parsing and referral case passes.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: signup_offers table and migration, store upsert/expire, and run.ts wiring</name>
  <files>src/db/schema.ts, drizzle/0008_signup_offers.sql, drizzle/meta/0008_snapshot.json, drizzle/meta/_journal.json, src/ingestion/promos/signupStore.ts, src/ingestion/promos/signupStore.test.ts, src/ingestion/promos/store.ts, src/ingestion/promos/run.ts, src/ingestion/promos/run.test.ts</files>
  <behavior>
    signupStore.test.ts: mock @/db/client getDb to return a real drizzle neon-http instance built on a dummy URL (e.g. postgresql://u:p@db.invalid/x, never contacted), with `batch` replaced by a vi.fn that records its statements and resolves [[]...]. If the neon-http constructor refuses the dummy URL, fall back to a chain-recording mock of db.update/db.insert and say so in the SUMMARY. Assert on each statement's toSQL():
    - The upsert targets signup_offers with on conflict ("dedupe_key") do update. The update set includes last_seen_at, status and bonus_amount and does NOT include first_seen_at.
    - The expire statement updates status to 'expired' where book_key equals the book, status is 'active' and dedupe_key is not in the seen keys.
    - Empty offers expire the book's previously active offers. commitSignupOffers("draftkings", [], now) issues exactly one batch containing exactly one statement: an update to status 'expired' where book_key = 'draftkings' and status = 'active', with NO dedupe_key NOT IN clause. When the batch mock resolves that statement's returning rows as [{id:1},{id:2}], the result is { upserted: 0, expired: 2 }. That proves a successful scrape that saw no offers expires every one of that book's previously active offers.
    - Every statement goes through a single db.batch call.
    run.test.ts:
    - An ok DK run calls store.commitSignupOffers once with "draftkings", the 3 extracted offers and `now`, and the outcome carries a signup object with the counts.
    - Existing test (c) is renamed to "(c) a book whose every found promo is a clear/legitimate exclusion is ok with 0 kept, commits no promos, and still commits (expires) sign-up offers with an empty list". Its existing no-promo-commit assertions stay. It adds: commitSignupOffers called exactly once, with the book key, an empty array `[]` and `now`. This works because its skips contain no new_customer entry; if they do, build the expected array from extractSignupOffers instead and note it.
    - A zero-candidate ok book that does have classify writes also calls commitSignupOffers exactly once.
    - A list-fetch failure, a parse throw and a zero-found run never call commitSignupOffers.
    - commitSignupOffers rejecting leaves the book status "ok" and logs a warning.
    - With a reader configured, the offers come from the parser's pre-reader skips (a fake reader that returns not_usable for everything gives the same offers).
  </behavior>
  <action>
    Per owner decision 3 and the storage requirements. This task consumes extractSignupOffers and SignupOfferInput from Task 2.

    (1) schema.ts: add signupOffers = pgTable("signup_offers", ...) with these columns:
    - id serial primary key
    - book_key text not null, references books.key (same as promos)
    - dedupe_key text not null unique
    - external_id text
    - title text not null
    - description text not null
    - raw_text text not null
    - bonus_amount numeric(10,2) nullable
    - source_url text not null
    - expires_at timestamptz
    - first_seen_at timestamptz not null
    - last_seen_at timestamptz not null
    - status text not null ("active" | "expired")
    Add indexes signup_offers_status_idx on status and signup_offers_book_key_idx on book_key. Write a doc comment explaining it's deliberately separate from promos, so offers never enter ranking, review, profit tracking or dedupe collisions (including with the dismissed classify rows 6-11).
    Then run `DATABASE_URL=postgresql://u:p@localhost/x npx drizzle-kit generate --name signup_offers` to produce drizzle/0008_signup_offers.sql, the snapshot and the journal entry. The dummy URL is only there because generate never connects. Do NOT run the migration.

    (2) New src/ingestion/promos/signupStore.ts: `commitSignupOffers(bookKey, offers: SignupOfferInput[], now): Promise<{ upserted: number; expired: number }>`.
    - Unlike commitScrapedPromos, an empty offers list is NOT refused. It must still run the expire statement, because a successful scrape that saw no sign-up offers means that book's old offers are gone.
    - One db.batch: an expire statement plus one upsert per offer.
    - Expire: update signup_offers set status 'expired' where book_key = bookKey and status = 'active', plus dedupe_key NOT IN seen keys only when offers is non-empty. Use drizzle's and/eq/notInArray, and skip notInArray on an empty list.
    - Upsert: insert with first_seen_at = last_seen_at = now and status 'active'. On conflict on dedupe_key, update title, description, raw_text, bonus_amount, source_url, expires_at, last_seen_at = now and status = 'active'. Never update first_seen_at.
    - Order the batch as expire first, then upserts. The expire's NOT IN excludes every seen key, so order doesn't matter, but put that reasoning in a comment.
    - Returning ids from the expire statement gives the expired count.
    - Add commitSignupOffers to the PromoStore interface and the promoStore object in store.ts (import from ./signupStore).

    (3) run.ts:
    - Right after a successful parse (found > 0) and BEFORE the reader pass, capture `const signupExtraction = extractSignupOffers(bookKey, parseResult.skipped)`, using the parser's own verdict for determinism, identical with the reader on or off.
    - Add a small helper, commitSignupOffersSafely(store, bookKey, offers, now). It wraps store.commitSignupOffers in try/catch: on error, console.warn with the truncated message and return null. A sign-up write failure never fails the book (for example, before migration 0008 is applied).
    - Placement is explicit. In the zero-candidate ok branch, call commitSignupOffersSafely UNCONDITIONALLY. The call goes after the closing brace of the existing `if (classifyWrites.length > 0) { ... }` block, never inside it, and before that branch's outcome is built. Call it even when signupExtraction.offers is empty, so a successful run whose promos are all clear exclusions still expires stale sign-up offers.
    - In the normal (candidates present) ok branch, call it unconditionally right after the `await store.commitScrapedPromos(...)` line, also with a possibly empty list.
    - Never call it on any failed path (no scraper, fetch failure, parse throw, zero found, or the outer catch).
    - BookRunOutcome gains an optional `signup?: { offers: number; referralsExcluded: number; notSignup: number; upserted: number | null; expired: number | null }`, present on ok outcomes only.
    - Update run.test.ts's makeStore to add commitSignupOffers (vi.fn resolving { upserted: 0, expired: 0 }). Add the new `signup` field to existing full ok-outcome expectations. Apply the test (c) change described in <behavior>; change no other existing expectation.
  </action>
  <verify>
    <automated>npx vitest run src/ingestion/promos/signupStore.test.ts src/ingestion/promos/run.test.ts src/ingestion/promos/boundary.test.ts && test -f drizzle/0008_signup_offers.sql && grep -q 'CREATE TABLE "signup_offers"' drizzle/0008_signup_offers.sql && grep -q '0008_signup_offers' drizzle/meta/_journal.json</automated>
  </verify>
  <done>
    - Store tests prove the upsert keeps first_seen_at, the expire only hits unseen active rows of that book, and an empty-offers commit expires all of that book's active offers.
    - run.test proves commitSignupOffers runs exactly once on every ok book run, including test (c)'s all-clear-exclusions run (called with []) and a zero-candidate run with classify writes.
    - run.test proves failed runs never commit or expire sign-up offers, and a sign-up commit error never fails a book.
    - Migration 0008 is generated but not applied.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 4: getSignupOffers action and the "Sign-up offers" tab</name>
  <files>src/domain/promos/signupOffers.ts, src/domain/promos/signupOffers.test.ts, src/db/signupOffers.ts, src/app/actions/get-signup-offers.ts, src/app/actions/get-signup-offers.test.ts, src/components/signup/SignupOffersScreen.tsx, src/components/AppShell.tsx</files>
  <behavior>
    src/domain/promos/signupOffers.test.ts (pure groupSignupOffersForMember):
    - Owned ["draftkings"] with offers at draftkings, fanduel and ballybet gives groups for fanduel and ballybet only, ordered by COLORADO_BOOKS sortOrder, and empty is null.
    - Owned every book that has an offer gives groups [] and empty "have-all".
    - No offers at all gives groups [] and empty "none".
    - An unknown owned key is ignored.
    - An offer whose sourceUrl is "javascript:alert(1)" or unparseable gives link null. An https URL passes through.
    - bonusAmount "150.00" gives bonusLabel "$150.00" via formatUsd. Null gives null.
    - Within a group, offers are sorted by bonus amount descending (Decimal compare, nulls last), then title.
    get-signup-offers.test.ts (mocks @/lib/session requireUser, @/db/queries getUserBookKeys and @/db/signupOffers getActiveSignupOffers, same vi.hoisted pattern as get-promos.test.ts):
    - When requireUser rejects (simulate the redirect by throwing), getUserBookKeys and getActiveSignupOffers are never called and the action rejects.
    - getUserBookKeys is called with exactly the session's userId (e.g. 42). The action's declared parameter list is empty: assert getSignupOffers.length === 0, so a client can never supply a userId.
    - Filtering end to end: session user owns fanduel. The response has no fanduel group and has draftkings and ballybet groups.
    - A thrown DB error propagates, and the client shows the error state.
  </behavior>
  <action>
    Per owner decision 3 and the UI requirements:

    (1) New src/domain/promos/signupOffers.ts. Pure; must not import @/ingestion/promos (boundary test).
    - SignupOfferRow type (what the DB returns): id, bookKey, title, description, bonusAmount: string|null, sourceUrl, expiresAt: string|null ISO.
    - SignupOfferDTO: id, title, description, bonusLabel: string|null, link: string|null, expiresAt: string|null.
    - SignupOfferGroupDTO: bookKey, bookName, offers.
    - GetSignupOffersResponse: { status: "ok"; groups: SignupOfferGroupDTO[]; empty: null | "none" | "have-all" }.
    - Also a local safeHttpUrl. Copy the http/https allowlist pattern from get-promos.ts, since you can't import from a "use server" file.
    - groupSignupOffersForMember(rows, ownedBookKeys: ReadonlySet<string>): GetSignupOffersResponse.
      - Use bookName from COLORADO_BOOKS, falling back to bookKey.
      - Order groups by COLORADO_BOOKS sortOrder; unknown books go last, alphabetically.
      - No profit math (owner decision 3: informational only).

    (2) New src/db/signupOffers.ts: getActiveSignupOffers(now: Date): Promise<SignupOfferRow[]>.
    - Select from signupOffers where status = 'active' and (expires_at is null or expires_at > now).
    - Map timestamps to ISO strings.
    - Server-only DB read following src/db/promos.ts style.

    (3) New src/app/actions/get-signup-offers.ts with "use server". `export async function getSignupOffers(): Promise<GetSignupOffersResponse>` takes NO arguments:
    - user = await requireUser()
    - owned = new Set(await getUserBookKeys(user.userId))
    - rows = await getActiveSignupOffers(new Date())
    - return groupSignupOffersForMember(rows, owned)
    userId comes only from the session. Use the raw saved keys (getUserBookKeys), not getUsableUserBooks, because "books the member has" is about accounts they hold, not odds coverage.

    (4) New src/components/signup/SignupOffersScreen.tsx with "use client". Follow PromosScreen's fetch-on-mount pattern: a useTransition call to getSignupOffers, where a thrown error clears the response and shows an error state. Layout per 03-UI-SPEC (same tokens, 4 sizes, 2 weights):
    - Panel header: "Sign-up offers" (text-xl font-semibold). One-line description (text-sm text-muted-foreground): "New-customer offers at sportsbooks you haven't added yet. For reference only, with no hedge math."
    - Loading: three Skeleton h-14 w-full rows while pending with no response.
    - Error: Alert variant="destructive" reading "Couldn't load sign-up offers." with a "Try again" Button (h-10) that re-runs the fetch.
    - Empty "none": dashed-border shell (rounded-lg border border-dashed border-border bg-background p-6). Heading "No sign-up offers right now". Body "The scraper hasn't found any new-customer offers. New ones appear automatically after the next scheduled scrape."
    - Empty "have-all": same shell. Heading "You already have every book with a sign-up offer". Body "Every sportsbook with a current new-customer offer is already in your book list." Add Button variant="outline" nativeButton={false} render a Link to /settings, labeled "Manage your books", as PromosEmptyState does.
    - Groups: for each group, a section with the bookName heading (text-xl font-semibold) and a gap-3 stack of cards (rounded-lg border border-border bg-secondary p-4, same as ClassifyQueueCard). Each card shows:
      - the title (text-base)
      - bonusLabel as "{bonusLabel} in bonus bets" in a `num` span, when present
      - the description (text-sm text-muted-foreground)
      - "Expires {etDayLabel(expiresAt)}" when present
      - an anchor "View on {bookName}" with target="_blank" and rel="noopener noreferrer", only when link is non-null.
    - Render all text as React text, never dangerouslySetInnerHTML.

    (5) AppShell.tsx:
    - ActiveTab becomes "bonus" | "arbitrage" | "promos" | "signup".
    - Add `<TabsTrigger value="signup">Sign-up offers</TabsTrigger>` after Promos.
    - Add a keepMounted TabsContent value="signup" rendering SignupOffersScreen. No props are needed; it doesn't depend on odds or recomputeKey.
    - Update the AppShell doc comment's tab list.
  </action>
  <verify>
    <automated>npx vitest run src/domain/promos/signupOffers.test.ts src/app/actions/get-signup-offers.test.ts src/ingestion/promos/boundary.test.ts && npx vitest run && npx tsc --noEmit 2>&1 | grep -v LayoutProps | grep -c "error TS" | grep -qx 0 && npm run lint</automated>
  </verify>
  <done>The Sign-up offers tab appears after Promos. It lists offers grouped by book, for books the member doesn't have only, with loading, error, "none" and "have-all" states. The action's userId comes only from requireUser. Links are http/https only. The full vitest suite, typecheck (except the pre-existing LayoutProps error) and lint all pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| sportsbook promo JSON -> scraper | Untrusted third-party text becomes stored titles, descriptions, amounts and URLs |
| promo reader (LLM) -> reconcile | Model output decides routing; must never override a clear parser exclusion or push unbacked noise to review |
| client -> getSignupOffers server action | A member's browser calls the action; user identity must come from the session cookie only |
| DB text -> React UI | Stored scraped text and URLs are rendered to members |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-mgi-01 | Spoofing / Elevation | get-signup-offers.ts | mitigate | The action takes no parameters. userId comes only from requireUser(). A test asserts getSignupOffers.length === 0 and that getUserBookKeys receives the session userId. |
| T-mgi-02 | Tampering | reconcile.ts / readerPass.ts | mitigate | A clear parser exclusion always wins over the reader. A rescue without a guard-backed amount is marked reviewSuppressed, and isReviewWorthySkip honors that. Covered by the 6-case table test. |
| T-mgi-03 | Tampering | signupOffers.ts amount parsing | mitigate | Deterministic "$"-anchored, bonus-wording-anchored regex with decimal.js 2-dp strings. The reader is never used for sign-up money. Fixture-pinned tests. |
| T-mgi-04 | Tampering (XSS via URL) | SignupOffersScreen links | mitigate | The stored sourceUrl comes from the SIGNUP_PAGE_URLS constants, not scraped text. It's re-checked with an http/https allowlist in groupSignupOffersForMember, and there's a javascript: test case. rel="noopener noreferrer". |
| T-mgi-05 | Tampering (XSS via text) | SignupOffersScreen | mitigate | Title and description render as React text only. Description is capped at 280 chars and raw_text at 2000. |
| T-mgi-06 | Denial of Service / Integrity | run.ts sign-up commit | mitigate | Called unconditionally on every ok book run (an empty list expires stale offers) and never on a failed run. Wrapped in try/catch so a sign-up write failure (e.g. before migration 0008) never fails the promo run. |
| T-mgi-07 | Information Disclosure | signup_offers table | accept | Only public marketing copy from logged-out endpoints. No PII, no credentials. |
| T-mgi-08 | Tampering | ranking/review isolation | mitigate | Separate signup_offers table, never read by get-promos, the review queue, profit tracking or promo dedupe. |
</threat_model>

<verification>
- `npx vitest run` passes the whole suite, including the new readerPass, signupOffers (ingestion and domain), signupStore and get-signup-offers tests.
- `npx tsc --noEmit` shows no errors besides the pre-existing LayoutProps one. `npm run lint` is clean.
- drizzle/0008_signup_offers.sql exists and is registered in _journal.json. It has NOT been applied.
- boundary.test.ts still passes: nothing in src/app or src/components imports @/ingestion/promos.
</verification>

<success_criteria>
- The 6 noise promos from the 2026-09-28 live run would now all be skipped and logged, with 0 review rows.
- Existing reader guarantees are intact: high-confidence rescue, merge, candidate never dropped, money disagreement goes to review.
- New-customer offers are stored in their own table with upsert on each ok scrape and expire-unseen that never runs on a failed book run. Referrals and DK's boilerplate-only false positives are excluded.
- A successful book run always commits sign-up offers (even an empty list, which expires stale ones), outside the classify-writes guard.
- A member sees a Sign-up offers tab for books they don't have, with the correct amounts (DK $150.00, FanDuel $250.00 and $100.00).
</success_criteria>

<output>
Create `.planning/quick/260928-mgi-reader-review-tightening-and-new-custome/260928-mgi-SUMMARY.md` when done. It must include:
- The referral decision and its fixture justification.
- The headline-amount rule (DK 150, FanDuel 250 total vs 50 daily).
- MANDATORY: which branch reconcile test (j) took (review kept, or changed to skip), with the observed guarded.boostPercent.
- The DK Crown Cash note (a DK Racing new-account offer kept as a DK sign-up offer).
- User setup: apply migration 0008 with `npm run db:migrate`. Until then, sign-up commits log a warning and the tab shows its error state.
- A note that bonus-bet conversion value (expected profit from converting the sign-up bonus) could be added to the Sign-up offers tab later. It is out of scope now per owner decision 3.
</output>
