---
phase: 03-promo-scraping-review
reviewed: 2026-09-27T21:58:11Z
depth: standard
files_reviewed: 80
files_reviewed_list:
  - .github/workflows/scrape-promos.yml
  - drizzle/0004_promos_scrape_runs.sql
  - drizzle/0005_promo_scope.sql
  - scripts/promo-match-report.ts
  - scripts/promos-check.ts
  - scripts/scrape-promos.ts
  - src/app/actions/confirm-promo-match.ts
  - src/app/actions/correct-promo-match.ts
  - src/app/actions/dismiss-promo.ts
  - src/app/actions/enter-promo-caps.ts
  - src/app/actions/flag-promo-match.ts
  - src/app/actions/get-promos.test.ts
  - src/app/actions/get-promos.ts
  - src/app/actions/promo-review.test.ts
  - src/components/AppShell.tsx
  - src/components/promos/DismissPromoDialog.tsx
  - src/components/promos/FlagMatchButton.tsx
  - src/components/promos/PromoDetails.tsx
  - src/components/promos/PromoRow.tsx
  - src/components/promos/PromosEmptyState.tsx
  - src/components/promos/PromosScreen.tsx
  - src/components/promos/QueueItemCard.tsx
  - src/components/promos/ReviewQueueSection.tsx
  - src/components/promos/scrapeAge.test.ts
  - src/components/promos/scrapeAge.ts
  - src/components/promos/ScrapeStatusPanel.tsx
  - src/components/promos/UnprofitablePromoRow.tsx
  - src/config/scrapeTargets.ts
  - src/db/promoReview.ts
  - src/db/promos.ts
  - src/db/schema.ts
  - src/domain/hedge/bonusBet.test.ts
  - src/domain/hedge/bonusBet.ts
  - src/domain/hedge/profitBoost.test.ts
  - src/domain/hedge/profitBoost.ts
  - src/domain/promos/aliases.test.ts
  - src/domain/promos/aliases.ts
  - src/domain/promos/correctionOptions.test.ts
  - src/domain/promos/correctionOptions.ts
  - src/domain/promos/dedupe.test.ts
  - src/domain/promos/dedupe.ts
  - src/domain/promos/describe.test.ts
  - src/domain/promos/describe.ts
  - src/domain/promos/dto.ts
  - src/domain/promos/etTime.test.ts
  - src/domain/promos/etTime.ts
  - src/domain/promos/lifecycle.test.ts
  - src/domain/promos/lifecycle.ts
  - src/domain/promos/matcher.test.ts
  - src/domain/promos/matcher.ts
  - src/domain/promos/promosInput.ts
  - src/domain/promos/rankPromoHedges.test.ts
  - src/domain/promos/rankPromoHedges.ts
  - src/domain/promos/reviewInput.ts
  - src/domain/promos/scope.test.ts
  - src/domain/promos/scope.ts
  - src/domain/promos/scraped.test.ts
  - src/domain/promos/scraped.ts
  - src/domain/promos/selection.test.ts
  - src/domain/promos/selection.ts
  - src/domain/promos/types.ts
  - src/ingestion/promos/books/ballybet.test.ts
  - src/ingestion/promos/books/ballybet.ts
  - src/ingestion/promos/books/draftkings.test.ts
  - src/ingestion/promos/books/draftkings.ts
  - src/ingestion/promos/books/fanduel.test.ts
  - src/ingestion/promos/books/fanduel.ts
  - src/ingestion/promos/books/index.ts
  - src/ingestion/promos/boundary.test.ts
  - src/ingestion/promos/exclusions.test.ts
  - src/ingestion/promos/exclusions.ts
  - src/ingestion/promos/fetchPage.ts
  - src/ingestion/promos/finePrint.test.ts
  - src/ingestion/promos/finePrint.ts
  - src/ingestion/promos/promoText.test.ts
  - src/ingestion/promos/promoText.ts
  - src/ingestion/promos/run.test.ts
  - src/ingestion/promos/run.ts
  - src/ingestion/promos/sportHints.ts
  - src/ingestion/promos/store.ts
