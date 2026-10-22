# Architecture: v1.2 Intro Offers & No-Sweat Integration

**Domain:** Sportsbook promo-hedge app (existing Next.js + Drizzle/Neon + GitHub Actions scrapers)
**Researched:** 2026-10-22 (from reading the codebase; no external sources needed)
**Overall confidence:** HIGH on integration points (read directly from code); MEDIUM on the per-book scraper feasibility (not re-probed here)

## Headline Findings

1. **No enum migration is needed for the new promo type.** `promos.promo_type` is a plain `text` column with no CHECK constraint (schema.ts line 211). `"no_sweat"` only has to be added to `PROMO_TYPES` in `src/domain/promos/types.ts` (the Zod enums in scraped.ts derive from it). One small additive migration (0018) is still wanted for a `refund_kind` column and the new `signup_offers` columns.
2. **Latent bug to fix first:** `evaluateCandidate` in `rankPromoHedges.ts` is `promoType === "profit_boost" ? boost : bonus`. A new type would silently be priced as a bonus bet. Every binary `profit_boost`/`bonus_bet` branch must become an exhaustive switch before `no_sweat` enters the type. Same pattern likely exists in `promoRowDto.ts`, `pairPromos.ts`, `doneSnapshot.ts`, `describe.ts`, `dto.ts`, `lifecycle.ts`, `yourCap.ts`, and the PromoRow/PairCard components (all files that mention `promoType`; grep list in "Touch list" below).
3. **Estimated profit must never reach the guaranteed-profit consumers.** `computeMemberFeed` singles feed `recordMemberFeedObservations`, `recordCurrentProfitObservations`, `buildDashboardTotals`, the profit graph and Statistics. NSB results must be excluded from all of them (or those must filter on `result.kind`). Safest design: NSB is a separate feed source and a separate result kind, never in `singles`.
4. **Book config is already done for odds.** `books.ts` already has `betmgm`, `betrivers`, `espnbet` (theScore), `hardrockbet` as `free` tier with Odds API keys; `williamhill_us` (Caesars) and `fanatics` are `paid_only` (no cached odds, not hedge venues, no promo-side quote). So the "books config" work is scrapers + `SCRAPE_TARGET_BOOK_KEYS` + `BOOK_SCRAPERS` + `SIGNUP_PAGE_URLS`, not Odds API keys. Consequence: Caesars/Fanatics NSB and intro offers cannot be priced exactly (no promo-book odds) -- see Pitfall-ish note in section 7.

## Recommended Architecture (delta only)

```
Scrapers (GH Actions)                       Domain (pure)                         Actions / UI
---------------------                       -------------                         ------------
books/{betmgm,betrivers,...}.ts  -->  ScrapedPromo{promoType:"no_sweat"}
exclusions.ts (no_sweat -> keep) -->  promos table (+refund_kind)  -->  loadMemberFeedContext
promoReading (kind +"no_sweat")                                        |
signupOffers.ts (kind/structure) -->  signup_offers (+cols)            v
                                                          conversionRate.ts (NEW)  <- cached events + member hedge set
                                                          noSweat.ts (NEW)  <- calculateNoSweatHedge(S, Oa, Oh, v, cap)
                                                          rankPromoHedges (result kind "nosweat")
                                                          rankIntroOffers.ts (NEW)
                                                          get-opportunities (new source "nosweat")
                                                          get-signup-offers (ranked, per-member)  -> SignupOffersScreen (rewrite)
```

### Component Boundaries

