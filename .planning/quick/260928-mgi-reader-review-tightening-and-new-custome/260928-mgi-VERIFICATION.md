---
phase: quick-260928-mgi
verified: 2026-09-28T17:00:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
---

# Quick Task 260928-mgi: Reader Review Tightening and Sign-up Offers Tab Verification Report

**Phase Goal:** (1) Tighten the promo reader's review routing so clear parser exclusions always win and unbacked reader rescues never reach review. (2) Store new-customer promos in their own `signup_offers` table, shown on a new "Sign-up offers" tab, isolated from ranking/review/dedupe.
**Verified:** 2026-09-28T17:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A clear parser skip (futures/outright/parlay/sgp/prop/live_only/new_customer/deposit/not_half_point) always wins over the reader; disagreement only logged | ✓ VERIFIED | `reconcile.ts` `reconcileSkip`: `if (CLEAR_SKIP_REASONS.has(skip.reason)) return { kind: "skip", skip, via: "clear_reason_kept" }` (line 225-227), placed before the rescue-attempt branch, so it fires whenever the reader thinks the entry is usable. `readerPass.ts` increments `stats.clearSkipOverrides` and does `console.warn` only (line 127-134), never pushes to review. `readerPass.test.ts` Cases 1/4/5 and the combined-run test assert `clearSkipOverrides` counts and `isReviewWorthySkip` false. `clear_reason_conflict` no longer exists anywhere in reconcile.ts (`grep -c` → 0). |
| 2 | A reader rescue of not_a_promo/unrecognized/unsupported_sport reaches review only with a guard-backed boostPercent or bonusAmount | ✓ VERIFIED | `reconcile.ts` lines 262-278: gate `if (reading.boostPercent === null && reading.bonusAmount === null)` returns `skip(via:"rescue_without_amount", reviewSuppressed:"reader_rescue_without_amount")`; otherwise `review(rescue_needs_review)`. `reviewTriage.ts` `isReviewWorthySkip` checks `reviewSuppressed` FIRST (line 89), before `REVIEW_SKIP_REASONS`, so a suppressed `unrecognized` skip (normally always review-worthy) is excluded. Test (k) and (l) in reconcile.test.ts, and Cases 2/3/6a/6b in readerPass.test.ts, directly exercise this. |
| 3 | All 6 real noise cases from 2026-09-28 end up skipped | ✓ VERIFIED | `readerPass.test.ts` "the 6 noise cases" describe block: Bally Stanley Cup (futures), Bally's Profit Boost (not_a_promo), Bally's Odds Boost (not_a_promo), DK SGP boost (sgp), FanDuel ACQB5G50BB921 (new_customer), and synthetic Early Win Token as both unrecognized and not_a_promo (7 rows total). Combined-run test asserts `stats.reviewRouted === 0`, candidates empty, every skip fails `isReviewWorthySkip`. All pass. |
| 4 | A pattern-kept candidate is never dropped; a money disagreement on a candidate still goes to review | ✓ VERIFIED | `reconcileCandidate` (untouched by this task) still returns `review(disagreement)` on money mismatch, never `skip`. `readerPass.test.ts` regression test (DK 1125873, maxStake disagreement) confirms `stats.reviewRouted === 1`. `reconcile.test.ts` cases (e), (e-medium), (f) unchanged. |
| 5 | New-customer promos stored in a separate `signup_offers` table; migration generated, not run | ✓ VERIFIED | `src/db/schema.ts` defines `signupOffers` pgTable with the specified columns/indexes/FK. `drizzle/0008_signup_offers.sql` contains `CREATE TABLE "signup_offers"` and is registered in `drizzle/meta/_journal.json` (tag `0008_signup_offers`). No `db:migrate` was run (confirmed no DB connection attempted; tests use a dummy neon-http client with `batch` mocked). |
| 6 | Upsert/expire runs unconditionally on every ok run (even empty list), never on failed runs | ✓ VERIFIED | `run.ts` line 384 (zero-candidate ok branch, placed AFTER the `classifyWrites.length > 0` block's closing brace, not inside it) and line 444 (normal ok branch, right after `commitScrapedPromos`) both call `commitSignupOffersSafely` unconditionally. `run.test.ts` confirms: called with `[]` for the zero-candidate/all-exclusions case (test (c)), called once for zero-candidate-with-classify-writes, called once for the normal ok path with real offers, and explicitly `not.toHaveBeenCalled()` for no-scraper, fetch-failure, zero-found, parse-throw, and the outer-catch paths (lines 606-663 in run.test.ts). |
| 7 | Bonus amounts parsed deterministically; "Deposit Bonus up to $1,000" and "Crown Cash" not read as amounts; referrals excluded | ✓ VERIFIED | `signupOffers.ts` `parseSignupBonusAmount` uses only regex + decimal.js, title-first-then-body rule. `signupOffers.test.ts` table covers all listed cases including "Deposit Bonus up to $1,000" → null and "GET $10 IN CROWN CASH" → null. `REFERRAL_RE` excludes "Refer a Friend!" (DK 882364/782037, `referralsExcluded: 2`) while DK's boilerplate "the refer-a-friend program" is protected by the `(?!\s+program)` lookahead. |
| 8 | Sign-up offers tab lists offers only for books the member doesn't have, via requireUser/session userId, http(s)-only links; nothing leaks into ranking/profit/review/dedupe | ✓ VERIFIED | `get-signup-offers.ts`: zero-arg exported function, `requireUser()` is the only userId source (test asserts `getSignupOffers.length === 0` and `getUserBookKeys` called with the session's userId). `groupSignupOffersForMember` filters by `ownedBookKeys`, sorts by `COLORADO_BOOKS`. `safeHttpUrl` allowlists http/https only. `grep` across `get-promos.ts`, `dedupe.ts`, `matcher.ts` shows zero references to `signupOffers`/`signup_offers` outside the dedicated signup files; `store.ts`'s only reference is the explicit `commitSignupOffers` export. |