findings:
  critical: 5
  warning: 12
  info: 6
  total: 23
status: issues_found
---

# Phase 03: Code Review Report

**Reviewed:** 2026-09-27T21:58:11Z
**Depth:** standard
**Files Reviewed:** 80
**Status:** issues_found

## Narrative Findings (AI reviewer)

## Summary

I reviewed every file on the list. I read the non-test source in full and checked the test files only for reliability problems. The hedge solvers themselves hold up: `profitBoost.ts` and `bonusBet.ts` use decimal.js throughout, floor payouts to cents, handle the cap kink points correctly and apply the guaranteed-profit > 0 filter. Authorization is also consistent: every server action calls `requireUser()` first and then runs a Zod `safeParse`. Member review writes are conditional UPDATEs.

The serious defects are in the **promo lifecycle state machine that sits between the scraper and member review** (`lifecycle.ts` and `store.ts`):

- **Active rows lose their caps.** The scraper's "touch" path copies freshly parsed caps, including nulls, onto rows that are already active or queued for cap review, and never re-checks their status. A live boost can silently lose its min-odds or max-winnings cap and still be ranked. That is a real-money bug.
- **Flagged promos come back automatically.** The expired → re-scraped path ignores `auto_match_blocked`, so a promo a member flagged as wrong can reactivate on its own.
- **Member-entered caps are overwritten.** When an auto-matched promo expires and is scraped again, the caps a member typed in are replaced with the scraper's values.
- **Scraper writes are not race-safe.** The scraper reads a row's state, decides what to do, and then writes with only `WHERE id = ?`. A dismissal, confirmation or cap entry that lands between the read and the write gets overwritten.
- **Boosts can activate with no max stake.** Combined with the touch-path bug, the cap-entry flow can activate a boost that has no max stake at all.

The remaining findings are parser heuristics that can mis-read caps or wrongly exclude promos, a dead-end cap-entry path for max winnings, missing promo-book filtering on the feed, and some robustness gaps.

## Critical Issues

### CR-01: The "touch" path overwrites caps on active rows without re-checking their status, so live boosts can lose min-odds or max-winnings caps

**File:** `src/ingestion/promos/store.ts:265-282` (with `structuredCapColumns` at `55-71`; decision at `src/domain/promos/lifecycle.ts:122-128`)
**Issue:** `decideScrapedWrite` returns `touch` for every `active` row and every `pending_review/caps` row. Unless the row is cap-locked, `store.ts` then writes `{ parsed, ...structuredCapColumns(parsed) }`. That copies `maxStake`, `maxWinnings`, `maxWinningsKind`, `minOddsAmerican` and `unparsedCapFields` straight from the new parse, including `null` for any field that parsed as "unparsed". `status` is never re-derived.

Concrete failure: a DraftKings or Bally boost is auto-matched and active with `minOddsAmerican = -200`. On a later scrape the min-odds sentence changes wording, so `parseMinOdds` returns `unparsed`. The row stays `active` with `min_odds_american = NULL` and `unparsed_cap_fields = ['minOdds']`. `rankPromoHedges.passesBaseMinOdds` then lets through selections below the book's real minimum, the boost is never applied, and the hedge is unbalanced. The same happens with `maxWinnings`: `winningsCap` becomes null, so the solver stakes the full `maxStake` and overstates the promo payout.