| Component | Status | Responsibility | Talks to |
|-----------|--------|----------------|----------|
| `src/domain/hedge/noSweat.ts` | NEW | Exact NSB solver (see math below). Returns stakes, win/lose branch nets, estimated profit, floor profit (v=0) | decimal.js, americanOdds |
| `src/domain/hedge/conversionRate.ts` | NEW | `liveConversionRate({bonusBookKey, hedgeBookKeys, events, now, refAmount, precision})` using existing `extractTwoWayMoneylines` + `rankBonusBetHedges(limit 1)`; returns `{rate: Decimal, source: eventId/legs, fetchedAt} | null` | marketFilter, rankBonusBetHedges |
| `src/domain/hedge/rankBonusBetHedges.ts` | UNCHANGED | Reused as-is as the rate oracle | -- |
| `src/domain/promos/types.ts` | MODIFIED | `PROMO_TYPES += "no_sweat"` | everything |
| `src/domain/promos/rankPromoHedges.ts` | MODIFIED | New `evaluateNoSweatCandidate`; result union gains `{kind:"nosweat"}`; exhaustive switch; sort stays on guaranteed profit for boost/bonus only; `RankOptions` gains `conversionRateFor(bookKey)` (injected, keeps module pure) | noSweat, conversionRate |
| `src/domain/promos/pairPromos.ts` | MODIFIED (guard) | Must exclude `no_sweat` from pairing in v1.2 (pairing logic assumes both legs are boost/bonus) | -- |
| `src/domain/promos/memberFeed.ts` | MODIFIED | Return `singles` (guaranteed only), `chosenPairs`, and new `estimated` (NSB list) | rankPromoHedges |
| `src/domain/opportunities/types.ts` | MODIFIED | `SourceId += "nosweat"`; `RankKey.estimated: boolean`; `pctLabel` unchanged; `SOURCE_ORDER`/`SOURCE_META` entry | UI |
| `src/app/actions/get-opportunities.ts` | MODIFIED | Build NSB source from `feed.estimated`; do NOT pass to recorders/dashboard | memberFeed |
| `src/domain/signup/rankIntroOffers.ts` | NEW | Per-member ranking of intro offers at books the member lacks (bet&get and NSB-first-bet) with qualifying line, hedge book, stakes, conversion of bonus | noSweat, bonusBet, conversionRate, marketFilter |
| `src/ingestion/promos/signupOffers.ts` | MODIFIED | Extract `offerKind`, `qualifyingStake`, `bonusTotal`, `installments`, `refundCap`, `minOdds` deterministically (regex + decimal.js; reader never gives money) | exclusions.mentionsNewCustomer |
| `src/db/schema.ts` + migration 0018 | MODIFIED | See schema section | -- |
| `src/ingestion/promos/books/*.ts` x up to 6 | NEW | One `BookScraper` each; register in `books/index.ts`, `SCRAPE_TARGET_BOOK_KEYS`, `SIGNUP_PAGE_URLS` | run.ts unchanged |
| `src/components/signup/SignupOffersScreen.tsx` | REWRITE | Ranked cards, not book groups | get-signup-offers |
| `src/components/opportunities/*` | MODIFIED | New NSB section/row with "Estimated" badge, shows rate used | -- |

## NSB algorithm (exact)

Definitions: stake S at promo book (decimal odds Oa), refund R = min(S, refundCap) delivered as a bonus bet worth v*R (v = live conversion rate, 0..~0.9) or as cash (v = 1, `refund_kind = "cash"`). Hedge H at decimal odds Oh on the opposite side.

- Promo bet wins: net = S(Oa - 1) - H
- Promo bet loses: net = H(Oh - 1) - S + v*R
- Equal profit: S(Oa-1) - H = H(Oh-1) - S + vR  =>  **H = (S*Oa - v*R) / Oh**; profit = S(Oa-1) - H.
- Linear in v, so it follows the same pattern as `bonusBet.ts`: compute H exact, test floor/ceil at cents (or dollars), pick the better `min(netWin, netLose)`, apply the same `clean()` 20dp snapping and LocalDecimal precision 40.
- Return both `estimatedProfit` (with v) and `floorProfit` (the same stakes with v = 0 on the lose branch = what is truly guaranteed). Display estimated as the headline, labelled; floor in small print. This is the cleanest way to keep "estimated vs guaranteed" distinct without a second concept in the ranker.
- Stake choice: S defaults to the promo's cap (`maxStake`) since profit scales with S for positive-EV lines; for a promo with a refund cap < max bet, S = refundCap (staking more only adds unrefunded risk). Guard `S <= refundCap` unless the promo says otherwise.
- Minimum odds (`minOddsAmerican`) reuse `passesBaseMinOdds` unchanged.
- Fixture-test against hand calculations like the existing table-driven tests; add a property test that H equalizes both branches within 1 cent.

