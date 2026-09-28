# Quick Task 260928-mgi: Reader Review Tightening and Sign-up Offers Tab

One-liner: clear parser exclusions and unbacked reader rescues now stay out of the review queue entirely, and new-customer promos are captured into their own `signup_offers` table and a new "Sign-up offers" tab, both governed by owner decisions 1-3.

## What changed

**Task 1 — reader review tightening (owner decisions 1 and 2)**
- `src/domain/promos/scraped.ts`: `SkippedEntry.reviewSuppressed?: "reader_rescue_without_amount"`.
- `src/ingestion/promos/reviewTriage.ts`: `isReviewWorthySkip` returns `false` first when `reviewSuppressed` is set — this beats even `REVIEW_SKIP_REASONS`, so a suppressed `unrecognized`/`unsupported_sport`/`schema_invalid` skip (normally *always* review-worthy) still never reaches the classify queue.
- `src/ingestion/promos/reconcile.ts`: a skip whose reason is in `CLEAR_SKIP_REASONS` now returns `skip(via: "clear_reason_kept")` instead of `review(why: "clear_reason_conflict")` — the reason string is never rewritten. A rescue attempt that doesn't qualify for auto-promotion now checks `reading.boostPercent === null && reading.bonusAmount === null`; when true it returns `skip(via: "rescue_without_amount")` with `reviewSuppressed` set, instead of `review(why: "rescue_needs_review")`. `clear_reason_conflict` no longer exists anywhere in the file.
- `src/ingestion/promos/readerPass.ts` / `run.ts` / `scripts/scrape-promos.ts`: new `clearSkipOverrides`/`rescuesWithoutAmount` counters, logged per-entry and totaled in the scraper's console summary line.

**Task 2 — pure sign-up offer extraction**
- `src/ingestion/promos/exclusions.ts`: exported `mentionsNewCustomer` (thin wrapper over the existing regex, no behavior change).
- `src/ingestion/promos/signupOffers.ts` (new): `extractSignupOffers`, `parseSignupBonusAmount`, `signupDedupeKey`, `SIGNUP_PAGE_URLS`. Pure — no DB, no network, no reader.

**Task 3 — storage**
- `src/db/schema.ts`: `signupOffers` table, deliberately separate from `promos`.
- `drizzle/0008_signup_offers.sql` + `drizzle/meta/{0008_snapshot.json,_journal.json}`: generated via `DATABASE_URL=postgresql://u:p@localhost/x npx drizzle-kit generate --name signup_offers` (dummy URL, drizzle-kit never connects). **Not applied.**
- `src/ingestion/promos/signupStore.ts` (new): `commitSignupOffers` — one `db.batch` with an expire statement (status → `'expired'` where `book_key` + `status='active'` + `dedupe_key NOT IN [...]`, omitting the `NOT IN` clause entirely when `offers` is empty) plus one upsert per offer (`ON CONFLICT (dedupe_key) DO UPDATE`, never touching `first_seen_at`).
- `src/ingestion/promos/store.ts`: `commitSignupOffers` added to `PromoStore`.
- `src/ingestion/promos/run.ts`: `extractSignupOffers` runs on the parser's own **pre-reader** skips (identical result whether or not a reader is configured). `commitSignupOffersSafely` commits unconditionally on every "ok" book run (including the zero-candidate/all-exclusions branch, even with an empty offers array — this is what expires stale offers), never on a failed run, and swallows any write error into a `console.warn` so a sign-up write failure can never fail the book.

**Task 4 — the tab**
- `src/domain/promos/signupOffers.ts` (new, distinct from the ingestion module of the same basename): `groupSignupOffersForMember` — groups by book for books the member doesn't own, `COLORADO_BOOKS` sort order, within-group sort by bonus amount descending (Decimal, nulls last) then title, `http`/`https`-only link allowlist.
- `src/db/signupOffers.ts` (new): `getActiveSignupOffers`.
- `src/app/actions/get-signup-offers.ts` (new): `getSignupOffers()` — zero parameters, `userId` only from `requireUser()`.
- `src/components/signup/SignupOffersScreen.tsx` (new) and `AppShell.tsx`: new "Sign-up offers" tab after Promos, `keepMounted`, no `hasCachedOdds`/`recomputeKey` dependency.

## Referral decision and its fixture justification

Referral offers (`refer-a-friend`, `referral`, `referred`, `invite your friend(s)`) are excluded from sign-up offers even though the parser correctly tags them `new_customer`. Rationale: a refer-a-friend reward pays an *existing* customer for bringing someone in — a member who doesn't have the book can't claim one themselves; they'd need an existing customer at that book to refer them. So it is never a sign-up offer *for the member*, regardless of the parser's own classification.

Fixture proof: DK 882364 and 782037 ("Refer a Friend!") are both excluded (`referralsExcluded: 2`) from the real `draftkings-promos-2026-09-28.json` fixture. DK's own legal boilerplate ("...the refer-a-friend program, or any other offers...") does **not** trigger the exclusion by itself — the same `(?!\s+program)` negative lookahead `exclusions.ts` already uses protects it, verified with a dedicated unit test.

## Headline-amount rule

`parseSignupBonusAmount` checks the **title** first; any title match wins outright, even over a larger match in the body. Rationale: the headline states the *total* bonus a new customer receives — DK's title "New Sportsbook Customers Bet $5 Get $150 in Bonus Bets, Paid Over 14 Days" already names the $150 total (paid in installments), so the title match (`150.00`) is correct and authoritative.