A transient Bally detail-fetch failure takes the list-fallback path, which sets `maxStake = null`. That nulls `max_stake` on an active row: the promo silently drops out of both the feed and the review queue until a later scrape happens to restore it.
**Fix:** Never let a touch downgrade a known cap. Either (a) only refresh `lastSeenAt`/`expiresAt`/`parsed` on touch and leave cap columns alone, or (b) re-run `statusAfterMatch` on the merged caps and move the row back to `pending_review/caps` when a required field became unparsed:
```ts
// touch, not cap-locked
const after = statusAfterMatch({ promoType: parsed.promoType, maxStake: parsed.maxStake,
  bonusAmount: parsed.bonusAmount, unparsedCapFields: parsed.unparsedCapFields });
set({ lastSeenAt: now, parsed, ...structuredCapColumns(parsed),
      unparsedCapFields: after.unparsedCapFields,
      ...(existingRow.status === "active" && after.status !== "active"
          ? { status: after.status, reviewReason: after.reviewReason } : {}) })
```
Add a lifecycle test covering "active row re-scraped with minOdds now unparsed".

### CR-02: A flagged promo (`auto_match_blocked`) is auto-reactivated after it expires and is scraped again

**File:** `src/domain/promos/lifecycle.ts:137-157`, `src/ingestion/promos/store.ts:334-351`, `src/ingestion/promos/store.ts:380-386`
**Issue:** `applyFlag` moves the row to `pending_review/match` with `auto_match_blocked = true` and nulls every scope column. `expireMissingPromos` expires `pending_review` rows too. When the promo reappears, `decideScrapedWrite` takes the `expired` branch. `humanScope` is null (flagged rows were auto-matched, so there is no confirm/correct attribution, and their scope columns were cleared), so it calls `writeForMatch(...)` without ever checking `existing.autoMatchBlocked`. If the matcher reproduces the same (wrong) match, the row goes straight back to `status='active', auto_matched=true`. That contradicts the promise in `flag-promo-match.ts`/`promoReview.ts` that a flag "permanently refuses to auto-reactivate this row on any later scrape".
**Fix:** Respect the block in the expired branch:
```ts
if (existing.status === "expired") {
  if (existing.humanScope !== null) { /* D-19 revival as today */ }
  if (existing.autoMatchBlocked) {
    return { kind: "write", status: "pending_review", reviewReason: "match", autoMatched: false,
             scope: null, pinned: null, bestGuess: match.status === "matched" ? match.scope : match.guess,
             unparsedCapFields: [...parsed.unparsedCapFields] };
  }
  return writeForMatch(...);
}
```

### CR-03: Member-entered caps are overwritten when an auto-matched promo expires and reappears

**File:** `src/ingestion/promos/store.ts:334-351`, `src/domain/promos/lifecycle.ts:137-157`
**Issue:** Sequence: an auto-matched boost goes to `pending_review/caps`, a member enters `maxStake` (`cap_entered_by_user_id` is set, status becomes active), then the promo misses one scrape and is expired, then it reappears. `humanScope` is null (no confirm/correct, only a cap entry), so `writeForMatch(parsed.maxStake=null, ...)` returns `pending_review/caps`, and the non-revival write branch applies `...structuredCapColumns(parsed)`. That overwrites the member's `max_stake`/`max_winnings`/`min_odds_american` with the scraper's nulls. `capEnteredByUserId` is not consulted on this path at all, although the touch path does check it. This breaks the "never overwrite member-entered caps" invariant.
**Fix:** In the write branch, when `existingRow.capEnteredByUserId !== null`, keep the row's cap columns and compute status from them. For example, pass the existing caps into `decideScrapedWrite` (like the humanScope revival does) and omit `structuredCapColumns` from the SET:
```ts
const capLocked = existingRow.capEnteredByUserId !== null;
.set({ ...decisionColumns, ...(capLocked ? {} : { parsed, ...structuredCapColumns(parsed) }), lastSeenAt: now })
```
and in `lifecycle.ts` evaluate `statusAfterMatch` against the existing caps whenever caps are human-entered.

### CR-04: The cap-review queue can activate a profit boost with `max_stake = NULL`