## How the live conversion rate is computed per hedge set

The finder's rate is `conversionPct` (profit / bonus) of the best row from `rankBonusBetHedges` for (bonusBookKey = refund's book, hedgeBookKeys = the member's hedge books). It depends on three things: the bonus book, the hedge set, and the cached events. So it is **per member, per book, per request** -- not global.

- Compute lazily in `loadMemberFeedContext` (it already has `moneylineEvents`, `rankOpts.hedgeBookKeys`, `now`): a memoized `conversionRateFor(bookKey)` closure that calls `extractTwoWayMoneylines(events, {now, windowDays: 7, allowedBookKeys: hedgeSet, sportKeys: all})` once and `rankBonusBetHedges(markets, {bonusBookKey, bonusAmount: refAmount, hedgeBookKeys, limit: 1})` once per distinct NSB promo book (at most ~6 per request; cheap, pure, 0 credits).
- Reference amount: use the promo's own refund amount R (conversion % varies slightly with cent rounding and floor-of-payout), not a fixed $100.
- Use the same `precision` as the member's setting so the rate matches what the finder would show.
- **Decision to flag to the owner:** best single row is optimistic (one lopsided market). Recommend using the finder's top-1 as specified ("the finder's live rate"), but also persisting which game produced it so the card can say "valued at 71% (BOS @ NYK)", and clamp v to [0, 1]. If top-1 is on a game that starts before the NSB game's window, it is still valid since the refund bonus is usable later; but if the cached odds are stale (see `priceAge.ts`), propagate the odds age to the NSB card.
- If the refund book has no cached quotes (Caesars, Fanatics: paid_only) the rate is `null` and the NSB promo is not ranked in the feed (show in Promos tab as "can't price: no odds at this book"). Do not substitute a fixed 70%; the owner explicitly rejected a fixed %.
- For intro offers at a book the member lacks, the bonus book is not a user book but is still a quote source, so the same function works as long as the book is API-covered free tier. Hedge set = member's own books.

## Database changes (migration 0018, additive and nullable; safe for the live deploy)

`promos`:
- `refund_kind text null` -- `'bonus_bet' | 'cash'`, only for `promo_type = 'no_sweat'`. Reuse existing columns: `max_stake` = max qualifying stake, `max_winnings`/`bonus_amount` unused, `min_odds_american` reused. Optionally `refund_cap numeric` if the refund cap differs from max stake (many books: "refund up to $X"); recommend adding it, because overloading `max_stake` for both is ambiguous. Store parsed scraper output in existing `parsed jsonb` too.
- No CHECK/enum change. `dedupe.ts` keys must include the type so a no_sweat and bonus_bet from the same book/event don't collide (verify).

`signup_offers` (currently: title, description, raw_text, `bonus_amount`, source_url, expires_at, status):
- `offer_kind text null` -- `'bet_get' | 'no_sweat' | 'other'` (null = legacy row; backfill by re-scrape, the table rewrites each run via upsert + expire).
- `qualifying_stake numeric(10,2) null` -- "Bet $5" / "first bet up to $1,000".
- `bonus_total numeric(10,2) null` -- keep `bonus_amount` as the headline for back-compat; the new column is what ranking uses (for NSB = refund cap).
- `installments jsonb null` -- e.g. `{count:5, each:"50.00", daysApart:1}` for FanDuel/DK-style paid-over-time offers (affects how/when to convert and, for the ranker, whether it can be done with one hedge).
- `min_odds_american int null`, `refund_kind text null`, `requires_win boolean null` (bet&get offers split: pays on bet placed vs. on win; "Bet $5 get $200 if your bet wins" is a different strategy -- classify, rank only the placed-bet variety and mark the rest as informational).
- Keep the table separate from `promos` (existing design decision; boundary test enforces that domain/promos never imports ingestion).
- `signupStore.ts` upsert `set` clause and `SignupOfferInput` must carry every new field; `SignupOfferRow` in `domain/promos/signupOffers.ts` gains them.
- Seed: `books` table already seeded from `COLORADO_BOOKS`; no new rows since all six books exist. Run `scripts/seed.ts` only if displayName/notes change.

