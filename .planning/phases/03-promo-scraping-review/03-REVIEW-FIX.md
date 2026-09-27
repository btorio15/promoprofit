---
phase: 03-promo-scraping-review
fixed_at: 2026-09-27T22:32:53Z
review_path: .planning/phases/03-promo-scraping-review/03-REVIEW.md
iteration: 1
findings_in_scope: 17
fixed: 16
skipped: 1
status: partial
---

# Phase 03: Code Review Fix Report

**Fixed at:** 2026-09-27T22:32:53Z
**Source review:** .planning/phases/03-promo-scraping-review/03-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 17 (5 critical, 12 warning; info findings out of scope)
- Fixed: 16
- Skipped: 1 (WR-11, needs an owner decision)

**Verification:** `vitest run` passes 52 files and 676 tests (the baseline was 652; 24 tests were added). `tsc --noEmit` is clean in the main checkout. The isolated worktree shows one error, `LayoutProps`, which is a Next-generated type from `.next/` and exists only because the worktree has no `.next` folder. ESLint is clean on every touched file. The hedge and stake math still uses decimal.js throughout, and no float math was introduced.

**Logic changes that need a human check:** CR-01 through CR-05, WR-02, WR-03 and WR-06 change lifecycle or ranking behaviour. Each has unit tests, but they are marked "fixed: requires human verification" below because the tests prove only the cases they encode.

## Fixed Issues

### CR-01: The "touch" path overwrites caps on active rows without re-checking their status

**Files modified:** `src/domain/promos/lifecycle.ts`, `src/domain/promos/lifecycle.test.ts`, `src/ingestion/promos/store.ts`
**Commit:** b5d97d4
**Status:** fixed: requires human verification
**Applied fix:** Added a new `refresh` decision. When an active row or a `pending_review/caps` row is re-scraped (and its caps were not entered by a member), the fresh caps are written together with a status recomputed by `statusAfterMatch`. If a required cap becomes unparsed or goes missing, an active row now drops back to `pending_review/caps` instead of staying active with a nulled cap. A caps row whose fresh parse has every cap becomes active. Rows with member-entered caps get a `touch` that updates only `lastSeenAt` and `expiresAt`. Added `capsEnteredByMember` to `ExistingPromoState`. Tests cover "active row re-scraped with minOdds now unparsed" and a max stake that is now missing.

### CR-02: A flagged promo is auto-reactivated after it expires and is scraped again

**Files modified:** `src/domain/promos/lifecycle.ts`, `src/domain/promos/lifecycle.test.ts`
**Commit:** e03330a
**Status:** fixed: requires human verification
**Applied fix:** In the expired branch, a row with `autoMatchBlocked` now goes to `pending_review/match` with `autoMatched: false` and no scope. The fresh matcher result is kept only as the best guess.

### CR-03: Member-entered caps are overwritten when an auto-matched promo expires and reappears

**Files modified:** `src/domain/promos/lifecycle.ts`, `src/domain/promos/lifecycle.test.ts`, `src/ingestion/promos/store.ts`
**Commit:** 6b28fa7
**Status:** fixed: requires human verification
**Applied fix:** Write decisions now carry `capsFrom: "parsed" | "existing"`. When a member entered the caps, the status comes from the row's own caps and the store leaves the cap columns alone. D-19 human revival uses `capsFrom: "existing"` as well.

### CR-04: The cap-review queue can activate a profit boost with `max_stake = NULL`

**Files modified:** `src/app/actions/enter-promo-caps.ts`, `src/db/promoReview.ts`, `src/app/actions/promo-review.test.ts`
**Commit:** 2fb61ec
**Status:** fixed: requires human verification
**Applied fix:** This builds on CR-01, which stops the touch path from wiping the field list. `enterPromoCaps` now requires every field that `statusAfterMatch` says the row needs, not just the stored list, and refuses to activate a boost that has no max stake. The queue mapping (`mapPendingPromoRow`) recomputes the field list for caps rows, so the card always shows a max-stake input. `applyCapEntry`'s WHERE clause also refuses `maxStake IS NULL` for a profit_boost.

### CR-05: Scraper writes are not conditional