**File:** `src/ingestion/promos/store.ts:275-276`, `src/app/actions/enter-promo-caps.ts:64-94`, `src/components/promos/QueueItemCard.tsx:353-378`
**Issue:** On insert, `statusAfterMatch` adds `maxStake` to `unparsedCapFields` when a boost's max stake is merely *absent* (not "unparsed"); FanDuel/DK/Bally only push `maxStake` when a max-wager mention exists. On the next scrape, the `pending_review/caps` row is touched and `unparsedCapFields` is overwritten with `parsed.unparsedCapFields` (`[]`). The queue card then renders zero inputs. "Save & activate" is enabled because `[].some(...)` is `false`. `enterPromoCaps` finds no missing fields, passes `row.maxStake` (null) through, and `applyCapEntry` sets `status='active'` plus `cap_entered_by_user_id`. The result is an active boost with no max stake: it is never ranked (`evaluatePromo` returns null), never re-queued, and cap-locked against future scrape repair.
**Fix:** (1) Apply the CR-01 fix so touch recomputes `unparsedCapFields` via `statusAfterMatch`. (2) Add defense-in-depth in `enterPromoCaps`:
```ts
const required = new Set(statusAfterMatch({ promoType: row.promoType, maxStake: row.maxStake,
  bonusAmount: row.bonusAmount, unparsedCapFields: row.unparsedCapFields }).unparsedCapFields);
// require every field in `required`, not just row.unparsedCapFields
if (row.promoType === "profit_boost" && normalizedMaxStake === null) return { status: "invalid", fieldErrors: { maxStake: ["Enter the max stake."] } };
```
Also have `applyCapEntry` refuse `maxStake IS NULL` for a profit_boost in its WHERE clause.

### CR-05: Scraper writes are not conditional, so a concurrent dismiss, confirm or cap entry can be silently undone

**File:** `src/ingestion/promos/store.ts:219-362`
**Issue:** `upsertScrapedPromos` SELECTs existing rows, computes decisions in JS, and later runs `db.batch([...update(promos).where(eq(promos.id, id))])`. None of the UPDATEs re-assert the state the decision was based on. Any member action between the SELECT and the batch is overwritten:
- A `dismissPromo` on a `pending_review/match` row is followed by a scraper "write" that sets `status='active'` or `'pending_review'`. The dismissed promo is resurrected, with `dismissed_by_user_id` still set.
- A `confirmPromoMatch`/`correctPromoMatch` is followed by a scraper write that replaces the human scope with the auto-match result (or nulls it).
- An `enterPromoCaps` is followed by a non-cap-locked touch that nulls the member's caps (same outcome as CR-01).

`promoReview.ts` is careful to use conditional UPDATEs precisely for this reason (T-03-07-03), but the scraper side undermines it. The window is small, but the outcome is silent loss of member decisions.
**Fix:** Add optimistic-concurrency predicates matching the observed state to every scraper UPDATE:
```ts
.where(and(eq(promos.id, existingRow.id),
           eq(promos.status, existingRow.status),
           existingRow.reviewReason === null ? isNull(promos.reviewReason) : eq(promos.reviewReason, existingRow.reviewReason),
           existingRow.capEnteredByUserId === null ? isNull(promos.capEnteredByUserId) : sql`true`))
```
Rows that no longer match are simply skipped until the next run.

## Warnings

### WR-01: A promo with an unparsed max-winnings cap can never be activated, only dismissed

**File:** `src/ingestion/promos/store.ts:62-63`, `src/app/actions/enter-promo-caps.ts:74-79`
**Issue:** `maxWinningsKind` is stored as `parsed.maxWinnings?.kind ?? null`. When `parseMaxWinnings` returns `unparsed`, `parsed.maxWinnings` is null, so the kind is null. `enterPromoCaps` requires `maxWinnings` whenever it is in `unparsedCapFields`, but then rejects it whenever `row.maxWinningsKind === null`. Every such promo is therefore a dead end ("Dismiss this promo instead"), and dismissal is permanent. The `QueueRow` doc comment says the kind is "set independently of whether maxWinnings itself parsed"; the store does not do that.
**Fix:** Have scrapers emit a per-book `maxWinningsKind` (from recon) independently of the amount. For example, add `winningsCapKind: WinningsCapKind | null` to `ScrapedPromo` and store it even when the amount is unparsed.