## Ingestion changes

- **exclusions.ts**: `classifyExclusion` currently returns `no_sweat` after the new-customer and deposit checks. Keep new-customer precedence (first-bet NSB is a sign-up offer and flows to `signupOffers.ts`). Change the final no-sweat line so existing-customer no-sweat promos are **kept** (return `null`) and the parser sets `promoType: "no_sweat"`. Keep the `no_sweat` `SkipReason` for no-sweat entries that fail (cap unparseable, parlay-only), routing through `reviewTriage` to the classify queue instead of silently dropping. Update `exclusions.test.ts` (it currently asserts the clear skip).
- **Per-book parsers**: DK/FanDuel/Bally parsers decide `promoType` per entry; add a `no_sweat` branch there that also extracts refund cap (`maxStake`) and refund kind. New-customer NSB entries still go to skips -> `signupOffers.ts`.
- **promoReading.ts (reader)**: add `"no_sweat"` to `kind` enum; remove "no-sweat offers" from the `not_usable` list in the prompt and add a rule ("a bet that refunds a losing stake as a Bonus Bet or cash up to a stated maximum -> no_sweat; maxStake = the maximum refunded/qualifying amount, evidence must include the $"). Add `refundKind` field only if needed (or derive deterministically from text: regex "bonus bets?" vs "cash"), preferred -- deterministic so no new guard surface. **Bump `PROMO_READER_PROMPT_VERSION`** (cache key invalidation is intentional). `reconcile.ts` and `verbatimGuard.ts` branch on kind: add `no_sweat` handling (needs maxStake guard-backed; boostPercent/bonusAmount not required). `readerPass.ts`/`reviewTriage.ts` "concrete offer" detection must recognize no-sweat so rescues work.
- **scrapeTargets.ts**: add keys for each new book as feasibility passes (`betmgm`, `fanatics`, `williamhill_us`, `betrivers`, `hardrockbet`, `espnbet`). Existing recon notes: Caesars 403s; Fanatics app-only; Hard Rock domain not found; BetMGM/theScore login/JS-gated; BetRivers only loyalty store. Contract today is `render:"http"`, `stealth:false`, `sourceFormat:"json"` -- any book needing a browser means widening `BookScraper` and the GH Actions job (installs no browser today). **Treat each book as an independent, time-boxed spike**; ship the ones that work, leave the rest on manual add.
- **Manual add path** (`addedPromoInput`, `AddPromoForm`, `buildAddedPromo`): needs a `no_sweat` option (cap, refund kind) -- required, since scraping many books will fail and manual entry is the fallback.
- **signupOffers.ts (ingestion)**: today only extracts `bonusAmount` from the largest "$N bonus" match and excludes referrals. Extend with deterministic extractors for kind (NSB wording: "no sweat", "refunded as bonus bets", "second chance bet"), qualifying stake ("bet $N"), installments, min odds. Money stays regex + decimal.js (T-mgi-03).

## Ranking and feed (estimated vs guaranteed)

- Add result kind `{kind:"nosweat", nsb: NoSweatResult, rateUsed: Decimal}` to `PromoOpportunity.result`. `guaranteedProfitOfOpportunity`/`secondaryRankOf` become exhaustive switches; for `nosweat` they must not be used by the guaranteed sort. Recommended: `rankPromoHedges` ranks only boost/bonus; a new `rankNoSweatPromos` (or a flag param) returns NSB opportunities sorted by estimated profit, so a type error rather than discipline prevents mixing.
- Feed: new `SourceId "nosweat"` ("No-sweat bets (estimated)") rendered as its own section with an "Estimated" badge and "valued at N% conversion" note, `RankKey.estimated = true`. The user-facing sort switch applies within each source, so no cross-contamination. Do not interleave NSB into "Best promos".
- Exclude from: `recordCurrentProfitObservations`, `recordMemberFeedObservations`, `buildDashboardTotals`, profit series, Statistics, `findUnprofitablePromos` (or give it a null best profit). Add a unit test asserting a feed with only NSB promos yields zero recorded profit.
- Mark done: allowed for NSB, but `profit_extracted` is what the member enters/confirms; `doneSnapshot.ts` should store `kind: "nosweat"` and the rate used; verify what `promoTracking` records (if it snapshots computed profit as "extracted" this would count an estimate as realized -- needs checking in the phase).
- Pairing (`pairPromos.ts`): keep NSB out of pairs in v1.2.
- `get-promos.ts` (Promos tab): list NSB rows with the same estimated labelling; `UnprofitablePromoRow` handles "can't price".
- Done/History/Stats components that switch on `promoType` (HistorySection, DonePromoRow, DonePairRow, PromoRow, PairCard) need a case.