**Files modified:** `src/ingestion/promos/store.ts`
**Commit:** 98a2176
**Status:** fixed: requires human verification
**Applied fix:** Every scraper UPDATE now uses an optimistic-concurrency WHERE clause (`unchangedSinceRead`) that matches the id plus the observed status, review_reason, auto_match_blocked and the confirmed/corrected/cap-entered/dismissed/flagged user ids. Every member action changes at least one of these, so a member action that lands mid-run wins and the row is looked at again on the next scrape. I chose not to compare `reviewed_at`, because comparing timestamps at millisecond precision could fail forever on a row written with microseconds. The upsert outcome counts are now "attempted" writes.

### WR-01: A promo with an unparsed max-winnings cap can never be activated

**Files modified:** `src/domain/promos/scraped.ts`, `src/domain/promos/scraped.test.ts`, `src/ingestion/promos/store.ts`, `src/ingestion/promos/books/{draftkings,fanduel,ballybet}.ts` and their tests
**Commit:** a3c4fa6
**Status:** fixed
**Applied fix:** Added an optional `winningsCapKind` field to `ScrapedPromo` and its schema. It is optional so that `parsed` payloads already stored in the database still validate. Each scraper sets its per-book kind (`boost_extra`, from recon), and the store saves `maxWinningsKind` even when the amount did not parse. Existing dead-end rows pick up the kind on their next refresh.

### WR-02: D-19 human-scope revival keeps a stale `expires_at` and `parsed` payload

**Files modified:** `src/domain/promos/lifecycle.ts`, `src/domain/promos/lifecycle.test.ts`, `src/ingestion/promos/store.ts`
**Commit:** 8e0c38d
**Status:** fixed: requires human verification
**Applied fix:** `decideScrapedWrite` now takes `now`. A human scope whose game has already started, or whose sport window has already closed, goes to `pending_review/match` instead of being revived. Writes that keep existing caps still refresh `parsed` and `expiresAt`. The separate revival branch in the store was folded into the general write path.

### WR-03: A run with zero kept candidates expires every live promo; upsert and expiry are not atomic

**Files modified:** `src/ingestion/promos/run.ts`, `src/ingestion/promos/run.test.ts`, `src/ingestion/promos/store.ts`
**Commit:** 1604941
**Status:** fixed: requires human verification
**Applied fix:** A run with `found > 0` but zero usable candidates is now recorded as failed ("N promos found but none usable; existing promos kept"), and nothing is written or expired. `PromoStore` now exposes a single `commitScrapedPromos`, which runs the upserts and the expire UPDATE in one `db.batch` transaction and refuses to expire anything when there are no writes. The existing test that asserted the old behaviour ("still ok, expires with an empty seen-key list") was rewritten for the new behaviour. I did not add the optional "refuse to expire more than N% of rows" guard.

### WR-04: `parseMaxStake`/`parseMaxWinnings` take the first dollar amount on the line

**Files modified:** `src/ingestion/promos/finePrint.ts`, `src/ingestion/promos/finePrint.test.ts`
**Commit:** 8edd6e1
**Status:** fixed
**Applied fix:** The amount must now be tied to the "max" keyword in one of three shapes: "max(imum) <kw> ... $X", "max $X <kw>", or "$X max <kw>". The gaps in between cannot cross a `$` or a `.`. If two different amounts qualify, the result is `unparsed` rather than a guess. All real-fixture tests still pass. New tests cover "Get $100 in Bonus Bets. Max wager $25." → 25.00.

### WR-05: Exclusion regexes can wrongly drop legitimate promos

**Files modified:** `src/ingestion/promos/exclusions.ts`, `src/ingestion/promos/exclusions.test.ts`
**Commit:** ba25585
**Status:** fixed
**Applied fix:** A bare `open` no longer matches. Only named tournaments do (US/British/French/Australian Open, "The Open Championship"). `champion` and `to win the` are now checked against the title only, while `futures` and `outright` still check the full text. I tried moving `sign up` to title-only as well, but the real DraftKings and Bally fixtures depend on it in body text to catch acquisition offers, so I kept it as a full-text check.

### WR-06: A pinned boost with no live promo-book quote skips the base min-odds check

**Files modified:** `src/domain/promos/rankPromoHedges.ts`, `src/domain/promos/rankPromoHedges.test.ts`
**Commit:** e75308c
**Status:** fixed: requires human verification
**Applied fix:** `passesBaseMinOdds` now applies the minimum to the live promo-book quote, or to the published `baseOddsAmerican` for a pinned promo when there is no live quote. The new test fails before the fix and passes after it, and includes a check proving the promo is otherwise profitable.