FanDuel's title "Bet $5, Get $50 for 5 days" has no bonus wording immediately after "$50" (it's followed by "for 5 days", not "bonus"/"bonus bet(s)"), so the title match fails and the search falls through to the body: "Get $250 in Bonus Bets guaranteed! Bet $5 each day for 5 days and earn $50 in Bonus Bets daily." Both `$250` and `$50` match the body regex; the largest (`250.00`) wins — and $250 is indeed the total of five $50 daily installments, consistent with DK's own total-offer semantics.

Verified against real fixtures: DK 1118611 → `150.00`; FanDuel ACQB5G50BB921 → `250.00`; FanDuel ACQPECBB1G100ST ("New Customers Bet $1+ and Get $100 in Bonus Bets...") → `100.00`; Bally `promo-code-sports` → `null` (no dollar amount named at all).

## MANDATORY: reconcile.test.ts case (j)

Ran first, as instructed. `guardReading` on the real DK 1125873 text with a reading whose `boostPercent` evidence is `"Profit Boost: 50%"` produces **`guarded.boostPercent = "50.00"`** (non-null) — the evidence string contains the literal word "boost" immediately preceding the percent sign, so the boostPercent field survives the guard even though `maxStake` (evidence also `"Profit Boost: 50%"`, no `$` prefix) is dropped.

Because `boostPercent` is non-null, the new gate (`reading.boostPercent === null && reading.bonusAmount === null`) is **false**, so this case falls through unchanged to `review(why: "rescue_needs_review")` exactly as it did before this task. **Branch taken: review kept (unchanged)** — no assertion in case (j) needed to change. Verified by direct inspection (`guardReading` invoked standalone) and by running the existing test unmodified (still passes).

## DK Crown Cash note

DK 1107235 ("GET $10 IN CROWN CASH", category "DK Horse") is a real new-account offer: its terms require "sign up for a new Racing account", which trips the shared `NEW_CUSTOMER_TEXT_RE`'s `sign up` wording (not the "new customers" phrase — the terms literally say "New Racing customers only" with "Racing" breaking that adjacency, but "sign up for a new Racing account" further down does the job). It carries **no** DK login boilerplate, so the boilerplate-strip rule never fires, and it is kept as a sign-up offer with `bonusAmount: null` ("Crown Cash" never matches the `$N ... bonus` wording).

## User setup

Apply migration 0008 with `npm run db:migrate` before this feature is live. Until then:
- `commitSignupOffersSafely` catches the write failure, logs a `console.warn`, and never fails the book's scrape run (verified by a dedicated test: `outcomes[0].status` stays `"ok"`, `signup.upserted`/`signup.expired` are `null`).
- The Sign-up offers tab's `getActiveSignupOffers` read will throw against the missing table; `SignupOffersScreen` shows its error state ("Couldn't load sign-up offers.") with a "Try again" retry until the migration is applied.

## Future scope note

Bonus-bet conversion value (expected profit from converting the sign-up bonus into a hedge) could be added to the Sign-up offers tab later — it is explicitly out of scope now per owner decision 3 (informational only, no hedge math, no profit ranking).

## Deviations from Plan

None — plan executed exactly as written, including the mandatory (j) branch investigation.

## Known Stubs

None. Every code path wired end to end (extraction → store → run.ts → DB read → action → UI) and covered by tests against real fixtures.

## Threat Flags

None beyond the plan's own `<threat_model>` (T-mgi-01 through T-mgi-08), all of which are implemented and covered by tests as described in the plan.

## Self-Check

Files created, verified to exist:
- `src/ingestion/promos/readerPass.test.ts` — FOUND
- `src/ingestion/promos/signupOffers.ts` — FOUND
- `src/ingestion/promos/signupOffers.test.ts` — FOUND
- `src/ingestion/promos/signupStore.ts` — FOUND
- `src/ingestion/promos/signupStore.test.ts` — FOUND
- `drizzle/0008_signup_offers.sql` — FOUND
- `drizzle/meta/0008_snapshot.json` — FOUND
- `src/domain/promos/signupOffers.ts` — FOUND
- `src/domain/promos/signupOffers.test.ts` — FOUND
- `src/db/signupOffers.ts` — FOUND
- `src/app/actions/get-signup-offers.ts` — FOUND
- `src/app/actions/get-signup-offers.test.ts` — FOUND
- `src/components/signup/SignupOffersScreen.tsx` — FOUND

Commits, verified to exist in `git log`:
- `867ef25` (Task 1) — FOUND
- `3e0abea` (Task 2) — FOUND
- `9a61963` (Task 3) — FOUND
- `9121429` (Task 4) — FOUND

## Self-Check: PASSED

## Verification

- `npx vitest run` — 67 test files, 970 tests, all passing.
- `npx tsc --noEmit` — zero errors besides the pre-existing `src/app/layout.tsx` `LayoutProps` error.
- `npm run lint` — clean.
- `drizzle/0008_signup_offers.sql` exists, contains `CREATE TABLE "signup_offers"`, registered in `drizzle/meta/_journal.json`. **Not applied** (`npm run db:migrate` never run).
- `boundary.test.ts` passes — nothing under `src/app` or `src/components` imports `@/ingestion/promos`.
- `grep -c clear_reason_conflict src/ingestion/promos/reconcile.ts` (excluding comments) → `0`.