### WR-02: D-19 human-scope revival keeps a stale `expires_at` and `parsed` payload

**File:** `src/ingestion/promos/store.ts:311-332`
**Issue:** The expired-human-revival UPDATE sets status, scope and `lastSeenAt` but not `expiresAt` or `parsed`. If the book extended the promo, which is the likely reason it reappeared, the row keeps the old `expires_at`. `getActivePromos` (`or(isNull(expiresAt), gt(expiresAt, now))`) then hides it even though it is `active`, and it is not in the review queue either. The same applies to a human `event` scope whose game has already started: the promo is "active" but invisible.
**Fix:** Refresh `expiresAt: parsed.expiresAt ? new Date(parsed.expiresAt) : null` (and `parsed`) on revival. If `humanScope` is an event whose `commenceTime <= now`, send the row to `pending_review/match` instead of reviving it.

### WR-03: A successful fetch with zero kept candidates expires every live promo for the book, and upsert plus expire are not atomic

**File:** `src/ingestion/promos/run.ts:192-229`, `src/ingestion/promos/store.ts:373-388`
**Issue:** The "failed" guard is `parseResult.found === 0`, but expiry keys off `writes`. If a parser or schema regression makes every entry `schema_invalid`/`unrecognized` (found > 0, candidates = 0), `expireMissingPromos(bookKey, [])` expires **all** active and pending rows for the book, including human-confirmed, cap-entered and flagged ones. That then feeds CR-02 and CR-03 on the next good run. Separately, `upsertScrapedPromos` and `expireMissingPromos` run as two separate transactions, so a failure between them leaves partial state.
**Fix:** Treat `writes.length === 0 && parseResult.found > 0` as a failed run (or at least skip expiry), and consider a proportional guard such as "refuse to expire more than N% of live rows in one run". Put the expire UPDATE in the same `db.batch` as the upserts.

### WR-04: `parseMaxStake`/`parseMaxWinnings` take the first dollar amount on the line, not the one next to "max"

