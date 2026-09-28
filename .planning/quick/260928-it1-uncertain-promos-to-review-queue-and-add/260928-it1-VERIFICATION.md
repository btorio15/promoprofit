---
phase: quick-260928-it1
verified: 2026-09-28T14:45:00Z
status: human_needed
score: 11/11 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open the Promos tab review queue with a live 'classify' row (e.g. seed a pending_review/classify promo) and visually confirm the 'Needs a look' card"
    expected: "Card shows book — title, the 'Needs a look' muted line, the raw-text excerpt, a 'View on {book}' link (only when sourceUrl is present) opening in a new tab, an 'Expires {date}' line when set, and three actions: 'It's a profit boost', 'It's a bonus bet', Dismiss. Clicking a type button opens the matching sub-panel prefilled from classify.suggested; Save posts and refreshes the queue; Cancel closes the panel without saving."
    why_human: "src/components/promos/ClassifyQueueCard.tsx has no automated component/DOM test (the whole codebase has zero .test.tsx files — this is a pre-existing project convention, not a gap introduced by this task), so its actual rendered layout, sub-panel toggle behavior and click wiring are verified here only by static code reading, not by execution in a browser/DOM."
---

# Quick Task 260928-it1: Uncertain Promos to Review Queue, and NHL Support — Verification Report

**Phase Goal:** Stop the promo scraper from silently dropping uncertain promos; uncertain entries become "classify" review-queue items a member can dismiss or turn into a real profit boost/bonus bet; keep CR-04 and existing auth checks; keep clear skips skipped; classify items must never fail the job; add NHL support (DK NHL fixture 1125873 parses with max stake 25.00).

**Verified:** 2026-09-28T14:45:00Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | DK 2026-09-28 fixture entry 1125873 parses as a normal profit_boost candidate: sportKeyHint icehockey_nhl, boostPercent "50.00", maxStake "25.00", minOddsAmerican -200, not a skip | ✓ VERIFIED | `src/ingestion/promos/books/draftkings.test.ts:355-373` asserts this against the real fixture; `npx vitest run` passes (test executed live, not just claimed) |
| 2 | A skipped entry with reason unrecognized/unsupported_sport/schema_invalid becomes a pending_review/classify row carrying evidence (book, title, raw text, source url, external id, expiry, partial fields) | ✓ VERIFIED | `src/ingestion/promos/reviewTriage.ts` `isReviewWorthySkip`/`buildClassifyDraft`; `reviewTriage.test.ts` (27/27 passing) exercises real fixtures; `src/domain/promos/scraped.ts` SkipEvidence interface wired into all 3 parsers |
| 3 | A not_a_promo skip becomes "classify" only when classifyExclusion is null AND a concrete numeric offer is named; every fixture not_a_promo (incl. Bally "Profit Boost"/"Odds Boost"/"Second Chance Bet") stays a plain skip | ✓ VERIFIED | `reviewTriage.ts:82-92` implements exactly this rule; fixture-set assertions in `reviewTriage.test.ts` confirm only Bally WNBA + FanDuel soccer are review-worthy across all real fixtures |
| 4 | Clear skip reasons (new_customer, deposit, parlay, sgp, futures, outright, prop, live_only, not_half_point) and clear not_a_promo never create a review row | ✓ VERIFIED | `CLEAR_SKIP_REASONS` set + early `false` return in `isReviewWorthySkip`; covered by table-driven tests |
| 5 | A dismissed classify row is never re-queued while its dedupe key (content) is unchanged; re-runs never duplicate | ✓ VERIFIED | `decideClassifyWrite` (`src/domain/promos/lifecycle.ts:343-393`) returns `{kind:"skip"}` for any `existing.status === "dismissed"`, matched by unchanged `promoDedupeKey`; `promoDedupeKey` (`src/domain/promos/dedupe.ts`) is content-derived (externalId or normalized rawText + money/price fields), so unchanged content -> same key -> same dismissed row -> skip. Content change -> new key -> new row, never a "revival" of the dismissed one. Unit-tested in `lifecycle.test.ts:422-425` |
| 6 | A book with found > 0 is "ok" regardless of skip reasons; "failed" only on no-scraper/fetch-failure/parse-throw/uncaught-exception/zero-found; scrapeExitCode is 1 only when some book failed | ✓ VERIFIED | `src/ingestion/promos/run.ts:236-268` (only `found===0` is failed) and `scrapeExitCode` (`run.ts:396-398`); `run.test.ts` scenarios (a)-(g) and exit-code tests pass |
| 7 | Each BookRunOutcome carries sentToReview and the job log prints it | ✓ VERIFIED | `BookRunOutcome.sentToReview` field (`run.ts:38`), set on every path; `scripts/scrape-promos.ts` prints the per-book/summary line (confirmed by reading the script) |
| 8 | The review queue shows a "Needs a look" card for classify items with book, title, excerpt, source link (http/https only), expiry, and Dismiss / It's a profit boost / It's a bonus bet actions | ✓ VERIFIED (code); see human verification | `src/components/promos/ClassifyQueueCard.tsx` implements every element; `src/app/actions/get-promos.ts:298-325` (`safeHttpUrl`, `buildClassifyExcerpt`) and `ReviewQueueSection.tsx` wiring confirmed; no automated DOM-level test exists (see Human Verification) |
| 9 | Saving a classify card: scope + every required cap -> active; boost with no max stake -> pending_review/caps (CR-04); no game/day chosen -> pending_review/match | ✓ VERIFIED | `classify-promo.ts:112-120` (`next` derivation via `statusAfterMatch`), `promo-review.test.ts:1150-1199` ("active, maxStake normalized" and "CR-04 ... routes to pending_review/caps, never active" tests), both passing live |
| 10 | icehockey_nhl is in SPORTS with tieRisk false; NHL text/tags resolve to it; NHL team names resolve in TEAM_ALIASES | ✓ VERIFIED | `grep -n "icehockey_nhl" src/config/sports.ts src/ingestion/promos/sportHints.ts src/domain/promos/aliases.ts` hits all three (32-team NHL alias table counted directly); `sportHints.ts:42,75` |
| 11 | A book where the whole parse produces only review items does NOT expire that book's live promos | ✓ VERIFIED | `run.ts:272-312`: zero-candidate branch calls `commitScrapedPromos(..., { expireUnseen: false })`; `run.test.ts` scenario (b) asserts `optsArg.expireUnseen === false` directly, test passes live |