### WR-07: The promo feed is not filtered to the promo's own book

**Files modified:** `src/domain/promos/dto.ts`, `src/app/actions/get-promos.ts`, `src/app/actions/get-promos.test.ts`, `src/components/promos/PromoRow.tsx`, `src/components/promos/UnprofitablePromoRow.tsx`
**Commit:** 8412e40
**Status:** fixed (following the user's final direction, not the reviewer's filter)
**Applied fix:** Promos at books the member does not have stay in the feed, but they are dimmed and sorted after every promo at the member's own books. The server sets a new `hasPromoBook` boolean on both `PromoRowDTO` and `UnprofitablePromoRowDTO`. A stable partition keeps each group in its existing profit order, and the same ordering applies to `unprofitableRows`. Dimmed promo rows use the same muted styling as the unprofitable rows (`bg-secondary/40 opacity-60`) and show a "You don't have this book" hint, which is also added to the row's aria-label. Nothing is filtered out, so the empty states are unchanged. The tests cover the ordering of `rows` (an other-book promo with the highest profit still sorts last, and own-book rows keep profit order), the ordering of `unprofitableRows`, and the flag values.

### WR-08: `fetchRequest` buffers the whole response and follows redirects to any host

**Files modified:** `src/ingestion/promos/fetchPage.ts`
**Commit:** 0c1918a
**Status:** fixed
**Applied fix:** The fetch now uses `redirect: "manual"` and follows at most 3 redirects, only when they stay on the same host and protocol. A redirect to another host is refused. The body is streamed with a 5 MB byte cap: the content-length header is checked first, then streaming stops once the cap is exceeded. I checked this against a local HTTP server (normal response, same-host redirect, cross-host redirect refused, redirect loop, oversized content-length, oversized stream, 404). I did not add a new test file.

### WR-09: One failed odds-cache read fails every remaining book

**Files modified:** `src/ingestion/promos/run.ts`, `src/ingestion/promos/run.test.ts`
**Commit:** 02ee780
**Status:** fixed
**Applied fix:** A rejected events load is no longer cached; the stored promise is cleared on failure so the next book tries again. A new test shows book 1 fails and book 2 succeeds.

### WR-10: A thrown `getPromos` leaves the Promos tab blank

**Files modified:** `src/components/promos/PromosScreen.tsx`
**Commit:** dc3145d
**Status:** fixed
**Applied fix:** Wrapped the call in try/catch, respecting the stale-request guard. On failure the stale rows are cleared and a destructive `Alert` appears with a "Try again" button, following the pattern already used in `OddsStatusBar`.

### WR-12: Date parsing accepts impossible calendar dates

**Files modified:** `src/domain/promos/etTime.ts`, `src/domain/promos/etTime.test.ts`, `src/domain/promos/correctionOptions.ts`, `src/app/actions/correct-promo-match.ts`, `src/app/actions/promo-review.test.ts`
**Commit:** 51a59ca
**Status:** fixed
**Applied fix:** Dates are now round-trip checked in `parseDateOnly` and `etDayBounds`, so Feb 31 or month 13 returns null instead of rolling over. `correctPromoMatch` returns `invalid` for an impossible date or for a day starting more than `DEFAULT_WINDOW_DAYS` (7, now exported from correctionOptions) ahead. The existing test that used `2099-01-01` now uses tomorrow's ET date.

## Skipped Issues

### WR-11: Scrapers send spoofed desktop-Chrome User-Agent and Referer headers

**File:** `src/ingestion/promos/books/ballybet.ts:41-43, 56`, `draftkings.ts:61-63`, `fanduel.ts:51-53`
**Reason:** Needs an owner decision. The recon Scraper Contract in 03-RECON.md lists "a real desktop Chrome User-Agent" and the book's `referer` as required headers for all three endpoints, and the owner signed off on that contract with D-09 = http for each book. D-09's "never forge anti-bot headers" is written about bot-detection tokens such as PerimeterX `x-px-context`. Switching to an honest UA could break all three scrapers, and I can't verify that without calling the live endpoints. The owner should either accept the browser UA/referer explicitly in 03-RECON.md or CONTEXT, or approve a test run with an honest UA.
**Original issue:** Each request impersonates a desktop Chrome browser coming from the book's own site. This is a form of bot-evasion header forging that D-09 and the phase priorities rule out.

---

_Fixed: 2026-09-27T22:32:53Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