## Intro offers ranking (Sign-up offers screen)

New pure `rankIntroOffers({offers, ownedBookKeys, events, now, precision})`, called from `get-signup-offers` (which currently takes no args and returns groups; keep "no arguments, userId from session" discipline T-mgi-01; it will additionally need cached events via `getCachedEvents`, 0 credits).

- Eligible: offers at books the member **lacks** (ownership via `getUserBookKeys`, as today). Hedge set = the member's own books only (they must hold accounts to hedge); if the member has fewer than one hedgeable book, show "add a book" state.
- Kinds:
  - `bet_get` (place $S, receive $B in bonus bets regardless of outcome): net = value of B at the live rate (v*B) minus cost of the qualifying bet. Cost-minimising qualifying line = the market where hedging a stake S at the new book against the member's best opposing price loses least (an arb-style calc: pairs of quotes, `arbMath` / two-way hedge with equal-payout, could reuse `rankArbs` helpers with `totalStake = S` and allow negative result, returning the least-negative line). Then profit = v*B - qualifyingLoss. This "negative arb" is new logic; fixture-test it.
  - `no_sweat` (first bet NSB): use `calculateNoSweatHedge` with S = qualifying stake/refund cap, choose the best line over all events (same candidate loop as promo ranking, unpinned scope = all sports/moneyline), rate from `conversionRate(newBookKey, memberHedgeSet)`.
  - Installment offers (`installments`): value each installment at v; exact line applies to the qualifying bet only; show "convert each bonus bet with the finder" and a link/prefill to the Tools finder with book + amount.
- Output DTO per offer: ranked position, bookName, kind, headline value (estimated), qualifying bet (market/side/odds/stake), hedge (book/odds/stake), expected profit estimated vs floor, "how to convert the bonus bets" text/prefill, odds age, source link. Sort by estimated profit desc; unpriceable offers (no odds at that book: Caesars, Fanatics) go to a "can't price" tail with the headline amount only. Do not emit exact lines for them.
- Owned books: keep the "Show books I already have" toggle (existing owner decision 3) as a secondary list.
- Reads cached odds only -- no Odds API client import (T-04-04 pattern).

## Data flow changes

1. Scrape (GH Actions 3x/day, unchanged cadence): new parsers -> `promos` (incl. no_sweat) + `signup_offers` (+ new fields).
2. Feed request: `loadMemberFeedContext` also builds the memoized `conversionRateFor`. `rankOpts` gains it. Singles/pairs unchanged; NSB list produced alongside.
3. Sign-up screen request: member books + active signup offers + cached events -> `rankIntroOffers`.
4. Recorders/dashboard/statistics: unchanged inputs (guaranteed-only singles/pairs).

## Patterns to Follow

- **Inject, don't import, the rate** into `rankPromoHedges` (`opts.conversionRateFor`) to keep domain modules pure and testable with a stub rate.
- **Exhaustive switch with `never` check** on promo type/result kind everywhere; it turns "forgot a place" into a compile error.
- **Additive nullable migrations** only (live production on Vercel + teammate pushes to main; fetch before planning).
- **Deterministic money extraction, reader for classification only** (existing T-mgi-03 rule).
- **Per-book scraper = one file + registry line + fixtures + test**, same as ballybet/draftkings/fanduel.

## Anti-Patterns to Avoid

