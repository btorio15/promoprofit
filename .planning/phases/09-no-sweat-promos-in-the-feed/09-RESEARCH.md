# Phase 9: No-Sweat Promos in the Feed - Research

**Researched:** 2026-10-22
**Domain:** Brownfield TypeScript/Next.js/Drizzle app. Promo ingestion (scraper + AI reader), a separate estimate-only ranking path, a track-and-settle flow, and a "guaranteed numbers stay guaranteed" invariant.
**Confidence:** HIGH on codebase facts (every claim below was read in this repo this session). MEDIUM on FanDuel/Bally feasibility (no live recon was possible; no fixtures exist).

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tracking a no-sweat and recording real profit (FEED-05)**
- **D-01:** No-sweat rows have a **Track** button instead of Mark done. Tracking snapshots what was shown (game, line, qualifying stake/odds, hedge book/stake/odds, estimate, rate) and moves the row out of the ranked list.
- **D-02:** Tracked no-sweats are **pinned in a "Tracking" strip at the top of Opportunities** (above the ranked feed).
- **D-03:** Once the game's start time has passed, the tracked card asks **"How did it go? Bet won / Bet lost"**. The app can't see sportsbook accounts, so the member taps one. Before game start, the buttons are not offered.
- **D-04:** **Bet won** records the exact profit right away from the tracked stakes (qualifying winnings - hedge stake), with an option to edit if they actually bet different amounts/odds.
- **D-05:** **Bet lost** turns the pinned card into a **live bonus-bet hedge for the refund** (refund amount at the promo's book, priced the way the finder does: best market, hedge book, stakes, from cached odds). When the member marks that done, the real total is recorded: hedge winnings from the original bet + converted refund - lost qualifying stake.
- **D-06:** Real recorded no-sweat profit **counts in the green "profit extracted" line and Dashboard extracted totals**, on the day it is recorded. Nothing counts while a no-sweat is waiting to settle.
- **D-07:** If the member never enters a result, the card **stays "waiting" with a reminder** and counts $0. No auto-recording.

**How estimates rank and look (FEED-03, FEED-04)**
- **D-08:** No-sweats are ranked inline with other promos by the **estimate** (the "est." figure on the card, i.e. Phase 8's best-rate-right-now value).
- **D-09:** The card shows **estimate + rate + worst case** at a glance, e.g. "est. +$14.20 at 78% · worst case -$3.10", with a small "est." label.
- **D-10:** **"Can't price"** no-sweats (no odds at the refund book) are shown at the bottom of the feed with a "can't price" note, never with an invented number.
- **D-11:** No-sweats with a **negative estimate** go wherever unprofitable bonus bets/boosts go today, not in the main ranked list.
- **D-12 (locked by FEED-04):** Estimates are excluded from Dashboard totals, the grey line (per-member daily available-profit record) and the Statistics tab.

**Adding no-sweats by hand**
- **D-13:** The Add promo form gets a **No-sweat type**, allowed at **any book that has odds** (e.g. BetMGM, Caesars). Same solver, same "est." label, same Track flow.
- **D-14:** Manual fields: **refund cap, minimum odds, sport/league, expiry**, plus an optional market limit (moneyline/spread/total) like boosts have. Refund is assumed to be paid as a bonus bet (no cash-refund option).

**Review and misreads (FEED-01, FEED-02)**
- **D-15:** When the scraper and AI reader disagree (no-sweat vs bonus bet), the review item shows the promo text, **both readings side by side** (e.g. "Scraper: no-sweat $25 cap, -200+" vs "Reader: bonus bet $25"), with one-tap **"It's a no-sweat" / "It's a bonus bet" / "Skip"**, using the existing review queue.
- **D-16:** **Parlay / same-game-parlay no-sweats stay skipped** with a clear skip reason (the solver covers single bets only). They are not sent to review.
- **D-17:** Scraped no-sweats that refund in **cash** go to **review**. They are not priced this phase.
- **D-18:** Existing data: skipped no-sweats are re-read on the next scrape. Already-stored promos are **re-checked once**, and any that now read as no-sweat are moved over (or go to review if unsure). The 2026-10-08 misread (no-sweat stored as bonus bet) is a regression test (FEED-02).
- **D-19:** A no-sweat is **never** shown or priced as a bonus bet. Replace binary `profit_boost ? boost : bonus` branches with exhaustive switches over promo type (research warning carried from Phase 8).

**Staying low-profile (avoiding book limits)**
- **D-20:** Every no-sweat card and the Track step show a short **account-risk warning**: one chance per book, mix in normal bets, avoid extreme odds. Reuse the style of `src/components/RiskAdvisory.tsx` but make the copy no-sweat-specific (research PITFALLS #8). Never suggest multiple accounts, VPNs or location tricks.
- **D-21:** New member settings group **"Low-profile"** in Settings (next to stake precision), each protection optional:
  - **Odds cap** for the qualifying bet: member setting, **on by default at +300**. Lines beyond the cap are not suggested, even if their estimate is higher.
  - **Main lines only**: when on, the qualifying bet is suggested only on main moneylines/spreads/totals (no alternate spreads).
  - **Natural-looking stakes**: when on, no-sweat hedge stakes are whole dollars regardless of the stake-precision setting (planner may add $5 steps as an option). Profit is still computed from the rounded stakes.
- **D-22:** When a protection is **off** and the suggested bet would trip it, the card shows a **specific warning** instead ("long odds", "alternate line", "exact-cent stake").
- **D-23:** These filters feed into the Phase 8 line search (`rankNoSweat`), so the best line is chosen *within* the member's limits. The estimate shown is the best allowed line, not the unrestricted best.

**Audit fixes the plan must include (A-01..A-12)** - treat as requirements:
- **A-01 (high):** Keep no-sweats out of `computeMemberFeed` / `rankPromoHedges` entirely. Rank them in a separate path used only by Opportunities display. Exclude `no_sweat` from pairing (`pairPromos.ts:254`). Decide explicitly whether no-sweats count in the Statistics funnel (`profitHistory.ts:50-62`).
- **A-02 (high):** D-19 checklist: every promo-type branch becomes an exhaustive switch (types.ts:8, rankPromoHedges.ts, pairPromos.ts, promoRowDto.ts, pairRowDto.ts, doneSnapshot.ts, reconcile.ts, reviewTriage.ts, scraped.ts, classify-promo.ts, set-promo-cap.ts, get-promos.ts, PromoRow.tsx, AddPromoForm.tsx, addPromoDraft.ts, buildAddedPromo.ts, duplicateHint.ts, describe.ts, leagueWideAltTargets.ts, altSpreads.ts, yourCap.ts, addedPromoPipeline.ts, dailyHistory.ts).
- **A-03 (high):** Settling (Bet won/lost/push) works **only from the Track snapshot** (`activePromoWhere`, db/promos.ts:316, makes a promo inactive after kickoff).
- **A-04 (high):** Tracking state (tracking -> awaiting_refund -> done). Totals, green line, stats, counts/averages and the Done list use only `done` rows, **dated at settle time**. Undo steps back one state instead of deleting.
- **A-05 (high):** Any no_sweat vs bonus_bet disagreement goes to **review regardless of reader confidence** (`reconcile.ts:237`). Reader needs a `no_sweat` kind plus refund cap and refund form fields. Bump the prompt version.
- **A-06 (high):** Run the parlay/SGP check **before** returning `no_sweat` (`exclusions.ts:128` vs :139-140). Add cash-refund detection -> review (D-17). Widen the no-sweat wording (bet back, second chance, money back, refund if your bet loses) and tighten the new-customer "first bet" check (`exclusions.ts:16`).
- **A-07 (med):** Scrapers hard-code `profit_boost` (draftkings.ts:381, ballybet.ts:266/356, fanduel.ts:500). DraftKings is must-have. **FanDuel and Bally need a live recon + fixture first.**
- **A-08 (med):** D-18 needs a one-off backfill script. Dedupe keys include the type and the store never rewrites `promoType`. Keep reader calls off clear-skip items so the 60-call cap isn't exhausted after the prompt-version bump.
- **A-09 (med):** **Push / void** records $0 (owner to confirm; recommended). Both outcomes let the member correct actual stakes/odds. Refund = min(actual stake, cap).
- **A-10 (med):** "Can't price" rows need their own unsliced list (the feed shows top 5 per source, `pick.ts:5`). Opportunity types need an estimated flag and an "Est. ROI" label (ROI = estimate / (qualifying + hedge stake)). Empty-state check must count no-sweats.
- **A-11 (low):** Compute the conversion rate once per request (one `makeConversionRateFor` per getOpportunities); price age includes the refund-conversion game; `noSweatScope` needs expiry + market limit for manual add; validate manual caps to whole cents (`conversionRate.ts:89` throws otherwise); new-customer no-sweats must not show their headline as a guaranteed bonus in Sign-up offers.
- **A-12 (low):** The only known misread is DraftKings "NFL London No Sweat" (pending row 94, fixed in f9f2a7d, text in `exclusions.test.ts:191-197`). Use it for the FEED-02 regression test unless the owner names another.

### Claude's Discretion
- What ROI % means for a no-sweat under the ROI sort (e.g. estimate / total outlay).
- Exactly how the "waiting" reminder is shown, and whether a tracked card can be un-tracked/undone (mirror existing undo of Mark done).
- How "Bet won" edits are entered (stakes vs a final profit figure), and the exact snapshot shape stored at Track time.
- Whether the "Bet lost" bonus-bet card reuses the existing bonus-bet promo row/snapshot machinery or a dedicated tracked-row type.
- Schema shape for the new promo type and tracking state (migration via drizzle-kit, committed).

### Deferred Ideas (OUT OF SCOPE)
- Parlay / same-game-parlay no-sweats (need different math, stay skipped).
- Pricing cash-refund no-sweats (sent to review for now).
- Auto-recording worst case after N days for untouched tracked bets (rejected, D-07).
- Ranking/valuing intro (new-customer) offers: Phase 10. New books: Phase 11. The "2-bet pair solver can be a cent short" todo stays separate.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FEED-01 | Existing-customer no-sweat promos at DK/FD/Bally appear as a no-sweat promo instead of being skipped; new-customer no-sweat goes to Sign-up offers | "Ingestion" section: new `classifyNoSweat` detector after `classifyExclusion`, DK candidate builder, reader `no_sweat` kind, FD/Bally recon task shape, new-customer routing stays in `classifyExclusion` |
| FEED-02 | A no-sweat is never shown as a bonus bet; parser/reader disagreement goes to review | Type-level narrowing (`GuaranteedPromoType`), exhaustive switches, `reconcileCandidate` no-sweat conflict rule BEFORE the high-confidence-wins branch, DK "NFL London No Sweat" regression fixture |
| FEED-03 | No-sweat opportunities ranked in the feed alongside other promos, marked "est." with the conversion rate used | Separate `rankNoSweatFeed` path, `NoSweatRowDTO` merged into the `promos` source with `estimated:true`, Est. ROI definition |
| FEED-04 | Dashboard totals, grey line, Statistics unchanged by estimates | `getActivePromos` excludes `no_sweat` at the SQL level, `GuaranteedPromoType` on `RankablePromo`, funnel query excludes `no_sweat`, invariant tests |
| FEED-05 | Marking a no-sweat done records the profit actually made | `tracked_no_sweats` table + settle actions working only from the Track snapshot; completion row written at settle time (dated at settle) |
</phase_requirements>

## Summary

The Phase 8 solver (`solveNoSweat`, `makeConversionRateFor`, `rankNoSweat`) is finished, pure, and tested (22 tests pass in ~1s). Phase 9 is almost entirely plumbing, and the dominant risk is leakage. A no-sweat that enters `rankPromoHedges` is silently priced as a bonus bet (`rankPromoHedges.ts:251` is a `=== "profit_boost" ? boost : bonus` ternary), then flows into the pair finder, the 3x/day recorder, `member_profit_observations` (the grey line), `profit_snapshots` and Statistics. The most robust fix is structural, not a filter sprinkled at every call site: (1) widen `PROMO_TYPES` to include `no_sweat`, (2) introduce `GuaranteedPromoType = "profit_boost" | "bonus_bet"` and narrow `RankablePromo.promoType` to it so passing a no-sweat to the guaranteed pipeline is a compile error, (3) make `getActivePromos` exclude `no_sweat` rows in SQL and add a separate `getActiveNoSweatPromos` that shares the same row mapper. Every existing consumer of `getActivePromos` (Promos tab, refresh actions, mark-done recompute, add-promo options, morning observe, group recorder, `scripts/promos-check.ts`) then stays guaranteed-only with zero edits.

For tracking, the existing `promo_completions` table is used by 6 consumers that all treat "a row exists" as "done, counts in totals, dated `completedAt`". Adding a `state` column forces every one of them to filter correctly (a missed one leaks $0 rows into counts/averages/Done list). The lower-risk design (recommended, a refinement of A-04, within "Claude's Discretion: schema shape") is a **new table `tracked_no_sweats`** holding only in-flight state (`tracking` / `awaiting_refund`), with the `promo_completions` row written **only at settle time** (so `completedAt` is automatically the settle date and every totals/series/done-list consumer is untouched). "Done" is simply "a completion row exists". Undo = the existing `unmarkPromoUsed` (deletes the completion row), after which the tracked row reappears in the strip at its stored state, which is exactly "step back one state, don't delete".

Ingestion needs: a `no_sweat` promo type reusing existing columns (`bonus_amount` = refund cap, `min_odds_american`, `eligibleMarketTypes` = market limit) so **no promos-table migration is needed**; a `classifyNoSweat` detector that runs after `classifyExclusion` (parlay/SGP/new-customer/live/prop/futures win first, fixing A-06); reader schema + prompt-version bump; a reconcile rule that sends any no_sweat/non-no_sweat disagreement to review regardless of confidence; and removal of reader calls on clear-skip items. DraftKings is feasible now (text-pattern known from the test string, Opt-In token, "MAX REWARD: $10", "stake back in the form of a Bonus Bet"), but no real fixture of the NFL London promo exists in `src/test/fixtures/promos/` (only the unrelated racing "Bet Back with Portnoy!" entry, category "No Sweat", refunded in "Crown Cash", which must stay skipped). FanDuel and Bally need a recon task before any scraper change.

**Primary recommendation:** Make leakage a compile-time impossibility (narrowed `GuaranteedPromoType` + SQL-level exclusion in `getActivePromos`), add `tracked_no_sweats` (+ `user_low_profile_settings`) in migration 0018, price no-sweats in a new pure `rankNoSweatFeed` called only from `getOpportunities`, and settle exclusively from the Track snapshot.

## Project Constraints (from CLAUDE.md)

- Money math: decimal.js only, never native floats; format to cents at display time. Server recomputes and never trusts client numbers (Phase 8 modules already comply).
- Vitest for table-driven tests of the money math; correctness "to the cent" is the core value.
- Drizzle ORM (0.45.x) + drizzle-kit 0.31.x; commit generated SQL migrations. Neon HTTP driver (no interactive transactions, see Pitfall 4).
- Next.js 16 App Router server actions; iron-session auth; `requireUser()` must be the first statement of every action; inputs are `z.strictObject` with no `userId` field.
- Hedge venues are regulated sportsbooks only; Colorado only; never suggest multiple accounts/VPNs/location tricks (D-20).
- GSD workflow enforcement: file edits happen via a GSD command; this research task modified no source code.
- Project memory: explain choices in plain English in user-facing text; stay on the GSD plan (no off-roadmap suggestions); teammate (dico1108) pushes migrations directly to main, so `git fetch` before generating a migration. As of this research `origin/main` == local HEAD (7a8d066) and the newest migration is `0017_giant_jack_power` (idx 17), so the next one is `0018`.
- No project skills found (`.claude/skills` etc. not present).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Detect/parse no-sweat promos | Ingestion (GitHub Actions scrape job, `src/ingestion/promos`) | Domain (`scraped.ts` schema) | Scrapers are pure parsers; no DB access (boundary test exists) |
| Reader vs parser reconcile | Ingestion | Review queue (API/DB) | `reconcile.ts` is pure; review rows persist via `store.ts` |
| Estimate ranking (rankNoSweatFeed) | Domain (pure) | API server action `getOpportunities` | Pure, injected events + conversion fn, 0 Odds API credits |
| Guaranteed-only exclusion | Database query layer (`getActivePromos` SQL) | Type system (`GuaranteedPromoType`) | Defense in depth: can't be forgotten at a call site |
| Track / settle state | Database (`tracked_no_sweats`, `promo_completions`) | Server actions | Server owns snapshot, never trusts client numbers |
| Low-profile settings | Database (`user_low_profile_settings`) | Settings page (SSR) + server actions | Server-read so the feed, the Track recompute and settings page agree (stake precision is client localStorage only, see Pitfall 7) |
| Tracking strip / est. labels / warnings | Browser (client components) | Frontend server (SSR page) | Presentation only; all numbers precomputed as decimal strings |
| Refund bonus-bet card (Bet lost) | Domain (reuse `rankBonusBetHedges`) | API server action | Same engine as the finder, computed live from cached odds |

## Standard Stack

No new packages. Everything uses what is already installed. [VERIFIED: package.json + codebase read]

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| decimal.js | ^10.6.0 | All stake/profit math | Project rule; `noSweat.ts` uses a cloned 40-precision Decimal |
| zod | 4.x | Strict action input, snapshot schemas (versioned), reader schema | Existing pattern (`DonePromoSnapshotSchema`, `PromoReadingSchema`) |
| drizzle-orm / drizzle-kit | 0.45.x / 0.31.x | New tables, migration 0018 | Existing |
| vitest | existing | Table-driven tests | `include: src/**/*.test.ts`, node env, `@` alias; single test file runs in ~1s |
| @anthropic-ai/sdk | ^0.129.0 | Reader (model `claude-haiku-4-5`, no date suffix, OD-1) | Existing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| New `tracked_no_sweats` table | `state` column on `promo_completions` (A-04 literal) | Column approach makes `getPromoCompletions`'s 6 consumers each filter by state; one miss silently changes totals/averages/Done list. New table leaves them all untouched. Recommend the table; if the owner insists on the column, add a typed `getDoneCompletions()` and make `getPromoCompletions` private. |
| DB-backed Low-profile settings | localStorage like stake precision | localStorage must be sent by the client on every call (precision pattern). DB is server-authoritative and Settings page can SSR it; follows `user_book_caps` precedent. |
| Personal `bonus_bet` added promo for the refund hedge | Direct `rankBonusBetHedges` call | See "Refund hedge pricing" below: the personal-promo route would leak into the grey line and Statistics. Use direct call. |

**Installation:** none.

## Package Legitimacy Audit

No external packages are installed or recommended by this phase. slopcheck not required. **Packages removed:** none. **Packages flagged [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
 SCRAPE (GitHub Actions, scrape-promos.yml)                      MEMBER REQUEST (Vercel)
 ---------------------------------------                         -----------------------
 book list JSON --> scraper.parse
   classifyExclusion (new_customer, deposit, not_a_promo, live, sgp/parlay, futures, prop...)
        | null
        v
   classifyNoSweat (NEW, runs AFTER exclusions) --cash--> skip reason no_sweat_cash (review-worthy)
        | yes (bonus-bet refund)
        v
   buildNoSweatCandidate  (promoType no_sweat, bonusAmount=refund cap, minOdds, scope)
        v
   readerPass (candidates + review-worthy skips only; clear skips NOT read)
        v
   reconcile: no_sweat vs other kind => REVIEW always; both no_sweat + cash => review
        v
   store.ts upsert (dedupe key includes type => old bonus_bet row expires on next scrape)
        v
   promos table (promo_type='no_sweat')
                |
                +---------------------------------------------+
                |                                             |
   getActivePromos (SQL: promo_type <> 'no_sweat')   getActiveNoSweatPromos (promo_type = 'no_sweat')
        |  (all existing callers unchanged)                    |
   computeMemberFeed / pairs / recorders / Stats               |  getOpportunities (ONLY consumer)
   GUARANTEED ONLY  ------------------------------->  dashboard, grey line, stats  (unchanged)
                                                               v
                       loadLowProfileSettings(user) + makeConversionRateFor (ONE per request)
                                                               v
                       rankNoSweatFeed(promos, opts)  --> ok(est>0) -> NoSweatRowDTO (estimated:true) -> merged into "promos" source
                                                         ok(est<=0) -> omitted from Opportunities (D-11)
                                                         cant_price  -> separate unsliced list at bottom (D-10)
                       tracked_no_sweats rows ---------> "Tracking" strip (separate response field)
 Track (action) -> snapshot v2 -> tracked_no_sweats(state=tracking)
 Settle won/push  -> completion row (completedAt=now, profitExtracted) [snapshot only, A-03]
 Settle lost      -> state=awaiting_refund -> card prices refund via rankRefundOpportunities (bonus-bet finder engine)
 Complete refund  -> completion row (completedAt=now, real total)
 Undo             -> unmarkPromoUsed deletes completion row -> card returns to strip at stored state
```

### Recommended Project Structure (new/changed files only)
```
drizzle/0018_*.sql                      # tracked_no_sweats + user_low_profile_settings
src/db/schema.ts                        # two new tables
src/db/trackedNoSweats.ts               # reads/writes (idempotent, missing-table degrade)
src/db/lowProfile.ts                    # get/upsert member settings (mirrors bookCaps.ts)
src/db/promos.ts                        # getActivePromos excludes no_sweat; getActiveNoSweatPromos
src/domain/promos/types.ts              # PROMO_TYPES += no_sweat; GuaranteedPromoType; assertNever
src/domain/promos/lowProfile.ts         # settings schema, DEFAULT_LOW_PROFILE, warning derivation
src/domain/promos/rankNoSweat.ts        # + lowProfile option, eligibleMarketTypes, filteredOut count
src/domain/promos/rankNoSweatFeed.ts    # NEW: split ok/negative/cant_price, ROI, DTO inputs
src/domain/promos/noSweatRowDto.ts      # NEW: NoSweatRowDTO (+ snapshot builder)
src/domain/promos/noSweatSnapshot.ts    # NEW: tracked + final snapshot zod schemas (version 2)
src/domain/hedge/conversionRate.ts      # + rankRefundOpportunities (shared by topConversionFor)
src/app/actions/track-no-sweat.ts       # track / untrack / settle / complete-refund / set-low-profile
src/ingestion/promos/noSweat.ts         # classifyNoSweat + cap/refund-form parsers (pure)
scripts/audit-no-sweat.ts               # read-only dry-run (A-08)
src/test/fixtures/promos/               # new DK (and FD/Bally if recon succeeds) fixtures
```

### Pattern 1: Narrow the guaranteed pipeline at the type level (A-01/A-02)
**What:** `PROMO_TYPES = ["profit_boost","bonus_bet","no_sweat"]`; `export type GuaranteedPromoType = Exclude<PromoType,"no_sweat">`; `RankablePromo.promoType: GuaranteedPromoType`. `ActivePromo extends RankablePromo` therefore cannot be a no-sweat. `getActiveNoSweatPromos` returns a distinct `ActiveNoSweatPromo` type (id, bookKey, refundCap (from `bonusAmount`), minOddsAmerican, scope, eligibleMarketTypes, finePrintNote, claimHint, scopeLabel, addedByYou, scraped, attribution...). Add `assertNever(x: never): never` and use it in every switch in the A-02 list so a future fourth type fails compilation.
**When to use:** all promo-type branching.
**Example:**
```typescript
// Source: this repo, src/domain/promos/rankPromoHedges.ts:251 is the ternary to replace
switch (promo.promoType) {
  case "profit_boost": return evaluateBoostCandidate(/* ... */);
  case "bonus_bet":    return evaluateBonusCandidate(/* ... */);
  default:             return assertNever(promo.promoType); // compile error if no_sweat reaches here
}
```
Note: `mapActivePromoRow` (db/promos.ts:191) currently drops unknown `promo_type` with a warn, so no_sweat rows are silently dropped until `PROMO_TYPES` is widened; widening must land in the same plan as the SQL exclusion.

### Pattern 2: Estimates-only ranking path (A-01)
`rankNoSweatFeed({promos, moneylineEvents, extendedEvents, now, hedgeBookKeys, precision, lowProfile, conversionRateFor})` loops `rankNoSweat` per promo and returns `{ ranked: NoSweatFeedItem[] (estimate>0, sorted by estimate), nonPositive: n, cantPrice: NoSweatFeedItem[], invalid: [...], filteredOut }`. Called **only** from `getOpportunities`, after `computeMemberFeed`, never from recorders. `getOpportunities` creates ONE `makeConversionRateFor({events: ctx.moneylineEvents, now})` (the closure caches by book|amount|hedge-set; A-11) and passes it to every promo.

Response shape (Opportunities): do NOT put cant-price or tracking rows in `sources` (the screen runs `pickTop(items, sort, TOP_N=5)` on each source, `pick.ts`, which would slice them). Add separate fields: `tracking: TrackedNoSweatCardDTO[]` and `cantPrice: NoSweatRowDTO[]`. Priced no-sweats go into the `promos` source as `OpportunityItem<PromoRowDTO | NoSweatRowDTO>` discriminated by `data.kind`, with `RankKey.estimated?: boolean`, `profit` = estimate string, `pct` = Est. ROI, `pctLabel: "ROI"` plus a new `"Est. ROI"`-flagged field (extend `RankKey.pctLabel` union with `"Est. ROI"`). Update the empty-state logic in `get-opportunities.ts` (the `sources.some(items>0)` check, `ctx.activePromos.length === 0` "none-scraped", and the `no-books` re-rank) to also count no-sweat rows/tracking/cant-price so a screen with only no-sweats is not "Nothing profitable".

Est. ROI (discretion, recommended): `estimatedProfit / (qualifyingStake + hedgeStake)`, 2dp, ROUND_HALF_UP, labelled "Est. ROI". Sorting uses `Decimal.comparedTo` already (`sortByMeasure`).

### Pattern 3: Low-profile filters inside `rankNoSweat` (D-21..D-23)
Extend `NoSweatRankOptions` with `lowProfile?: { maxQualifyingOddsAmerican: number | null; mainLinesOnly: boolean; naturalStakes: boolean }` (optional so the 22 existing Phase 8 tests stay green unchanged):
- **Odds cap:** before `solveNoSweat`, skip a candidate when `americanToDecimal(qualifying.oddsAmerican) > americanToDecimal(cap)` (compare decimal odds, never raw American ints: -110 vs +300 is not a numeric compare). Count skips in `filteredOut` so the UI can say "N lines hidden by your Low-profile settings" when `no_qualifying_line` results from filtering.
- **Main lines only:** pass `altSpreadBookKey: undefined` into `enumerateScopeSelections` when on (it is already opt-in, `selection.ts:299-346`). To warn when OFF and the pick is an alternate line (D-22) the selection needs a marker: add `fromAlternate?: boolean` to `ResolvedSelection`, set where `collectAltSpreadHomePoints` contributes a point not present in `collectSpreadHomePoints` (`selection.ts` ~344). Small, local change.
- **Natural stakes:** `precision = naturalStakes ? "whole" : opts.precision` passed to `solveNoSweat` (`precision: "whole"` already rounds the hedge stake to whole dollars while the profit is computed from the rounded stake). The "$5 steps" option is NOT supported by the solver (unit is 1 or 0.01) and would need a Phase 8 solver change; recommend deferring ($5 steps was "planner may add").
- **Warnings (D-22):** derive `warnings: ("long_odds"|"alternate_line"|"exact_cent_stake")[]` from the chosen candidate when the matching protection is off: `long_odds` if decimal(qualifying) > decimal(+300) (use the default threshold as the "extreme" line even when the cap is disabled), `alternate_line` if `fromAlternate`, `exact_cent_stake` if `hedgeStake` has non-zero cents.
- Defaults: `DEFAULT_LOW_PROFILE = { oddsCapEnabled: true, oddsCapAmerican: 300, mainLinesOnly: false, naturalStakes: false }`, applied when a member has no row. Validate cap as integer >= 100 (a positive American price).
- The promo-level market limit (D-14) is currently ignored: `rankNoSweat` hardcodes `eligibleMarketTypes: ["moneyline","spread","total"]`. Add `eligibleMarketTypes` to `NoSweatPromo` and pass it through (default all three). Scraped `eligibleMarketTypes` already exists on `ScrapedPromo`.
- `noSweatScope(sportKey, now)` lacks expiry: a hand-added no-sweat with an expiry must cap `windowEnd` at `expiresAt`. Extend to `noSweatScope(sportKey, now, expiresAt)`. Scraped promos already carry a resolved `scope` from the matcher.
- Manual cap validation: reject caps with more than 2 decimals / <= 0 at the form schema (`addedPromoInput.ts`); `rankNoSweat` already returns `invalid_promo` rather than throwing (`validatePromo`), but `makeConversionRateFor` throws `RangeError` on bad amounts (line 89), so validation must precede it (the existing `validatePromo` runs first, good).

### Pattern 4: Track -> settle state machine (A-03/A-04/A-09)

`tracked_no_sweats` (PK `(user_id, promo_id)`, FKs cascade like `promo_completions`):
`state text` ('tracking' | 'awaiting_refund'), `tracked_at`, `outcome text null` ('lost' when awaiting_refund), `outcome_at`, `snapshot jsonb` (v2 tracked snapshot), `updated_at`.

Snapshot v2 (`version: z.literal(2)`, `kind: z.literal("no_sweat")`, zod-validated on read, mirrors `DonePromoSnapshotSchema` style): promo terms (id, bookKey, bookName, title, refundCap, minOdds, expiry), game (eventId, sportKey, commenceTime ISO, home/away, marketBadge, selection labels), qualifying (bookKey, odds, stake, winnings), hedge (bookKey, odds, stake, payout), estimate (estimatedProfit, worstCaseProfit, profitIfWin, profitIfLose), conversion (rate, pct, refundValue, refundBookKey, eventId), precision, lowProfile snapshot + warnings, oddsFetchedAt, recordedAt. All money as 2dp strings. Settlement amounts are computed from this snapshot only (A-03): `activePromoWhere` hides promos once the game starts, so `computeMemberPromoState` would return `not_active` exactly when the member needs to settle.

Actions (all `requireUser()` first, `z.strictObject`, no userId, `revalidatePath("/")`):
1. `trackNoSweatAction({promoId, precision, expectedEstimate})`: recompute server-side via the same `rankNoSweat` + low-profile settings + one conversion fn; reject `odds_changed` if the estimate differs from `expectedEstimate` (reuse `isSameDisplayedProfit`); build snapshot; `INSERT ... ON CONFLICT DO NOTHING`. Reject when the promo is not an active no-sweat for the viewer (`getActiveNoSweatPromos` applies the viewer visibility rule).
2. `untrackNoSweatAction({promoId})`: deletes the row only while `state='tracking'` and no completion exists.
3. `settleNoSweatAction({promoId, outcome: 'won'|'lost'|'push', actualProfit?})`: loads tracked row (user-scoped), validates `now >= snapshot.game.commenceTime` (D-03; also enforce server-side, not just by hiding buttons). `won`: profit = `snapshot.estimate.profitIfWin` (= qualifying winnings - hedge stake, exact), overridable by `actualProfit` (2dp decimal string, bounded e.g. |x| <= 10,000). `push`: default `0.00`, overridable (A-09). `lost`: `UPDATE state='awaiting_refund'`, no completion yet. For won/push: insert the completion row (`completedAt: now`, `snapshot` v2 final with `outcome`, `computedProfit`, `enteredProfit`, `profitSource: 'computed'|'entered'`, `profitExtracted`).
4. `completeRefundNoSweatAction({promoId, expectedRefundProfit, actualProfit?})`: only from `awaiting_refund`; recompute the refund hedge from cached odds (below); total = `hedgeNet - qualifyingStake + refundProfit` where `hedgeNet = hedgePayout - hedgeStake` from the snapshot (this equals `snapshot.estimate.profitIfLose` evaluated with the real refund profit: `hedgePayout - hedgeStake - stake + refundProfit`). Optimistic-concurrency check on the refund profit like mark-done; `actualProfit` overrides the total. Insert completion.
5. Undo uses the existing `unmarkPromoUsedAction` (deletes the completion row; `unmarkPairDone` handles a single non-pair row). The tracked row then reappears in the strip at its stored state ("step back one state").

Insert order for won/push/complete: write the completion row first (idempotent `ON CONFLICT DO NOTHING`), then no second write is needed because "done" == completion row exists, so the strip and feed filter by `promoId NOT IN doneIds`. This avoids a half-written two-statement state on neon-http (no interactive transactions).

**"Push / void" caveat (A-09, flag for owner):** recording $0 is only exact when BOTH legs are voided (a cancelled game or a tied 2-way moneyline, the `tieRisk` case). If only the qualifying bet pushes (e.g. an alt line the enumeration should not offer since it only offers half-points, so rare), the hedge still settles and profit is not $0. Recommend the Push button label "Push / game voided (both bets refunded)", default `0.00`, with the actual-profit override as the escape hatch. [ASSUMED: owner confirmation pending]

**Feed exclusion:** `loadMemberFeedContext` already builds `doneIds` from completions and filters `feedPromos`. With the separate table, `feedPromos` is built from `getActivePromos` (guaranteed only), so tracked no-sweats are never in it. The no-sweat list is `noSweatPromos.filter(p => !doneIds.has(p.id) && !trackedIds.has(p.id))`.

### Pattern 5: Refund hedge pricing for "Bet lost" (D-05): reuse `rankBonusBetHedges` directly, not a personal promo
**Recommendation: factor `topConversionFor`'s body into `rankRefundOpportunities({events, now, refundBookKey, amount, hedgeBookKeys, limit}) => BonusBetOpportunity[]`, make `topConversionFor` call it with `limit: 1`, and have the Bet-lost card call it with `limit: 3`.** This guarantees the card's number is produced by the same engine that valued the estimate (Phase 8 D-01), uses `extractTwoWayMoneylines` with the 7-day window (`CONVERSION_WINDOW_DAYS`, must equal `find-hedges.ts` `WINDOW_DAYS`) and `calculateBonusBetHedge` stakes (`hedgeStake`, `guaranteedProfit`), and spends 0 credits.
**Why not a personal added `bonus_bet` promo:** a hand-added promo is a real `promos` row (`added_by_user_id` set) that `getActivePromos` returns, so `computeMemberFeed` would rank it, `recordMemberFeedObservations` would write it to `member_profit_observations` (grey line) and `profit_snapshots`/Statistics would see it, double counting a profit the completion already records. It also requires creating/deleting rows with expiry handling and would appear in the Promos tab. A dedicated tracked card avoids all of that.
Refund amount = `min(actual qualifying stake, refundCap)` (A-09), validated to whole cents before calling `makeConversionRateFor`/`rankRefundOpportunities`.

### Pattern 6: Ingestion changes (FEED-01/02)

1. **Detector order (A-06).** Remove `no_sweat` from `classifyExclusion`'s return path. New pure `classifyNoSweat({title,text,category}) => { kind: "none" | "bonus_bet_refund" | "cash_refund" }` in `src/ingestion/promos/noSweat.ts`, called by each scraper only after `classifyExclusion` returned `null`. This makes new_customer, deposit, not_a_promo, live_only, sgp/parlay (title and the `RESTRICTS_TO_PARLAY_SGP_RE` text rule), outright, futures and prop all win over no-sweat (D-16 satisfied by existing reasons; new-customer no-sweats stay `new_customer` and flow to `signupOffers.ts`). A-11: confirm `signupOffers.ts` does not render a no-sweat's headline cap as a guaranteed bonus (`bonusAmount` for those rows must stay null/informational).
   Widen wording: `no[- ]sweat`, `bet back`, `second chance`, `money back`, `(stake|bet) back`, `refund(ed)? (of|if) your (bet|stake|wager) (loses|lost)`, `if your (qualifying )?(bet|wager) loses`. Cash detection: refund described as `cash`, `withdrawable`, `real money`, `cash back` (and NOT `bonus bet|site credit|free bet|token|Crown Cash? see below`). **Open: DraftKings "Crown Cash" (racing "Bet Back with Portnoy!") and "DK Dollars" are non-withdrawable site credit; treat as not-cash but the promo is racing so it is skipped by the unsupported-sport rule anyway.** Verify racing stays skipped (it must not become a no-sweat candidate): `sportFromText` returns `unsupported`/`unknown` and the DK path requires a supported sport or a parseable game scope.
2. **Tighten new-customer check (A-06).** `NEW_CUSTOMER_TEXT_RE` contains a bare `\bfirst[- ]bet\b` (`exclusions.ts:16`). An existing-customer no-sweat saying "your first bet on the game" would be routed to Sign-up offers. Recommend dropping the bare `first[- ]bet` alternative and relying on category "New Customers", `new (customers?|users?)`, `sign[- ]up`, `welcome`, FanDuel acq tags and "first wager" only with `new|welcome` nearby. **Guard with a fixture sweep test**: assert that every entry in the existing 12 fixture files that classifies `new_customer` today still does (generate the expected map before the change, commit it as the test). This is how to prove the tightening loses nothing.
3. **Candidate shape.** `promoType:"no_sweat"`, `bonusAmount` = refund cap (reuse; no new column), `boostPercent:null`, `maxStake:null`, `minOddsAmerican` from the existing `parseMinOdds`, `eligibleMarketTypes` = all three unless the text restricts (e.g. "moneyline"), `claimRequired:"opt_in"` when present (DK token), `pinned:null`. `ScrapedPromoFieldsSchema`'s `promoType` enum picks up the new value from `PROMO_TYPES`; add a `superRefine` rule "a no_sweat needs bonusAmount > 0, no boostPercent". `promoDedupeKey` already includes `promoType` and `bonusAmount`, so a reclassified promo gets a NEW key (A-08).
4. **DraftKings (feasible now).** In `draftkings.ts` after `classifyExclusion === null`, branch on `classifyNoSweat`: `bonus_bet_refund` -> `buildNoSweatCandidate` (new; reuses `parseGameScope`/`parseMultiGameScope`/`slateWindow`/`sportFromText`/`parseMinOdds` which already exist in this file); bypass the `MENTIONS_BOOST_OR_BONUS_RE` and `BOOST_PERCENT_RE` gates which would otherwise reject it as `not_a_promo`/`unrecognized`; `cash_refund` -> skip with a new review-worthy reason. Cap parsing: "MAX REWARD: $10" / "up to $25" (regex, then verified by the reader's verbatim guard). The only real text on record is the test string at `exclusions.test.ts:191-197` ("NFL London No Sweat", "MAX REWARD: $10", "No Sweat Token for the London HOU Texans vs JAX Jaguars game on 10/18", "receive your stake back in the form of a Bonus Bet"); **no fixture of it exists** (grep of all 12 fixture files found only the unrelated racing entry plus a "WNBA No Sweat" image filename). A plan task must add a fixture (live DK list fetch if the promo is still up, otherwise a hand-built fixture reproducing the exact DK JSON entry shape `{promotionId, category, merchandisingData:{promotionHeadline, promotionDescription, terms}}` from the racing entry and the pinned test text, clearly labelled as reconstructed).
5. **Skip reasons.** Keep `"no_sweat"` in `SKIP_REASONS` only if still produced; recommended: add `"no_sweat_cash"` (review-worthy: add to `REVIEW_SKIP_REASONS`, remove `"no_sweat"` from `CLEAR_SKIP_REASONS`) so cash-refund no-sweats land in the classify queue (D-17). `SKIP_REASONS` feeds the reader prompt text and schema (`SKIP_REASON_LIST_TEXT`), so it must change together with the prompt-version bump.
6. **Reader.** `PromoReadingSchema.kind` += `"no_sweat"`; add `refundForm: z.enum(["bonus_bet","cash","unknown"]).nullable()` (strictObject: every added field is required-nullable, no `.min/.max`). Reuse `bonusAmount` (+ its existing `$` evidence rule in `verbatimGuard.ts:120`) as the refund cap, so the guard needs no new numeric field. Prompt: remove "no-sweat offers" from the `not_usable` list; add "Use `no_sweat` when a losing single bet is refunded as a bonus bet/free bet/site credit (bonusAmount = the maximum refund); set refundForm; parlay-only refunds are `not_usable` with skipReason parlay/sgp". Bump `PROMO_READER_PROMPT_VERSION` (currently `2026-10-16.2`) to a new date-stamped value; the cache key hashes it so old cached readings are never reused.
7. **Reconcile (A-05).** In `reconcileCandidate`, after the `isUsable`/`droppedFields` checks and BEFORE the `disagrees && confidence==="high"` reader-wins branch (`reconcile.ts:237`), add: if exactly one of `candidate.promoType`, `reading.kind` is `no_sweat` -> `review` with why `"disagreement"` regardless of confidence. If both are no_sweat and `reading.refundForm==="cash"` -> review. If both are no_sweat and caps differ -> review (recommended; refund cap errors are real money). In `reconcileSkip`, a parser clear-skip (parlay, new_customer, ...) keeps winning (existing `clear_reason_kept`), a reader `no_sweat` with a guard-backed `bonusAmount` and high confidence rescues a `not_a_promo`/`unrecognized` skip into a no_sweat candidate (this is also the path that can catch FanDuel/Bally no-sweats even before their scrapers are taught, subject to scope/team rules already in `reconcileSkip`).
   `applyReaderTeams`/sport fill logic is reused unchanged.
8. **Review UX (D-15).** `buildReviewSkip` currently packs the disagreement into a text prefix line on `rawText` ("[Promo reader check: ...] parser: ... | reader (...): ..."). For side-by-side cards, add a structured `evidence.readings?: { scraper: {type, cap, minOdds}, reader: {type, cap, minOdds, confidence} }` (optional, backward compatible) and have `ClassifyQueueCard.tsx` render it with buttons "It's a no-sweat" / "It's a bonus bet" / "Skip". `classify-promo.ts` and `reviewInput.ts` need a third classify target (`no_sweat`), reusing `buildClassifyDraft` field validation. Confidence MEDIUM: the classify draft path (`buildClassifyDraft` in `reviewTriage.ts`, `classify-promo.ts`) was only skimmed; the plan must read it fully.
9. **Reader-call budget (A-08).** `readerPass.ts` reads every entry, in order candidates, review-worthy skips, then `remaining` (clear skips), under `DEFAULT_MAX_CALLS = 60` shared across a run. After the version bump the cache is cold, so every entry costs a call and the cap can be exhausted before candidates are read. Clear-skip entries are always kept as-is (`clear_reason_kept`, owner decision) so reading them has no effect except stats. Change: do not call the reader for entries in `CLEAR_SKIP_REASONS`; count them in a new `clearSkipsNotRead` stat. Order is already candidates-first, but the skip removes the waste. Add a test that a cold-cache run with N clear skips makes zero calls for them.
10. **FanDuel / Bally recon (A-07) - plan task shape.** Task A (investigation, produces fixtures, no production code): run the existing scrape list requests (`fanduelScraper.listRequest`, `ballybetScraper.listRequest`; plain HTTP, no login, per recon decision D-09) from a script, save raw bodies as new dated fixtures under `src/test/fixtures/promos/` (sanitized), grep for refund wording (`no sweat|bet back|second chance|stake back|bonus bet if|refund`), and write findings to a short RECON file listing, per book: exact entry titles, which field carries the wording (FanDuel `title`/`name`/`tags`; Bally list-card `title`/`description` plus detail page), where scope/cap/min-odds appear, and whether existing-customer vs acquisition tags separate them. Decision gate: if a real existing-customer no-sweat is found -> Task B adds a book-specific candidate builder + fixture-based parse tests; if none is live -> ship detection through the shared `classifyNoSweat` (title/name wording) plus reader rescue and unit tests on clearly-labelled synthetic strings, and record FD/Bally as "fixture pending" (FEED-01 for those two books then verified only when one appears; call this out in VERIFICATION). Known blockers from code: Bally's `isQualifyingTitle` (ballybet.ts:197-205) requires a boost/bonus keyword AND a `%`/`$` in the TITLE and calls `classifyExclusion(title)`, so "Second Chance Bet" (fixture `ballybet-promos.json`, description "Available on Select Days. Check Your Rewards Tab!") is dropped before any detail fetch; FanDuel's `classifyFanduelEntry` requires `BOOST_OR_BONUS_TOKEN_RE` (profit boost, odds boost, boost token, bonus bet(s), PBT) or it returns `not_a_promo`, so a "No Sweat" entry without those words never reaches a candidate. Both gates need a no-sweat bypass. FanDuel's acquisition tagging (`acq` tag, "first wager") already routes new-customer no-sweats to `new_customer`.
11. **Backfill (A-08/D-18), a finding that simplifies it.** `store.ts buildExpireUnseenStatement` expires every live (`active`/`pending_review`) scraped row of a book that is not among the run's dedupe keys. Because a reclassified no-sweat has a different dedupe key, the first successful scrape after deploy inserts the new `no_sweat` row and expires the stale mis-typed `bonus_bet` row automatically (hand-added rows with `added_by_user_id` are never expired). So scraped data self-heals in one run. Recommended script: read-only `scripts/audit-no-sweat.ts` (`tsx --env-file=.env.local`, dry-run by default) that lists live rows whose `raw_text` matches `classifyNoSweat` but `promo_type != no_sweat`, so the owner can verify post-scrape that nothing is left; a `--apply` mode (re-type + new dedupe key, or set `pending_review`/`classify` when uncertain; skip rows whose new key already exists) only if the audit finds survivors. Hand-added `bonus_bet` rows that are really no-sweats are the user's own data: list them, do not rewrite. Touching production data needs owner OK (project norm for migrations/data).
12. **FEED-02 regression test.** Use the known DK "NFL London No Sweat" text (`exclusions.test.ts:191-197`): (a) parser classification -> no_sweat bonus-bet-refund (not `bonus_bet`); (b) a reader mock returning `bonus_bet`/high confidence against the no_sweat parser candidate -> `review`, not `reader_preferred`; (c) a reader returning `no_sweat` against a parser `bonus_bet` -> `review`; (d) `toPromoRowDTO`/`rankPromoHedges` given a no-sweat is a type error plus a runtime guard test that `getActivePromos`'s SQL condition excludes it.

### Pattern 7: Settings storage (stake precision is NOT in Settings today)
D-21 says "Settings, next to stake precision". Precision is actually client localStorage (`STORAGE_KEYS.arbPrecision`, set on the Arbitrage tab; Opportunities/Promos read it with `usePersistentString` and send it as the action input). There is no precision control on `/settings`. The Settings page (SSR, `src/app/settings/page.tsx`) holds "My books" and per-book max bets (`SettingsBookCapsForm`, `user_book_caps`, `setBookCapAction`, `getMemberBookCaps` with `isUndefinedTableErrorFor` degrade-on-missing-table). Recommend mirroring that exactly: table `user_low_profile_settings(user_id PK -> users cascade, odds_cap_enabled bool default true, odds_cap_american int default 300, main_lines_only bool default false, natural_stakes bool default false, updated_at)`, `src/db/lowProfile.ts` (`getMemberLowProfile` returning `DEFAULT_LOW_PROFILE` when no row or table missing), `setLowProfileAction` (strict schema), and a `SettingsLowProfileForm` card on the Settings page. The plain-English copy rule applies to labels.

### Anti-Patterns to Avoid
- **Filtering no-sweats out at each call site.** One missed site leaks. Use SQL exclusion + narrowed type.
- **Adding `state` to `promo_completions` and relying on every reader to filter.** See alternatives.
- **Reading `activePromoWhere`/`computeMemberPromoState` at settle time.** The game has started, the promo is "not active".
- **Native number math for low-profile cap compares.** Compare `americanToDecimal` values.
- **Putting cant-price/tracking items in `sources`.** They get sliced by `pickTop(…, 5)`.
- **Valuing the refund at the full stake instead of the cap.** `solveNoSweat` already throws if `refundValue > min(stake, cap)`.
- **Writing the completion before checking game start / ownership on the server.** UI hiding is not enforcement.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| No-sweat hedge math | New formulas | `solveNoSweat`, `rankNoSweat` (Phase 8) | Oracle-tested, cent-exact, includes worst case |
| Refund valuation | A median/avg conversion stat | `makeConversionRateFor` / `rankRefundOpportunities` | Owner-locked: finder top-1, live |
| Bonus-bet hedge for "Bet lost" | New hedge calc | `rankBonusBetHedges` + `calculateBonusBetHedge` | Same as the finder |
| Optimistic concurrency on recompute | Custom diff | `isSameDisplayedProfit` | Existing mark-done pattern |
| Versioned snapshot parse | Ad-hoc JSON | zod schema with `version` literal + safeParse fallback (see `toDonePromoDTO`) | A bad row must not crash the Done tab |
| Undo | New delete logic | `unmarkPromoUsed` (pair-aware delete of completion row) | Already user-scoped and idempotent |
| Missing-table tolerance | try/catch ad hoc | `isUndefinedTableErrorFor(err, "table")` pattern from `bookCaps.ts` | Migrations are applied manually with owner OK |
| Day bucketing | Date math | `denverDate()` | Completion dates are Denver-day based |

**Key insight:** every hard part (math, valuation, hedging, undo, snapshots, concurrency) already exists. The work is wiring, with leak prevention as the design driver.

## Runtime State Inventory

(Phase 9 reclassifies existing mis-typed data, so this applies.)

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `promos` rows: scraped no-sweats stored as `bonus_bet` (e.g. pending row 94 / the 2026-10-08 misread); dedupe key includes `promo_type`; `promo_readings` cache keyed by prompt version; `promo_completions` rows may exist for mis-typed promos | Code: new type + detector. Data: self-heals via next scrape's expire-unseen (new dedupe key); read-only audit script to confirm; completions left untouched (historical, correct as recorded) |
| Live service config | GitHub Actions `scrape-promos.yml` runs the scraper 3x/day; reader needs `ANTHROPIC_API_KEY` | None for config; prompt-version bump makes the first run after deploy fully cache-cold (cost/cap, see Pitfall 6) |
| OS-registered state | None | None, verified: no OS task/launchd/pm2 registrations in repo scripts (only the GitHub workflow) |
| Secrets/env vars | `ANTHROPIC_API_KEY`, DB URL: names unchanged | None |
| Build artifacts | Migration 0018 not applied to prod until the owner applies it; code must tolerate missing tables (degrade pattern) | Ship the degrade-on-missing-table helpers; note "apply manually with owner OK" |

## Common Pitfalls

### Pitfall 1: Estimates leak into guaranteed numbers
**What goes wrong:** no-sweat priced as a bonus bet (`rankPromoHedges.ts:251`), recorded to grey line / `profit_snapshots`, counted in Statistics funnel.
**How to avoid:** `GuaranteedPromoType` narrowing; `getActivePromos` SQL `promo_type <> 'no_sweat'`; `buildFunnelPromosQuery` and `buildDailyProfitHistoryQuery` add the same exclusion (explicit decision per A-01: **no-sweats are excluded from the Statistics funnel/book-health**, since it measures guaranteed-promo yield, and a 0-profit no-sweat row would depress it). Invariant tests (Validation section).
**Warning signs:** dashboard "available" changes when a no-sweat is added; `member_profit_observations` rows for a no_sweat promo id.

### Pitfall 2: Tracked/settled no-sweat counted wrong
Counts/averages/Done list/green line all read `getPromoCompletions` (`dashboardTotals.ts:46-53, 77`; `profitSeries.ts:84-87`). With the recommended design they only ever see settled rows dated `completedAt = settle time`. With the `state`-column alternative every consumer needs a filter.

### Pitfall 3: Settling after kickoff finds nothing
`activePromoWhere` requires `event_commence_time > now` (db/promos.ts:316-330). Settle/complete must use only the stored snapshot (+ cached odds for the refund hedge, which is for a different future game).

### Pitfall 4: Non-atomic writes on neon-http
No interactive transactions. Keep each user action to ONE write (completion insert, or one state UPDATE). Do not split "record profit" and "advance state" across statements.

### Pitfall 5: Reader overrides parser on a no-sweat misread
`reconcile.ts:237` lets a high-confidence reader win. The 2026-10-08 failure (no-sweat stored as bonus bet) is exactly this class. Rule must precede that branch (A-05).

### Pitfall 6: Cold reader cache after prompt bump exhausts the 60-call cap
See Ingestion item 9.

### Pitfall 7: "Settings next to stake precision" assumption
Precision is localStorage, not a Settings control; do not look for a precision settings table to extend (none exists). Natural-stakes setting overrides precision only inside `rankNoSweatFeed`.

### Pitfall 8: Existing tests mock `@/db/promos` with only `getActivePromos`
`get-opportunities.test.ts` (and likely `get-promos.test.ts`, `refresh-*.test.ts`) mock the module with a single export. Adding `getActiveNoSweatPromos` / `getMemberLowProfile` / tracked-row reads to `getOpportunities`/`loadMemberFeedContext` breaks them unless mocks are extended. Plan test updates in the same task that changes the context loader. Also keep `loadMemberFeedContext`'s return shape additive.

### Pitfall 9: Racing/other "No Sweat"-category entries
DK files racing "Bet Back with Portnoy!" under category "No Sweat" (refund in "Crown Cash"). It must stay skipped (unsupported sport / non-single-game). Regression test on `draftkings-promos-2026-09-28.json`: zero no_sweat candidates.

### Pitfall 10: Hand-added no-sweat management
Added promos are edited/deleted/expired from Promos-tab rows (`AddedPromoActions`). If no-sweats are excluded from `get-promos`, a member cannot edit or delete a hand-added no-sweat. Plan must give no-sweat rows in Opportunities the same `AddedPromoActions` menu (or add a minimal list in the Promos tab). See Open Question 1.

### Pitfall 11: `duplicateHint.ts`, `describe.ts`, `yourCap.ts`, `leagueWideAltTargets.ts`, `altSpreads.ts`
In the A-02 list; most take `promoType` and branch. The compiler (after narrowing) will flag them; for each, decide "n/a for no-sweat" via `assertNever` on a narrowed type rather than a default branch.

## Code Examples

### Low-profile odds-cap comparison (never compare raw American ints)
```typescript
// Source: pattern from src/domain/promos/rankNoSweat.ts meetsMinOdds
import { americanToDecimal } from "@/domain/hedge/americanOdds";
function withinOddsCap(q: SelectionQuote, capAmerican: number | null): boolean {
  if (capAmerican === null) return true;
  return americanToDecimal(q.oddsAmerican).lte(americanToDecimal(capAmerican));
}
```

### Bet-won profit from the snapshot (exact, no live odds)
```typescript
// Source: src/domain/hedge/noSweat.ts (profitIfWin = qualifyingWinnings - hedgeStake)
const profit = actualProfit ?? snapshot.estimate.profitIfWin; // 2dp decimal strings
const profitExtracted = new Decimal(profit).toFixed(2);
```

### Bet-lost real total
```typescript
// hedgePayout and hedgeStake and qualifyingStake come from the snapshot; refundProfit from rankRefundOpportunities
const total = new Decimal(s.hedge.payout).minus(s.hedge.stake)
  .minus(s.qualifying.stake)
  .plus(actualProfit ?? refundProfit);
```

### Exhaustive switch helper
```typescript
export function assertNever(x: never): never {
  throw new Error(`Unhandled promo type: ${String(x)}`);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `no_sweat` as a clear **skip** reason (quick-261016-k8a) | `no_sweat` as a real promo type | This phase | Reader prompt, triage, exclusions change together |
| Binary boost/bonus branching | Exhaustive switch + narrowed guaranteed type | This phase (D-19) | Compile-time leak protection |
| Completion row = done at mark time | Completion row written at settle time for no-sweats | This phase | Settle-dated totals with no consumer changes |

**Deprecated/outdated:** `"no_sweat"` in `CLEAR_SKIP_REASONS` and `NO_SWEAT_RE` inside `classifyExclusion` (replace by `classifyNoSweat`; update the `exclusions.test.ts:191-197` test, which currently asserts `no_sweat` is a skip).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Push/void should default to $0 (both legs voided) with an editable actual-profit override | Pattern 4 | If only one leg voids, default is wrong unless user edits; owner already marked "to confirm" |
| A2 | New table `tracked_no_sweats` is acceptable instead of a `state` column on `promo_completions` | Alternatives / Pattern 4 | Owner/planner may prefer A-04's literal wording; both satisfy the outcomes, table is safer |
| A3 | Excluding no-sweats from the Statistics funnel/book-health is the right call | Pitfall 1 | Owner might want them counted as "scraped promos"; low impact |
| A4 | FanDuel/Bally have (or will have) live existing-customer no-sweat entries detectable from list/detail text | Ingestion 10 | May find none; then FEED-01 for those books cannot be fixture-verified this phase |
| A5 | `reconcile` should send no-sweat refund-cap mismatches to review even when the reader is high confidence | Ingestion 7 | Slightly more review items; safer |
| A6 | DraftKings regex for cap ("MAX REWARD: $N", "up to $N") covers real wording | Ingestion 4 | Only one real text sample known; reader verbatim guard is the backstop |
| A7 | "$5 steps" for natural stakes is deferred (solver supports only $1 and $0.01) | Pattern 3 | If owner wants it, Phase 8 solver needs a unit parameter |
| A8 | Scraped mis-typed rows self-heal via expire-unseen on the next successful scrape | Ingestion 11 | If a book's scrape fails or yields zero candidates, rows linger (store refuses to mass-expire); audit script covers it |
| A9 | Disagreement side-by-side data can be carried as an optional structured `evidence.readings` | Ingestion 8 | Review/classify code only skimmed; may need more UI plumbing |

## Open Questions (RESOLVED)

1. **Where can members see/manage hand-added no-sweats outside the feed?**
   - Known: Promos tab (`get-promos.ts`) uses `getActivePromos`, which will now exclude no-sweats; edit/delete/expire live in Promos-tab rows.
   - Unclear: whether Phase 9 should add a minimal "No-sweat promos" list/menu in the Promos tab or put `AddedPromoActions` on the Opportunities no-sweat row.
   - Recommendation: put the added-promo actions on the Opportunities no-sweat row (and on the Tracking card for untrack); defer a Promos-tab section. Ask the UI-SPEC step to decide.
   - RESOLVED: Edit / Expire now / Delete live on the Opportunities no-sweat row and note rows (plan 09-15), hosted by the Opportunities screen's edit form (plan 09-18); server side and tracked/done guard in plan 09-13.
2. **Negative-estimate no-sweats (D-11):** Opportunities lists only positive rows today; unprofitable rows live only in the Promos tab. Recommendation: omit non-positive no-sweats from Opportunities and show nothing (count only, for the empty-state logic) unless the UI-SPEC wants a collapsed "Not worth it right now" list.
   - RESOLVED: estimate <= 0 goes to a greyed "Not worth it right now" note row in the unsliced bottom section, never the ranked list (plans 09-06 notWorthIt, 09-12 noSweatNotes, 09-15/09-18 rendering).
3. **FanDuel/Bally live shape** (Ingestion 10) is unknown until recon.
   - RESOLVED: recon plan 09-04 writes a BUILD / FIXTURE PENDING decision per book that gates plans 09-10 (DraftKings) and 09-11 (FanDuel, Bally); 09-18 discloses any "fixture pending" book.
4. **Owner confirmation of Push/void default** (A1).
   - RESOLVED (pending owner veto): Push and Game voided record $0.00 by default with a "What you actually made" override (plans 09-07, 09-14, 09-16); the owner may veto at the 09-18 checkpoint.
5. **Is a stored cash-refund no-sweat ever shown?** Per D-17 no; review only.
   - RESOLVED: cash refunds are review-only (no_sweat_cash review reason, plans 09-03, 09-08; review card in 09-17/09-19); never priced (D-17).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node / npm / npx | tests, tsx scripts | yes | node >=22.13 per package.json | none needed |
| Vitest | all tests | yes | existing (runs `src/**/*.test.ts`) | none |
| drizzle-kit | migration 0018 | yes | 0.31.x (npm script `db:generate`) | hand-write SQL |
| Postgres/Neon (prod) | applying migration, audit script | not accessed by research | n/a | migration applied manually by owner |
| Network to sportsbook list endpoints | FD/Bally/DK recon task | not tested in this session | n/a | synthetic fixtures + reader rescue |
| ANTHROPIC_API_KEY | reader smoke (`promos:reader-smoke`) | not checked | n/a | unit tests use a mock `PromoReader` |

**Missing with no fallback:** none blocking. **Note:** git `origin/main` was fetched; no new commits beyond local HEAD, newest migration is 0017. Re-fetch immediately before `db:generate` (teammate pushes migrations to main); if a teammate migration 0018 lands first, take 0019 and let drizzle-kit regenerate its snapshot/journal.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (node env, alias `@`) |
| Config file | `vitest.config.ts` (exists) |
| Quick run command | `npx vitest run src/domain/promos/rankNoSweat.test.ts` (~1s) or by path/pattern |
| Full suite command | `npm test` (= `vitest run`); also `npm run typecheck` (compile-time leak guard is part of validation) and `npm run lint` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FEED-01 | DK existing-customer no-sweat (NFL London text/fixture) becomes a `no_sweat` candidate with cap 10.00, min odds, scope, opt-in | unit (fixture) | `npx vitest run src/ingestion/promos/books/draftkings.test.ts` | extend, ❌ new fixture Wave 0 |
| FEED-01 | New-customer no-sweat -> `new_customer` skip -> Sign-up offers, headline not a guaranteed bonus | unit | `npx vitest run src/ingestion/promos/exclusions.test.ts src/ingestion/promos/signupOffers.test.ts` | extend ✅ |
| FEED-01 | Parlay/SGP no-sweat stays skipped with `parlay`/`sgp` (order fix A-06); cash refund -> review reason; racing "Bet Back" stays skipped | table-driven unit | `npx vitest run src/ingestion/promos/exclusions.test.ts src/ingestion/promos/noSweat.test.ts` | ❌ Wave 0 (noSweat.test.ts) |
| FEED-01 | Tightened `first-bet` rule loses no previous `new_customer` classification across all 12 fixture files | fixture-sweep snapshot | `npx vitest run src/ingestion/promos/exclusions.fixtures.test.ts` | ❌ Wave 0 |
| FEED-01 | FD/Bally parse real no-sweat fixtures (only if recon finds them) | unit (fixture) | `npx vitest run src/ingestion/promos/books/fanduel.test.ts src/ingestion/promos/books/ballybet.test.ts` | extend; fixture ❌ gated on recon |
| FEED-02 | Reader `no_sweat` vs parser `bonus_bet` (and reverse) -> review at ALL confidence levels (table-driven low/med/high) | unit | `npx vitest run src/ingestion/promos/reconcile.test.ts` | extend ✅ |
| FEED-02 | Reader schema accepts `no_sweat` + `refundForm`; prompt version changed; cache key differs from old version | unit | `npx vitest run src/ingestion/promos/promoReading.test.ts src/ingestion/promos/verbatimGuard.test.ts` | extend ✅ |
| FEED-02 | Reader not called for clear-skip entries; cold-cache run stays under cap | unit | `npx vitest run src/ingestion/promos/readerPass.test.ts` | extend ✅ |
| FEED-02 | A no-sweat is never priced as a bonus bet: `getActivePromos` SQL excludes it; `GuaranteedPromoType` (typecheck); no_sweat `PromoRowDTO` impossible | unit + typecheck | `npx vitest run src/db/promos.test.ts && npm run typecheck` | extend ✅ |
| FEED-02 | Backfill/audit script classifies the London text as no_sweat, leaves hand-added rows alone, dry-run writes nothing | unit | `npx vitest run src/ingestion/promos/noSweatAudit.test.ts` | ❌ Wave 0 |
| FEED-03 | `rankNoSweatFeed`: sorts by estimate, est<=0 omitted, cant_price in separate unsliced list, Est. ROI = est/(qual+hedge), ties deterministic | table-driven unit | `npx vitest run src/domain/promos/rankNoSweatFeed.test.ts` | ❌ Wave 0 |
| FEED-03 | Low-profile: odds cap (decimal compare, +300 default), main-lines-only drops alt, natural stakes whole $, best allowed line chosen, `filteredOut` count, warnings when protection off | table-driven unit | `npx vitest run src/domain/promos/rankNoSweat.test.ts` | extend ✅ (22 existing must stay green) |
| FEED-03 | Opportunities response: no-sweat items in `promos` source flagged `estimated`, "Est. ROI" label, `cantPrice`/`tracking` outside `sources`, empty-state counts no-sweats | integration (mocked db) | `npx vitest run src/app/actions/get-opportunities.test.ts` | extend ✅ (update mocks, Pitfall 8) |
| FEED-04 | Estimates-never-leak invariant 1: dashboard totals, `profitSeries` and `buildDashboardTotals` output identical with vs without untracked/tracked no-sweat promos present | property/integration | `npx vitest run src/app/actions/get-opportunities.test.ts -t "unchanged by no-sweat"` | ❌ Wave 0 |
| FEED-04 | Invariant 2: `recordMemberFeedObservations` / `morningObserve` / `recordCurrentProfitObservations` write zero rows for a no_sweat promo id (mocks assert call args) | integration | `npx vitest run src/db/memberFeedRecording.test.ts src/db/memberObservations.test.ts src/db/promoObservations.test.ts` | extend ✅ |
| FEED-04 | Invariant 3: stats funnel/daily-history queries exclude `no_sweat` (query-builder SQL assertion like existing `profitHistory.test.ts`) | unit | `npx vitest run src/db/profitHistory.test.ts` | extend ✅ |
| FEED-04 | Invariant 4: pairing ignores no_sweat (type-level + runtime filter) | unit | `npx vitest run src/domain/promos/pairPromos.test.ts` | extend ✅ |
| FEED-04 | Tracked (unsettled) rows contribute $0 to extracted totals/counts/averages; settled rows contribute on settle day (Denver), not track day | unit | `npx vitest run src/domain/promos/dashboardTotals.test.ts src/domain/promos/profitSeries.test.ts` | extend ✅ |
| FEED-05 | Track: server recompute, `odds_changed` on estimate drift, idempotent double-tap, rejects non-owner/inactive promo | action test | `npx vitest run src/app/actions/track-no-sweat.test.ts` | ❌ Wave 0 |
| FEED-05 | Settle won: profit = snapshot `profitIfWin`, works when promo no longer "active" (kickoff passed), rejected before kickoff (server-side), override validated 2dp/bounded | action test | same file | ❌ Wave 0 |
| FEED-05 | Settle lost -> `awaiting_refund`, no completion row; complete-refund total = hedgePayout - hedgeStake - stake + refundProfit (table of hand-computed cases incl. cap < stake); push -> 0.00 default + override | table-driven unit | `npx vitest run src/domain/promos/noSweatSettle.test.ts` | ❌ Wave 0 |
| FEED-05 | Undo steps back one state (completion removed, tracked row survives at stored state); snapshot v2 parse fallback ("Saved details unavailable") never crashes Done tab | unit | `npx vitest run src/domain/promos/doneSnapshot.test.ts src/db/promoTracking.test.ts` | extend ✅ |
| FEED-05 | Refund card: `rankRefundOpportunities(limit:1)` equals `topConversionFor` (no divergence); amount = min(stake, cap) | unit | `npx vitest run src/domain/hedge/conversionRate.test.ts` | extend ✅ |
| D-21 | Low-profile settings: defaults when no row / table missing; strict action schema; owner-scoped | unit | `npx vitest run src/app/actions/set-low-profile.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** the single touched test file(s) via `npx vitest run <path>` plus `npm run typecheck` when types/switches change.
- **Per wave merge:** `npm test` and `npm run typecheck`.
- **Phase gate:** full suite + typecheck + lint green before `/gsd:verify-work`; plus the three FEED-04 invariant tests named above.

### Wave 0 Gaps
- [ ] `src/ingestion/promos/noSweat.test.ts` (+ module) - detector order, widened wording, cash detection, parlay-first.
- [ ] `src/ingestion/promos/exclusions.fixtures.test.ts` - committed expected `{fixture, entry} -> reason` map generated BEFORE changing the first-bet regex.
- [ ] DK no-sweat fixture (live fetch or labelled reconstruction) under `src/test/fixtures/promos/`.
- [ ] `src/domain/promos/rankNoSweatFeed.test.ts`, `noSweatSettle.test.ts`, `noSweatSnapshot.test.ts`.
- [ ] `src/app/actions/track-no-sweat.test.ts`, `set-low-profile.test.ts`.
- [ ] Update mocks in `get-opportunities.test.ts`, `get-promos.test.ts`, `refresh-*.test.ts` for the new `@/db/*` exports.
- [ ] Shared test builders for `ActiveNoSweatPromo` and a tracked snapshot.
- No new framework install needed.

## Security Domain

`security_enforcement` is not disabled in `.planning/config.json` (no key), so it applies.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no (unchanged) | iron-session, existing |
| V3 Session Management | no (unchanged) | existing |
| V4 Access Control | yes | `requireUser()` first statement; every read/write filtered by session `user_id`; strict schemas with no `userId` field; tracked-row ownership via PK `(user_id, promo_id)`; viewer visibility rule for hand-added promos (`promoVisibilityCondition`) |
| V5 Input Validation | yes | `z.strictObject` for track/settle/complete/low-profile inputs; 2dp decimal regex + bounds for `actualProfit` and caps; cap compared as whole cents; reader output re-validated by `PromoReadingSchema` and `verbatimGuard` |
| V6 Cryptography | no | n/a |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| IDOR on promoId (tracking/settling another member's row) | Elevation | session user id in every WHERE; no userId in input |
| Client-supplied profit trusted | Tampering | server computes from snapshot; `actualProfit` is a bounded, audited override stored with `profitSource` |
| Settling before game start / double settle | Tampering | server-side time check; idempotent `ON CONFLICT DO NOTHING` insert |
| Hallucinated reader numbers reach money math | Tampering | existing verbatim guard; refund cap required to be guard-backed; no-sweat disagreements go to review |
| Prompt injection via scraped promo text | Tampering | existing structured-output + guard + reconcile; no-sweat never auto-priced on reader-only authority when it disagrees |
| Advice that encourages evading book limits | n/a (policy) | D-20 copy: never mention multiple accounts/VPNs/location tricks |

## Suggested Plan Breakdown (waves)

**Wave 0 - Foundation (no behavior change; unblocks everything; can be 2 parallel plans)**
- 09-01 Types and leak guard: widen `PROMO_TYPES`; `GuaranteedPromoType`; `assertNever`; narrow `RankablePromo`; make `getActivePromos` exclude `no_sweat` + add `getActiveNoSweatPromos` + `ActiveNoSweatPromo`; fix every compile error from A-02 list with explicit "n/a for no_sweat" handling; funnel/daily-history queries exclude `no_sweat`; update mocks. Gate: typecheck + full suite green, no behavior change.
- 09-02 Schema: `git fetch`, migration 0018 (`tracked_no_sweats`, `user_low_profile_settings`), db modules with missing-table degrade, snapshot v2 zod schemas + `DonePromoDTO` kind `no_sweat` (label "No-sweat"). [Owner applies migration manually.]

**Wave 1 - Domain (parallelizable after Wave 0)**
- 09-03 `rankNoSweat` low-profile + market limit + `fromAlternate` marker + `noSweatScope` expiry; `lowProfile.ts`; `rankNoSweatFeed`; `NoSweatRowDTO`; Est. ROI; `rankRefundOpportunities` refactor of `conversionRate.ts`.
- 09-04 Ingestion core: `classifyNoSweat`, `exclusions.ts` reorder/tightening (+ fixture-sweep test first), `ScrapedPromo` no_sweat rules, reader schema/prompt/version bump, `reconcile` rules, `reviewTriage` reasons, `readerPass` clear-skip budget fix, structured `evidence.readings`.

**Wave 2 - Integration**
- 09-05 DraftKings no-sweat candidate builder + fixture + tests (depends on 09-04). 
- 09-06 Recon task for FanDuel and Bally (can start in Wave 0 in parallel since it only produces fixtures/notes), then book-specific builders if found (depends on 09-04 + recon).
- 09-07 Server: `getOpportunities` composition (separate path, one conversion fn, response fields `tracking`/`cantPrice`, empty-state, price-age incl. conversion game), `track-no-sweat.ts` actions, low-profile action + Settings form data loaders, invariant tests (depends on 09-02, 09-03).
- 09-08 Manual add: `AddPromoForm` NoSweatFields, `addedPromoInput`/`buildAddedPromo`/`addPromoDraft`/`duplicateHint`/`addedPromoPipeline` (any book with odds, whole-cent cap validation) (depends on 09-01, 09-03).

**Wave 3 - UI (UI-SPEC from `/gsd-ui-phase` first)**
- 09-09 Opportunities: no-sweat row (est. label, rate, worst case, warnings, Track), Tracking strip (outcome buttons after kickoff, Bet-lost refund card, waiting reminder, undo), cant-price list, Est. ROI sort label, Done tab no-sweat row, Settings Low-profile card, review card side-by-side (depends on 09-07).

**Wave 4 - Cleanup**
- 09-10 Audit script (read-only), end-to-end invariant tests, FEED-01..05 verification checklist (FD/Bally "fixture pending" disclosure if applicable).

**UI integration points to hand to the UI-SPEC:** `OpportunitiesScreen.tsx` (new Tracking strip above sources; cant-price section below), `OpportunitySection`/`PromoRow` (branch on `data.kind`), `SortSwitch`/`sortCaption` (Est. ROI label), `RiskAdvisory.tsx` (no-sweat copy), `DonePromoRow.tsx` (no-sweat final snapshot), `QueueItemCard.tsx`/`ClassifyQueueCard.tsx` (two-reading side-by-side + three buttons), `AddPromoForm.tsx` (new type), `src/app/settings/page.tsx` (Low-profile card), `AppShell` `promosVersion` bump after Track/Settle/Undo so the screens refetch.

## Sources

### Primary (HIGH confidence): codebase, read this session
- `.planning/phases/09-no-sweat-promos-in-the-feed/09-CONTEXT.md`; `CLAUDE.md`; `.planning/config.json`
- `src/domain/hedge/noSweat.ts`, `conversionRate.ts`, `rankBonusBetHedges.ts` (header); `src/domain/promos/rankNoSweat.ts`, `rankPromoHedges.ts` (RankablePromo, line ~251 ternary), `memberFeed.ts`, `selection.ts` (alt spreads, enumerate), `doneSnapshot.ts`, `dashboardTotals.ts`, `profitSeries.ts`, `dedupe.ts`, `scraped.ts`, `types.ts`, `priceAge.ts`
- `src/db/schema.ts`, `promos.ts` (activePromoWhere, mapActivePromoRow), `promoTracking.ts`, `memberPromoState.ts`, `feedContext.ts`, `memberFeedRecording.ts`, `profitHistory.ts`, `bookCaps.ts`
- `src/app/actions/get-opportunities.ts`, `mark-promo-used.ts`, `set-book-cap.ts`, `src/domain/opportunities/{types,pick}.ts`, `src/components/opportunities/OpportunitiesScreen.tsx`, `src/app/settings/page.tsx`, `src/lib/persistentState.ts`
- `src/ingestion/promos/{exclusions,promoReading,reconcile,readerPass,reviewTriage,store}.ts`, `books/{draftkings,ballybet,fanduel}.ts`, `exclusions.test.ts:191-197`
- Fixtures under `src/test/fixtures/promos/` (12 files; DK 2026-09-28 racing "No Sweat" entry; Bally "Second Chance Bet" card)
- `drizzle/` listing and `drizzle/meta/_journal.json` (newest 0017); `git fetch` + `git log origin/main`
- Vitest run of `rankNoSweat.test.ts`: 22 passed

### Secondary / Tertiary
- None. No web sources were used; no external library API was researched (no new dependencies). Sportsbook-side wording beyond the DK test string and the two fixtures is untested.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; all reuse verified in code.
- Architecture (leak prevention, tracking table, refund pricing, low-profile threading): HIGH on mechanics (read the call graph); MEDIUM on the "table vs state column" choice being accepted by the owner.
- Ingestion: HIGH for exclusions/reconcile/reader/readerPass mechanics; MEDIUM for DK real-world wording (one sample, no fixture); LOW-MEDIUM for FanDuel/Bally (no fixtures, recon needed).
- Pitfalls: HIGH (each tied to a file:line).
- Review/classify UI plumbing (D-15): MEDIUM (skimmed `buildReviewSkip` only).

**Research date:** 2026-10-22
**Valid until:** ~2026-11-05 (fast-moving: teammate pushes migrations and sportsbook promo copy changes weekly)