**Score:** 8/8 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/ingestion/promos/reconcile.ts` | clear-reason-wins and rescue-needs-an-amount rules, contains `rescue_without_amount` | ✓ VERIFIED | Present, wired, `clear_reason_conflict` fully removed |
| `src/ingestion/promos/readerPass.test.ts` | table-driven tests for the 6 noise cases | ✓ VERIFIED | 7 rows + combined run + regression case, all passing |
| `src/ingestion/promos/signupOffers.ts` | pure extractor, exports `extractSignupOffers`, `signupDedupeKey`, `parseSignupBonusAmount` | ✓ VERIFIED | All three exported, no DB/network import |
| `src/ingestion/promos/signupStore.ts` | `commitSignupOffers`, upsert + expire in one db.batch | ✓ VERIFIED | Single `db.batch([expireStatement, ...upsertStatements])` |
| `src/db/schema.ts` | `signupOffers` pgTable, contains `signup_offers` | ✓ VERIFIED | Present with doc comment on isolation |
| `drizzle/0008_signup_offers.sql` | generated migration, not applied | ✓ VERIFIED | `CREATE TABLE "signup_offers"` present; journal registered; no migrate run |
| `src/app/actions/get-signup-offers.ts` | `getSignupOffers` server action, requireUser, userId from session only | ✓ VERIFIED | Zero-arg function; `requireUser()` sole userId source |
| `src/components/signup/SignupOffersScreen.tsx` | tab body with loading/error/empty states | ✓ VERIFIED | Skeleton, Alert+retry, "none"/"have-all" empty states, group rendering all present |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `reconcile.ts` | `reviewTriage.ts isReviewWorthySkip` | `reviewSuppressed` short-circuit | ✓ WIRED | `isReviewWorthySkip` line 89: `if (skip.reviewSuppressed) return false;` — first check, beats `REVIEW_SKIP_REASONS` |
| `run.ts` | `signupStore.ts` | `commitSignupOffers` called unconditionally on every ok run, never on failed | ✓ WIRED | Confirmed by direct code read (lines 384, 444) and run.test.ts negative/positive assertions |
| `AppShell.tsx` | `SignupOffersScreen.tsx` | `TabsTrigger value="signup"` + `keepMounted TabsContent` | ✓ WIRED | Lines 62/86-87 of AppShell.tsx |
| `get-signup-offers.ts` | `db/queries.ts getUserBookKeys` | `requireUser().userId`, never a client argument | ✓ WIRED | `getUserBookKeys(user.userId)`; test asserts zero-arg action signature and exact userId passthrough |

### Behavioral Spot-Checks / Test Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Targeted unit tests for this task | `npx vitest run reconcile.test.ts readerPass.test.ts run.test.ts reviewTriage.test.ts signupOffers.test.ts (x2) exclusions.test.ts boundary.test.ts signupStore.test.ts get-signup-offers.test.ts` | 10 files, 169 tests, all passing | ✓ PASS |
| Full suite regression | `npx vitest run` | 67 files, 970 tests, all passing | ✓ PASS |
| Typecheck | `npx tsc --noEmit` (excluding pre-existing LayoutProps error) | 0 errors | ✓ PASS |
| Lint | `npm run lint` | clean | ✓ PASS |
| `clear_reason_conflict` removed | `grep -c` on non-comment lines of reconcile.ts | 0 | ✓ PASS |
| Migration generated, not applied | file existence + journal check | `CREATE TABLE "signup_offers"` present, registered in `_journal.json`, no live DB touched by tests | ✓ PASS |

No probes (`scripts/*/tests/probe-*.sh`) are declared or referenced by this task; none exist in the repo for this area. Skipped.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| QUICK-260928-mgi | 260928-mgi-PLAN.md | Reader review tightening + sign-up offers tab | ✓ SATISFIED | All 8 must-have truths verified above |
| PROMO-03 | 260928-mgi-PLAN.md (declared) | "System scrapes publicly accessible promo pages... adds discovered promos automatically" | ~ PARTIAL (expected) | This quick task improves the review-routing and adds sign-up offer storage/display for an existing scraping pipeline; it does not itself complete the broader PROMO-03 scheduling/automation requirement, which REQUIREMENTS.md still tracks as "Pending" at the Phase 3 level. This is consistent with the task's narrow scope and not a gap introduced by this task. |

### Anti-Patterns Found

None. Scanned all files listed in `files_modified` for TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER/"not yet implemented"/empty-return stubs — none found. `Known Stubs: None` in SUMMARY.md is accurate; all code paths (extraction → store → run.ts → DB read → action → UI) are implemented, not stubbed.

### Human Verification Required

None. Every must-have is verifiable through code inspection, unit tests (real fixtures, `toSQL()` assertions against a real drizzle query builder), typecheck, and lint. No visual, real-time, or external-service behavior was introduced that a grep/test suite cannot cover; the UI component was verified structurally (loading/error/empty states, http(s)-only link, requireUser-only userId) rather than by rendering it, which is sufficient given the plan's own `<verify>` blocks specify only automated checks (vitest/tsc/lint/grep) with no `<human-check>` blocks anywhere in the PLAN.md.

### Gaps Summary

No gaps found. All 8 must-have truths verified against actual code (not SUMMARY claims), all key links traced and confirmed wired, all listed artifacts exist and are substantive (no stubs), the full test suite (970 tests) passes, typecheck and lint are clean, and the migration is generated but confirmed not applied. The mandatory SUMMARY disclosure for reconcile.test.ts case (j) was independently confirmed: since the observed outcome is `review(rescue_needs_review)`, and the code's `rescue_without_amount` gate only fires when both `boostPercent` and `bonusAmount` are null, the non-null-boostPercent claim in the SUMMARY is provable by construction from the test's own assertions.

---

_Verified: 2026-09-28T17:00:00Z_
_Verifier: Claude (gsd-verifier)_