- Merging NSB into the guaranteed-profit sort or Dashboard totals (breaks the Core Value of "correct to the cent").
- Hardcoding a 70% conversion fallback (owner rejected; return "can't price").
- Extending `PROMO_TYPES` without fixing the `profit_boost ? ... : bonus` ternary.
- Importing ingestion code from domain code (boundary tests exist; signup ranking lives in domain).
- Treating Caesars/Fanatics as hedge venues or promo-side priced books (paid-only odds).

## Touch list (files mentioning promoType, to audit for exhaustiveness)

domain/promos: rankPromoHedges, pairPromos, pairSnapshot, doneSnapshot, promoRowDto, dto, describe, dedupe, lifecycle, yourCap, buildAddedPromo, addedPromoInput, addPromoDraft, duplicateHint, altSpreads, leagueWideAltTargets, reviewInput, scraped, types. db: promos, promoCaps, promoReview, promoTracking, profitHistory, memberPromoState, memberPairState, addedPromos, addedPromoPipeline, schema. actions: edit-promo, correct-promo-match, confirm-promo-match, set-promo-cap, enter-promo-caps, classify-promo, get-promos, get-add-promo-options. components: PairCard, AddPromoForm, UnprofitablePromoRow, DonePromoRow, ClassifyQueueCard, QueueItemCard, PromoRow, DonePairRow, HistorySection. ingestion: promoReading, reconcile, reviewTriage, exclusions, store, books/*. stats: domain/stats/dailyHistory.

## Suggested Build Order

1. **NSB math + conversion-rate oracle** (pure, no I/O): `noSweat.ts`, `conversionRate.ts`, fixtures. Unblocks everything; no schema or UI risk.
2. **Type system + schema**: add `"no_sweat"` to `PROMO_TYPES`, convert all binary branches to exhaustive switches (compile-driven), migration 0018 (`refund_kind`, `refund_cap`, signup_offers columns). Ship dark (no data yet).
3. **Ranking + feed**: `evaluateNoSweatCandidate`, `memberFeed` `estimated` list, new `nosweat` source in `get-opportunities` + UI section with Estimated badge, exclusion of NSB from recorders/dashboard (tests). Manual-add path for `no_sweat` here so it is testable end-to-end without scrapers.
4. **Ingestion for existing books**: exclusions change, reader prompt/version bump, reconcile/guard, DK/FanDuel/Bally no_sweat parsing, reviewTriage routing. (After step 3 so kept NSB promos have somewhere to land.)
5. **Intro-offer extraction + schema fields**: extend ingestion `signupOffers.ts`/`signupStore.ts` for existing 3 books first (data exists to test against).
6. **Intro-offer ranker + Sign-up screen rewrite** (depends on 1, 2, 5).
7. **New-book scrapers**, each an independent time-boxed spike (BetRivers, BetMGM, theScore, Hard Rock, then Caesars/Fanatics which are unpriceable anyway). Last, since each is high-uncertainty and independent; the product is complete without any of them via manual add.

## Research flags for phases

- Step 7 (scrapers): needs per-book recon spikes; prior recon rated most as blocked (Caesars 403, Fanatics app-only, Hard Rock DNS, BetMGM/theScore login-gated, BetRivers loyalty store only). Likely deeper research per book; accept partial delivery.
- Step 6 (qualifying-line optimizer for bet&get): new math (least-negative arb), design the objective and test fixtures first; check offer terms (min odds, requires-win) per book.
- Step 3: verify `promoTracking`/`doneSnapshot` do not store computed estimates as extracted profit.
- Step 1: owner decision on top-1 vs more conservative rate.
- Steps 2, 4, 5: standard patterns, low research need.

## Confidence

| Area | Confidence | Notes |
|------|------------|-------|
| Type/DB integration | HIGH | Read schema.ts/types.ts directly; text column, no CHECK |
| NSB math | HIGH | Derived algebraically; verify with fixtures |
| Rate-per-hedge-set | HIGH | Reuses existing finder functions |
| Recorder/dashboard exclusion | MEDIUM | Not every consumer file read (promoTracking, doneSnapshot, stats) -- audit in phase |
| reconcile/verbatimGuard changes | MEDIUM | Files not read in full |
| Scraper feasibility | LOW-MEDIUM | Based on stale recon notes in scrapeTargets.ts, not re-probed |