**File:** `src/ingestion/promos/finePrint.ts:45-46, 75-81, 100-106`
**Issue:** A line only needs "max" and "bet/wager/stake" anywhere in it, and then `MAX_STAKE_AMOUNT_RE.exec(line)` returns the first `$` figure. Text like "Get $100 in Bonus Bets. Max wager $25." on one line (DK's `additionalDetail`/terms are often a single line) yields `maxStake = "100.00"`. The solver then stakes $100 when only $25 is boosted, so the hedge is oversized and the promo leg loses. The same weakness applies to max winnings.
**Fix:** Anchor the amount to the keyword. For example, split on sentence boundaries first, then match `/\bmax(?:imum)?\b[^$.]{0,40}\$\s*([\d,]+(?:\.\d{1,2})?)|\$\s*([\d,]+(?:\.\d{1,2})?)\s*(?:max(?:imum)?\s+)?(?:wager|bet|stake)/i`. If more than one distinct amount qualifies, return `unparsed` rather than guessing.

### WR-05: Exclusion regexes run over full terms text and can wrongly drop legitimate promos

**File:** `src/ingestion/promos/exclusions.ts:40-42, 76-77, 14`
**Issue:** `OUTRIGHT_RE` includes a bare `\b(?:the\s+)?open\b` and `FUTURES_RE` includes `\bto win the\b`/`\bchampion\b`. Both are tested against `combined` (title plus full description/terms). Ordinary copy such as "offer open to Colorado customers", "Bet on the Broncos to win the game" or "Championship Sunday" classifies a real single-game boost as `outright`/`futures`. It is silently skipped and, via expiry, removed. `NEW_CUSTOMER_TEXT_RE`'s `\bsign[- ]up\b` has the same risk on generic terms.
**Fix:** Test outright/futures/prop patterns against the title (plus the eligible-bet-type line) only, and tighten `open` to named tournaments (`/\b(?:us|british|french|australian) open\b/i`) or drop it.

### WR-06: A pinned boost with no live promo-book quote skips the base min-odds check

**File:** `src/domain/promos/rankPromoHedges.ts:124-127, 146`
**Issue:** `passesBaseMinOdds` returns `true` when `promoBookQuote` is null. For a pinned boost, `baseOddsAmerican` then falls back to `promo.baseOddsAmerican`, but the min-odds rule is never applied to that known base price. Only the weaker boosted-price check inside `calculateProfitBoostHedgeUnfiltered` runs. A published boost whose base is below the minimum is shown as profitable.
**Fix:**
```ts
const baseForMinOdds = promoBookQuote?.oddsAmerican ?? (promo.pinned ? promo.baseOddsAmerican : null);
if (promo.minOddsAmerican !== null && baseForMinOdds !== null &&
    americanToDecimal(baseForMinOdds).lt(americanToDecimal(promo.minOddsAmerican))) return null;
```

### WR-07: The promo feed is not filtered to the promo's own book

**File:** `src/app/actions/get-promos.ts:113-139`
**Issue:** `userBookSet` only restricts *hedge* books. Every active promo is ranked and shown regardless of whether the member has an account at `promo.bookKey`. A member without FanDuel still sees FanDuel boost rows with stakes. PROJECT.md says users "filter it to the books they have".
**Fix:** `const visiblePromos = activePromos.filter((p) => userBookSet.has(p.bookKey));` before ranking, or explicitly label promo-book availability if showing them is intended.

### WR-08: `fetchRequest` buffers the whole response before checking size, and follows redirects to any host

**File:** `src/ingestion/promos/fetchPage.ts:36-61`
**Issue:** `await response.text()` reads the entire body into memory and only then compares against `MAX_RESPONSE_CHARS`, so the cap does not bound memory or time on a hostile or huge response. `redirect: "follow"` also lets a compromised or misconfigured endpoint bounce the request (with the spec's headers) to an arbitrary host.
**Fix:** Check `content-length` first, then stream through `response.body.getReader()` and abort once the cap is exceeded. Use `redirect: "manual"` (or verify `response.url`'s host matches `new URL(req.url).host`).

### WR-09: One failed odds-cache read fails every remaining book in the run

**File:** `src/ingestion/promos/run.ts:99-105, 219`
**Issue:** `getMatchEventsOnce` memoizes the promise even when it rejects. A single transient Neon error on the first successful book makes every later book's `await getMatchEventsOnce()` rethrow, so all books are recorded as failed. That defeats the per-book isolation D-08 promises.
**Fix:** Reset on failure: `eventsPromise = loadEventsFn().catch((e) => { eventsPromise = null; throw e; });`

### WR-10: A thrown `getPromos` leaves the Promos tab blank with no error shown

**File:** `src/components/promos/PromosScreen.tsx:38-45`
**Issue:** `startTransition(async () => { const result = await getPromos(...) })` has no try/catch. A DB or network error becomes an unhandled rejection: `response` stays `null` (or stale) and the skeleton disappears when `isPending` flips, leaving an empty tab. After a failed refresh the user may keep acting on stale rows with no indication.
**Fix:** Wrap the call in try/catch, store an `error` state, and render an inline alert with a retry button. Clear stale `rows` on error.

### WR-11: Scrapers send spoofed desktop-Chrome User-Agent and Referer headers

**File:** `src/ingestion/promos/books/ballybet.ts:41-43, 56`, `src/ingestion/promos/books/draftkings.ts:61-63`, `src/ingestion/promos/books/fanduel.ts:51-53`
**Issue:** Each request impersonates a desktop Chrome browser (a fixed `Chrome/128`/`131` UA) coming from the book's own site (`referer`). This is a form of bot-evasion header forging, which the project rules (D-09: "never ... forge anti-bot headers") and the phase priorities rule out. The boundary test only greps for `cookie`/`x-px-context`, so it cannot catch this.
**Fix:** Send an honest UA (e.g. `PromoProfit-scraper/1.0 (+contact)`) and drop the spoofed `referer`, or record an explicit owner decision accepting this in 03-RECON.md/CONTEXT. Extend `boundary.test.ts` to flag browser-UA strings in `books/*.ts`.

### WR-12: Date parsing accepts impossible calendar dates, which roll over silently

**File:** `src/domain/promos/etTime.ts:66-90, 100-104`; `src/domain/promos/reviewInput.ts:72`
**Issue:** `etDayBounds("2026-02-31")` and `parseDateOnly("13/45/2026")` pass the regexes, and `Date.UTC` silently normalizes them (Feb 31 becomes Mar 3). `correctPromoMatch` accepts `etDate` from the client, so a crafted or buggy value writes a sport_window for an unintended day. Scraped dates with the same issue produce wrong windows instead of `unparsed`/null.
**Fix:** After computing, round-trip validate: `const d = new Date(Date.UTC(y, m-1, day)); if (d.getUTCFullYear()!==y || d.getUTCMonth()!==m-1 || d.getUTCDate()!==day) return null;`. Also bound `correctPromoMatch`'s etDate to the correction window (now … now+7d).

## Info

### IN-01: FanDuel has dead code and an unused regex result

**File:** `src/ingestion/promos/books/fanduel.ts:246, 263-272`
**Issue:** `void ANY_WAGER_RE.test(text)` does nothing, and `eligibleMarketTypesFor` ignores its argument.
**Fix:** Remove the regex and inline `[...PROMO_MARKET_TYPES]`, or actually restrict market types when the text names one.

### IN-02: The boundary test misses multi-line and relative imports

**File:** `src/ingestion/promos/boundary.test.ts:37-43`
**Issue:** Only lines starting with `import` are checked. A multi-line `import {\n x\n} from "@/ingestion/promos/..."` or a relative `../../ingestion/promos` import evades the guard.
**Fix:** Run the regex on the whole file text against `from\s+["'][^"']*(ingestion\/promos|playwright|puppeteer|cheerio)`.

### IN-03: The scrape-age label can show negative minutes

**File:** `src/components/promos/scrapeAge.ts:33-34`
**Issue:** Client clock skew produces "-2 min ago".
**Fix:** `Math.max(0, minutes)`.

### IN-04: The min-odds input is parsed leniently and rejects the app's own minus sign

**File:** `src/components/promos/QueueItemCard.tsx:166-169`
**Issue:** `Number.parseInt("-200abc")` returns -200, which is silently accepted. "−200" (U+2212, the minus sign the app itself displays via `formatAmerican`) returns NaN, the field is dropped, and the server replies "Enter the min odds." Similarly, the "$0.00" placeholder suggests typing `$`, which the server rejects.
**Fix:** Normalize U+2212 to `-`, validate with `/^[+-]?\d+$/` client-side, and strip a leading `$` before sending money fields.

### IN-05: Workflow actions are not SHA-pinned and depend on the new `timezone` schedule key

**File:** `.github/workflows/scrape-promos.yml:17-18, 33-34`
**Issue:** `actions/checkout@v4`/`setup-node@v4` are tag-pinned while `DATABASE_URL` (a production DB write credential) is in scope for the job. If the `timezone` key is rejected, the whole schedule stops silently.
**Fix:** Pin actions to commit SHAs. After the first scheduled run, verify it triggered (or add a failure notification).

### IN-06: `expireMissingPromos` ignores its `now` parameter and records no expiry timestamp

**File:** `src/ingestion/promos/store.ts:378`
**Issue:** `void now;` leaves no audit trail of when a row was expired, which makes debugging CR-02/CR-03/WR-03 hard.
**Fix:** Add an `expired_at` column (or reuse `reviewed_at`), or drop the parameter.

---

_Reviewed: 2026-09-27T21:58:11Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