**Score:** 11/11 truths verified (plus one item requiring human/browser confirmation — see below)

### Additional Priority Checks (from the verification brief)

| # | Check | Status | Evidence |
|---|-------|--------|----------|
| A | Member-entered classifications are never overwritten by later scrapes | ✓ VERIFIED | After `applyClassification`, the row's status becomes active/caps/match (never "classify" again unless the member chose no scope). `decideClassifyWrite` touches (never rewrites parsed/caps) any existing row whose status is active/caps/match (`lifecycle.ts:356-361`); `decideScrapedWrite`'s `capsEnteredByMember` branch (`lifecycle.ts:187-189`) also only touches. `applyClassification` sets both `correctedByUserId` and `capEnteredByUserId` to the acting member (`src/db/promoReview.ts:521-522`), which is what flags `capsEnteredByMember`/`humanScope` for future scrape decisions. |
| B | classifyPromo takes userId from session only and enforces CR-04 | ✓ VERIFIED | `requireUser()` is the first statement (`classify-promo.ts:32`); `ClassifyPromoInputSchema` (`reviewInput.ts:178-199`) is `.strictObject` with no `userId` field — confirmed by a passing test that an extra `userId` field is rejected (`promo-review.test.ts:1023-1034`). CR-04 enforced twice: `statusAfterMatch` routes a maxStake-less boost to `caps` (never active) in the action, and `applyClassification` independently refuses (`return false`, no write) when `next.status==="active" && promoType==="profit_boost" && maxStake===null` (`src/db/promoReview.ts:490-492`). |
| C | Source links render only for http(s) URLs | ✓ VERIFIED | `safeHttpUrl` (`get-promos.ts:298-306`) parses with `new URL()` and allows only `http:`/`https:` protocols inside try/catch, else null; `ClassifyQueueCard.tsx:149-158` renders the `<a>` only when `classify.sourceUrl` is non-null, with `target="_blank" rel="noopener noreferrer"`. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/ingestion/promos/reviewTriage.ts` | CLEAR_SKIP_REASONS, isReviewWorthySkip, buildClassifyDraft | ✓ VERIFIED | All three exported, substantive, table-driven-tested against real fixtures |
| `src/domain/promos/types.ts` | REVIEW_REASONS with "classify" | ✓ VERIFIED | Confirmed present |
| `src/domain/promos/lifecycle.ts` | decideClassifyWrite + classify branch in decideScrapedWrite | ✓ VERIFIED | Both present, exported, unit-tested |
| `src/app/actions/classify-promo.ts` | classifyPromo server action | ✓ VERIFIED | Exported, wired to UI, exercised by 20+ passing tests |
| `src/components/promos/ClassifyQueueCard.tsx` | "Needs a look" queue card | ✓ VERIFIED (317 lines, exceeds min_lines 120) | Wired into ReviewQueueSection for kind "classify" |
| `src/config/sports.ts` | NHL sport config | ✓ VERIFIED | `icehockey_nhl` present with `tieRisk: false` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `run.ts` | `reviewTriage.ts` | `isReviewWorthySkip` + `buildClassifyDraft` over `parseResult.skipped` | ✓ WIRED | `buildClassifyWrites` (`run.ts:94-108`) calls both |
| `store.ts` | `decideClassifyWrite` | classify writes in the same batch as candidates | ✓ WIRED | `buildUpsertStatements` (`store.ts:433-526`) calls `decideClassifyWrite` per classify write, same `db.batch` |
| `ClassifyQueueCard.tsx` | `classify-promo.ts` | `classifyPromo(...)` on Save | ✓ WIRED | `saveBoost`/`saveBonus` call `classifyPromo(payload)` |
| `promoReview.ts` | `promos.review_reason = 'classify'` | `applyClassification` conditional UPDATE | ✓ WIRED | `eq(promos.reviewReason, "classify")` present in the WHERE clause |

### Behavioral Spot-Checks / Automated Test Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full unit suite | `npx vitest run` | 846/846 passed, 58 files | ✓ PASS |
| Ingestion/domain/actions subset | `npx vitest run src/ingestion/promos src/domain/promos src/app/actions` | 581/581 passed | ✓ PASS |
| reviewTriage + draftkings fixtures | `npx vitest run src/ingestion/promos/reviewTriage.test.ts src/ingestion/promos/books/draftkings.test.ts` | 52/52 passed | ✓ PASS |
| Typecheck | `npx tsc --noEmit` | No output (clean) | ✓ PASS |
| Lint | `npm run lint` | Clean, no output | ✓ PASS |
| NHL/LEGITIMATE_SKIP_REASONS greps from plan's `<verification>` block | `grep` commands | All match expected (hits in 3 files; 0 occurrences of removed constant) | ✓ PASS |
| Debt-marker scan on all created/modified core files | `grep -n TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER\|dangerouslySetInnerHTML` | No hits (only legitimate `placeholder=` input attributes and a comment referencing the dangerouslySetInnerHTML rule) | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| QUICK-260928-it1 | 01 | This quick task's own goal | ✓ SATISFIED | All truths above |
| PROMO-03 | 01 | Promo ingestion/scraping | ✓ SATISFIED | run.ts/store.ts/reviewTriage.ts changes |
| PROMO-04 | 01 | Review queue / member actions | ✓ SATISFIED | classify-promo.ts, promoReview.ts, DTO/UI changes |

### Anti-Patterns Found

None. No TBD/FIXME/XXX/TODO/HACK/PLACEHOLDER markers, no `dangerouslySetInnerHTML`, no stub `return null`/empty-handler patterns found in any created or modified core file.

### Human Verification Required

#### 1. "Needs a look" card visual/interactive check

**Test:** Get a real (or seeded) `pending_review`/`classify` promo row into the Promos tab review queue, open the app, and interact with the card: click "It's a profit boost" and "It's a bonus bet" to toggle sub-panels, verify prefilled values match `classify.suggested`, click a source link (when present) and confirm it opens in a new tab, and Save/Cancel/Dismiss each path.
**Expected:** Card renders exactly per `03-UI-SPEC.md` conventions: book — title line, "Needs a look" muted line, excerpt, optional source link and expiry line, three actions, and each Save produces the correct active/caps/match outcome described in truth #9.
**Why human:** The codebase has zero `.test.tsx`/DOM-level component tests anywhere (a pre-existing project-wide convention, not something this task skipped) — the component's actual rendered behavior in a browser cannot be confirmed by grep/static reading alone, only its source code shape (which matches the spec).

### Gaps Summary

No functional gaps found. Every must-have truth, artifact, and key link specified in the plan's frontmatter and in the verification brief's five priority checks is implemented, wired, and covered by passing automated tests that were re-executed live during this verification (not merely inferred from SUMMARY.md's claims). The only outstanding item is a standard human/browser spot-check of the new UI component's visual rendering and click-through behavior, consistent with this project's existing lack of component-level tests.

---

*Verified: 2026-09-28T14:45:00Z*
*Verifier: Claude (gsd-verifier)*
