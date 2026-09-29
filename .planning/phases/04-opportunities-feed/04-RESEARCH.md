# Phase 4: Opportunities Feed - Research

**Researched:** 2026-09-29
**Domain:** Pure-domain betting math (paired promos), pair discovery + matching, server-action/DTO integration, tab restructure (Next.js 16 / Base UI Tabs)
**Confidence:** HIGH on codebase integration and the pair math (derived, then checked against a brute-force oracle); MEDIUM on two product-level defaults flagged in Open Questions.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Opportunities is a new, separate tab named "Opportunities". First tab and the tab the app opens on. Top-level tabs (updated 2026-09-29 during UI-SPEC): Opportunities | Arbitrage | Promos | Tools. Tools holds the Bonus bets finder and Sign-up offers (as sub-sections/sub-tabs).
- **D-02:** Opportunities is the site-wide "best money right now" view, not a replacement for the Promos tab. Build it as a set of **sources** so more can be added later (Kalshi/Polymarket) without reworking the screen.
- **D-03:** Phase 4 sources: promo hedges (each active promo's best single hedge), paired promos (new), arbitrage (cached-odds arbs). Bonus-bet finder results are NOT a source.
- **D-04:** Top 5 per source, as grouped sections ("Best promos", "Best pairs", "Best arbs"). Each section can link to its full tab.
- **D-05:** Profit summary (Total profit available, Total profit extracted, today/week/month available) sits at the top of Opportunities. (Whether it also stays on Promos is Claude's discretion; avoid duplication.)
- **D-06:** (updated 2026-09-29) Review queue ("Needs review", "Needs a look") and scrape freshness lines live inside the Promos tab as a sub-section/sub-tab alongside Active and Done (Active | Done | Review (N)), not a top-level tab.
- **D-06a:** Sections Best promos and Best arbs get "See all" links that switch to the Promos / Arbitrage tab.
- **D-06b:** Under the ROI sort, bonus-bet promos rank by their conversion %, mixed in one ordering with boosts' and arbs' ROI; each row labels which % it shows.
- **D-07:** A pair shows as one combined card: both legs (book, side, odds, stake), paired guaranteed profit and ROI, and beneath it "vs. $X + $Y hedging each separately".
- **D-08:** Show a pair only when pairing beats hedging each promo separately (paired profit > sum of the two single-hedge profits).
- **D-09:** Pair types: boost + boost and boost + bonus bet. Not bonus + bonus. Each leg's promo mechanics and caps apply (max stake, max winnings, min odds, stake-not-returned for bonus bets). Exact decimal math (decimal.js).
- **D-10:** Best pair per promo: each promo appears in at most one pair, the most profitable non-conflicting combination.
- **D-11:** Mark done on a pair marks both promos done, saving one snapshot (both legs, stakes, odds, paired profit) and adding the paired profit once to Total profit extracted. Reuse the 260929-igk snapshot/odds-changed rules (server recomputes; reject if odds changed since load).
- **D-12:** Total profit available counts a winning pair once, using the pair's profit in place of its two single-hedge profits.
- **D-13:** A profit / ROI sort switch at the top of both Opportunities and Promos. On Opportunities it re-picks the top 5 in every section.
- **D-14:** Default sort is guaranteed profit ($).
- **D-15:** Choice remembered per device (browser storage, wrapped so it degrades to the default).
- **D-16:** Opportunities excludes promos at books the member doesn't have.
- **D-17:** Hedge side limited to the member's own books everywhere on Opportunities.
- **D-18:** Pairs and arbs require both books to be the member's.
- **D-19:** Promos tab keeps its current rule (other-book promos dimmed and sorted last).

### Claude's Discretion
- Exact card layouts, section headings, empty states, how odds age / "odds changed" is surfaced (follow 03-UI-SPEC and existing PromoRow / ArbRow).
- Whether "see all" links switch tabs in place or are omitted (UI-SPEC defaulted: switch in place).
- Pair search algorithm (matching opposite outcomes across books within each promo's scope; choosing non-conflicting best pairs); must be exact and fixture-tested.
- Whether the profit summary is shown once (Opportunities) or on both tabs (UI-SPEC defaulted: Opportunities only).

### Deferred Ideas (OUT OF SCOPE)
- Kalshi / Polymarket arbitrage as an Opportunities source (Out of Scope; structure as sources only).
- Scheduled scrape never fires (infrastructure, not a Phase 4 feed capability).
- Phase 5 note: add-promo game selection should use the 260929-hht search/date-range picker.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DASH-01 | Ranked feed of opportunities from current promos + cached odds with promo, best hedge book, both stakes, guaranteed profit, ROI/conversion | Sources model (Section "Sources abstraction"); reuse `rankPromoHedges` + `toPromoRowDTO` + `rankArbs`; new `findPairs` |
| DASH-03 | Filter to the user's books on promo and hedge side | Already satisfied by inputs: `getHedgeBookKeys(userBookSet)` for hedge side, `hasPromoBook` for promo side; pairs require both books in set (see "Book filtering") |
| DASH-05 | Tandem opportunities shown with profit vs. hedging each separately | `PairOpportunity` carries `separateProfitA/B`, D-08 strict-beat gate, pair card DTO |
| CALC-07 | Exact stakes/profit for paired promos with each leg's mechanics + caps | `src/domain/hedge/pairMath.ts` (two solvers), derivations + hand/oracle test vectors below |
</phase_requirements>

## Summary

The feed is almost entirely composition of code that already exists. Promo hedges come from `rankPromoHedges` + `toPromoRowDTO` (unchanged), arbs from `rankArbs` (needs the market-building and DTO mapping extracted out of the `"use server"` `find-arbs.ts`, exactly as `promoRowDto.ts` was extracted from `get-promos.ts`). The only genuinely new domain work is (1) a two-promo solver (`pairMath.ts`), (2) pair discovery + exact non-conflicting selection (`pairPromos.ts`), and (3) pair Mark-done/Undo persistence.

Key math finding: a paired-promo solve is a 1-D concave maximization once you express each leg's stake as the minimum stake that achieves a target payout T. The optimum always sits at a breakpoint (a max-stake limit or a winnings-cap kink on either leg), so the solver is "enumerate breakpoint stakes, cross-seed the other leg by inverting its payout function, search a small +/-4-unit window around each, evaluate exactly with cent-floored payouts, keep the max". I prototyped exactly this and compared it with an exhaustive whole-dollar brute force on ~3,850 random boost+boost cases (net_winnings, total_payout, boost_extra, max-stake binding): zero profit mismatches at a +/-4-unit window (+/-2 misses about 1 in 400 because of cent flooring). A boost+boost pair is only ever profitable when the boosted implied probabilities sum to less than 1 (it is a true arb at boosted prices); a boost+bonus pair is profitable whenever the boost odds exceed 1, with profit W(1 - 1/O_boost) in the uncapped case.

Persistence needs **no migration**: `promo_completions` is already one row per (user, promo). A pair Mark-done writes two rows in ONE multi-row INSERT: the primary row carries the pair snapshot and the pair profit, the partner row carries a tiny "pair member" snapshot with profit `0.00`. `sumProfitExtracted` therefore counts the pair once with zero changes, and Undo deletes both ids in one statement.

**Primary recommendation:** Build `pairMath.ts` + `pairPromos.ts` as pure decimal.js modules first, gated by an exhaustive-brute-force oracle test; then a single `getOpportunities` server action that composes existing rankers; then AppShell/tab restructure with a `promosVersion` counter so Opportunities and Promos refetch together after any Mark-done.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Pair stake/profit math | API / Backend (pure domain module) | — | Money math must be server-side, decimal.js, unit-tested; client never computes |
| Pair discovery + non-conflicting selection | API / Backend (pure domain) | — | Needs cached odds + raw promos (not exposed to client) |
| Book filtering (own books) | API / Backend | — | `userBookSet` derived from session user id only |
| Top-5 pick + sort (profit/ROI) | Browser / Client (pure fn) | API (returns full ranked lists) | UI-SPEC: re-rank client-side without refetch; the same pure `pickTop` is unit-tested |
| Sort preference persistence | Browser / Client | — | localStorage via `usePersistentString` |
| Mark pair done / Undo | API / Backend (server action) | Database | Server recomputes, compares expected profit, writes rows |
| Profit totals (available/extracted) | API / Backend | — | Includes pair dedupe (D-12) |
| Tab shell, keepMounted, See-all navigation | Browser / Client (AppShell) | — | Pure client state |
| Odds data | Database (cached_odds tables) | — | Never spends API credits on view |

## Standard Stack

No new packages. Everything already in `package.json`:

| Library | Version | Purpose | Notes |
|---------|---------|---------|-------|
| decimal.js | ^10.6.0 | All money math | Use `Decimal.clone({ precision: 40 })` + `clean()` (20dp snap) + cent floor, exactly as `profitBoost.ts`/`bonusBet.ts` do |
| drizzle-orm / @neondatabase/serverless | 0.45.x / 1.1 | Persistence | neon-http has no interactive transactions: use ONE multi-row `insert().values([a, b])` or `db.batch([...])` (already used by `save-books`) |
| zod | 4.x | Server-action input validation | Strict objects, no `userId` field |
| vitest | ^5.0.2 | Tests | `environment: "node"`, `include: ["src/**/*.test.ts"]`: **no jsdom, no component tests** -> UI logic must live in pure `.ts` modules |
| @base-ui/react (via shadcn) | existing | Tabs, ToggleGroup, Collapsible | Already nested-Tabs precedent in `PromosScreen` |

**Package legitimacy:** no external packages are installed by this phase, so no slopcheck audit is required. (`## Package Legitimacy Audit`: N/A. Packages removed: none. Flagged: none.)

**Environment availability:** no new external dependencies (code/config only; Node + Vitest already used). Skipped.

## Architecture Patterns

### System Architecture Diagram

```
Browser (AppShell: activeTab, sort pref via usePersistentString, promosVersion counter)
   |  getOpportunities({precision, arbTotalStake})   (server action; requireUser FIRST)
   v
 getOpportunities
   |-- session userId -> getUserBookKeys -> userBookSet -> getHedgeBookKeys(userBookSet)
   |-- getActivePromos(now) minus user's completed promo ids          --> feedPromos
   |-- getCachedEvents() + getCachedExtendedEvents()                   --> odds (0 credits)
   |
   |-- SOURCE 1 promos:  rankPromoHedges(feedPromos, opts) -> toPromoRowDTO -> filter hasPromoBook
   |        (singles map: promoId -> guaranteedProfit; also used for D-08 comparison)
   |-- SOURCE 2 pairs:   candidatesFor(promo) per own-book promo
   |                      -> index by marketKey (event|market|homePoint/line)
   |                      -> for each promo pair (different books, opposite sides on same marketKey)
   |                           cheap upper-bound prune -> pairMath solver (boost+boost | boost+bonus)
   |                           keep best market per (A,B); keep only if pairProfit > singleA + singleB (D-08)
   |                      -> selectPairs(): exact max-weight matching on gain (D-10)
   |                      -> toPairRowDTO
   |-- SOURCE 3 arbs:    buildMarkets(... allowed = user hedge books) -> rankArbs(all-sport scope, arbTotalStake) -> DTO
   |-- profit totals:    sumPortfolioProfit(singles, chosenPairs) (D-12), totalExtracted (unchanged), availableProfit
   v
 OpportunitiesResponse { promoRows[], pairRows[], arbRows[], totals, emptyVariant, oddsFetchedAt }
   v
 Browser: pickTop(items, sort, 5) per source (pure, tested) -> OpportunitySection x3
   Mark pair done -> markPairDoneAction({promoIdA, promoIdB, precision, expectedGuaranteedProfit})
        -> server recompute pair for exactly those two promos -> compare profit -> ONE multi-row INSERT
        -> promosVersion++ -> Opportunities + Promos refetch
```

### Recommended Project Structure
```
src/domain/hedge/pairMath.ts              # solveBoostBoostPair, solveBoostBonusPair (pure, decimal.js)
src/domain/hedge/pairMath.test.ts         # known-answer + oracle property test
src/domain/promos/pairPromos.ts           # findPairCandidates, selectPairs (matching), types
src/domain/promos/pairPromos.test.ts
src/domain/promos/pairRowDto.ts           # toPairRowDTO (pure; no src/db imports)
src/domain/promos/pairSnapshot.ts         # DonePairSnapshotSchema, buildPairSnapshot, toDonePairDTO
src/domain/opportunities/types.ts         # OpportunitySource, OpportunitiesResponse, SortKey
src/domain/opportunities/pick.ts          # pickTop(items, sort, n) + sortValue(); shared client/server
src/domain/promos/profitTotals.ts         # ADD sumPortfolioProfit(singles, pairs)
src/domain/arb/build.ts                   # extracted buildArbMarkets + toArbResultDTO (pure; from find-arbs.ts)
src/db/memberPairState.ts                 # computeMemberPairState (mirrors memberPromoState.ts)
src/db/promoTracking.ts                   # ADD markPairDone, unmarkPairDone
src/app/actions/get-opportunities.ts
src/app/actions/mark-pair-done.ts
src/lib/persistentState.ts                # ADD STORAGE_KEYS.sortMode
src/components/opportunities/*            # OpportunitiesScreen, OpportunitySection, PairCard, PairDetails, SortSwitch
src/components/tools/ToolsScreen.tsx      # sub-tabs
src/components/promos/ReviewPanel.tsx, DonePairRow.tsx
```

### Pattern 1: Payout functions and "min stake for target payout" (the core of CALC-07)

Notation: decimal odds O (boosted, effective), Ob (base, only for `boost_extra`), stake s, max stake m.
Total return R(s) for a stake-returned boost, mirroring `promoPayoutRaw` in `profitBoost.ts`:

| Cap | R(s) | Kink stake s* (cap starts to bind) | Payout past kink |
|-----|------|-----------------------------------|------------------|
| none | s*O | — | slope O |
| net_winnings C | s + min(s(O-1), C) | C/(O-1) | s + C (slope 1) |
| total_payout C | min(s*O, C) | C/O | flat at C |
| boost_extra C | s*Ob + min(s(O-Ob), C) | C/(O-Ob) | s*Ob + C (slope Ob) |

Bonus bet (stake not returned, fixed amount B, odds Oy): win payout W = floor_cents(B(Oy-1)); cash cost 0; on loss cost 0.

**Boost + boost (legs A on side X at book a, B on side Y at book b):**
- profit if X wins: R_A(sA) - sA - sB. Profit if Y wins: R_B(sB) - sA - sB.
- guaranteed = min of the two = min(R_A(sA), R_B(sB)) - sA - sB, concave in (sA, sB).
- At optimum the two payouts are balanced (R_A = R_B = T) unless a max stake prevents it. Define cost c_L(T) = min stake reaching payout T (inverse of R_L, piecewise-linear convex). profit(T) = T - c_A(T) - c_B(T) is concave piecewise-linear, so the maximum is at a breakpoint: T in {R_A(min(mA, s*_A)), R_B(min(mB, s*_B)), R_A(mA), R_B(mB)}.
- Uncapped-winnings closed form (only max stakes): sB = sA*OA/OB, profit = sA*OA*(1 - 1/OA - 1/OB). **Profit > 0 iff 1/OA + 1/OB < 1** (an arb at boosted prices). If the implied sum >= 1 no pair exists at any stakes (any capped payout is <= the uncapped one, so it is also a valid upper-bound prune).
- Inverse of R (smallest real stake giving payout T): before the kink T/O; past the kink `net_winnings`: T - C; `boost_extra`: (T - C)/Ob; `total_payout`: unreachable (return null; that leg cannot pay more than C).

**Boost + bonus bet (boost leg A on X, bonus leg B on Y):**
- X wins: R_A(sA) - sA (bonus bet loses, costs $0). Y wins: W - sA (boost stake lost, bonus pays winnings only).
- Balanced when R_A(sA) = W, i.e. **uncapped sA = W/OA, profit = W(1 - 1/OA)** (always positive when OA > 1: no arb condition needed).
- If sA* = W/OA > mA: stake mA, profit = R_A(mA) - mA.
- net_winnings cap: R_A(s) - s = min(s(O-1), C) is flat past the kink while W - s keeps falling; profit plateaus at C for s in [kink, W-C]. Choose the smallest stake on the plateau (the kink), same "less money at risk" tie-break as `profitBoost.ts`.
- total_payout cap: R_A(s) - s peaks at the kink then falls; optimum is min(W/O, kink) region, solved by breakpoint enumeration.
- Cash outlay for ROI = sA only (bonus costs $0). ROI = profit / sA * 100, 2dp ROUND_DOWN (label "ROI").

**Solver contract (both):** breakpoint seeds -> cross-seed other leg via inverse R -> +/-4 unit window (unit = $1 for "whole", $0.01 for "cents") clamped to [unit, floor(max)] -> evaluate with `floorCents` payouts -> pick max min-profit, tie-break: smaller totalStaked (cash), then smaller sA. Return `null` unless guaranteedProfit > 0 (same D-17 display filter as `calculateProfitBoostHedge`) and unless each boost leg passes `boostedDecimal >= minOdds` (solver-level gate, same as `calculateProfitBoostHedgeUnfiltered`).

```typescript
// pairMath.ts (shape; follows profitBoost.ts conventions)
export interface BoostLegInput {
  boostedOddsAmerican: number | null; baseOddsAmerican: number | null; boostPercent: Decimal | null;
  maxStake: Decimal; winningsCap: WinningsCap | null; minOddsAmerican: number | null;
}
export interface BonusLegInput { bonusAmount: Decimal; oddsAmerican: number }   // book's plain quote on that side
export interface PairResult {
  legA: { stake: Decimal; payout: Decimal; oddsDecimal: Decimal; capBound: "max_stake" | "max_winnings" | null };
  legB: { stake: Decimal; payout: Decimal; oddsDecimal: Decimal; capBound: ... };
  totalStaked: Decimal;          // cash at risk (bonus stake excluded)
  netIfAWins: Decimal; netIfBWins: Decimal;
  guaranteedProfit: Decimal; roiPct: Decimal;
}
export function solveBoostBoostPair(a: BoostLegInput, b: BoostLegInput, precision: StakePrecision): PairResult | null;
export function solveBoostBonusPair(boost: BoostLegInput, bonus: BonusLegInput, precision: StakePrecision): PairResult | null;
```
Reuse `effectiveBoostedDecimal` (published price wins over boost %, D-03 from Phase 3) and `americanToDecimal`; export whichever helpers (`floorCents`, `clean`) are currently module-private in `profitBoost.ts` rather than re-copying (or copy with the same comment discipline, as the repo already does per module).

### Pattern 2: Pair discovery

1. Only promos in `feedPromos` (active, not done) whose `bookKey` is in `userBookSet` (D-16/D-18). N is small (own-book active promos).
2. Per promo, reuse `candidatesFor(promo, opts)` (currently module-private in `rankPromoHedges.ts`; **export it and `passesBaseMinOdds`**). It returns every 2-way `ResolvedSelection` in scope (pinned -> one selection; event/sport_window -> all eligible market types). Moneyline 3-way markets are excluded already (`outcomes.length === 2` filter in `selection.ts`); state explicitly: **3-way markets (soccer/draw) are out; no third leg or cash hedge is ever used** (a pair is exactly two bets, two outcomes; the sports config has no draw sports; NFL moneyline keeps its "Tie risk" badge).
3. Leg option for promo P at selection s: own-book quote = `s.promoSideQuotes.find(q => q.bookKey === P.bookKey)`. Boost: same rules as `evaluateBoostCandidate` (unpinned needs a live quote; published boosted odds honored only when pinned; base min-odds via `passesBaseMinOdds`). Bonus: needs the live quote and `bonusAmount`.
4. Market key (both sides share it): `eventId|marketType|k` where k = "ml" for moneyline, the HOME team's signed point for spread (`side==="home" ? line : -line`), the total for totals. Opposite side: home<->away, over<->under.
5. For every unordered promo pair (A, B) with `A.bookKey !== B.bookKey` and at least one of them a boost (D-09 excludes bonus+bonus), and every market key present in both promos' leg options with opposite sides, evaluate one solve (two orientations if both unpinned). Keep the best profit per (A, B) with deterministic tie-break (profit desc, then commence asc, eventId, market, line, then lower promo ids).
6. Cheap pruning before calling the solver (Decimal-only): boost+boost requires `1/OA + 1/OB < 1` at the boosted odds; both types: uncapped upper bound must exceed `singleA + singleB` (D-08), otherwise skip. This cuts the O(pairs x markets) solver calls to a handful.
7. D-08 gate: keep pair iff `pairProfit > singleProfit(A) + singleProfit(B)` where `singleProfit` is the promo's `rankPromoHedges` guaranteedProfit at the member's hedge books, or `0.00` if that promo has no profitable single hedge. Store `gain = pairProfit - singleA - singleB` on the candidate.

### Pattern 3: Choosing the non-conflicting set (D-10) - use exact matching, not greedy

Objective: maximize total portfolio profit = sum over unpaired promos of single profit + sum over pairs of pairProfit = (sum of all singles) + sum of gains of chosen pairs. So maximize sum of `gain` over a matching (each promo in <= 1 pair). **Greedy-by-gain is wrong**: A-B gain 10, B-C gain 9, A-D gain 9 -> greedy takes A-B (10) but optimum is B-C + A-D (18). Use:
- Build the pair graph, split into connected components.
- Per component with <= 20 nodes: exact DP over bitmask (recursive "lowest unmatched node: leave single, or match with a neighbor", memoized by mask). Component sizes here are tiny (a handful of own-book promos). Deterministic tie-break: greater total gain, then fewer pairs, then lexicographically smaller sorted pair-id list.
- Component > 20 nodes (should not happen): documented deterministic greedy fallback, covered by a test that asserts the fallback is invoked and result is conflict-free.
- Sort choice (profit vs ROI) does **not** affect matching; it only orders/picks the top 5 afterward. Matching weights use Decimal `plus`/`comparedTo` (no floats).

### Pattern 4: Sources abstraction (D-02)

```typescript
// src/domain/opportunities/types.ts
export type SortKey = "profit" | "roi";
export interface OpportunityItemBase { rowKey: string; profit: string; pct: string; pctLabel: "ROI" | "Conversion"; commenceTime: string }
export interface OpportunitySource<T extends OpportunityItemBase = OpportunityItemBase> {
  id: "promos" | "pairs" | "arbs";       // future: "kalshi"
  title: string;                          // "Best promos"
  seeAll: null | { label: string; tab: "promos" | "arbitrage" };
  emptyCopy: string;
  items: T[];                             // ALL ranked candidates (client slices top 5)
}
export function pickTop<T extends OpportunityItemBase>(items: T[], sort: SortKey, n: number): T[];
```
`pickTop` sorts by `sortValue` (profit or pct as Decimal, desc), tie-break commence asc then rowKey; returns first n. Per D-06b the `pct` for a bonus-bet single is `conversionPct`, for boost/arb/pair it is ROI; each DTO already carries `rateLabel`. Server returns all items (bounded by active promos/arbs; payload is small); the client re-ranks with no refetch. Arb source items map `returnPct -> pct`, `guaranteedProfit -> profit`; the arb source needs the Arb tab's total stake: pass `STORAGE_KEYS.arbTotalStake` (default `"200.00"`) and `arbPrecision` in the action input, validated by the existing `ArbInputSchema`; the stake must be shown in the Best-arbs caption so profit figures are interpretable.

### Pattern 5: Persistence for pairs (no migration)

`promo_completions` PK is `(user_id, promo_id)`; `snapshot` is jsonb; `profit_extracted` numeric(10,2). Design:
- `markPairDone` = `db.insert(promoCompletions).values([primaryRow, memberRow])` in ONE statement (atomic on neon-http). `primaryRow`: promoId = A, `snapshot` = `DonePairSnapshot` (`version: 1, kind: "pair", pairPromoIds: [A, B]`, both legs' terms, both stakes/odds/payouts, pair profit, separate profits, oddsFetchedAt, precision), `profitExtracted` = pair profit. `memberRow`: promoId = B, snapshot `{version:1, kind:"pair_member", pairedWithPromoId:A}`, `profitExtracted = "0.00"`.
- `sumProfitExtracted` (Done-row sum) therefore counts the pair ONCE with no change. The Done tab must hide `pair_member` rows and render `kind:"pair"` as `DonePairRow` (`toDonePromoDTO` tries `DonePairSnapshotSchema` before the single schema; unknown shapes still fall back to the existing "Saved details unavailable" legacy row, so nothing crashes).
- `unmarkPairDone(userId, promoId)`: read the row's snapshot to get both ids, then one `DELETE ... WHERE user_id = $1 AND promo_id IN (a, b)`. Undo from either member works.
- Server pre-check (do NOT rely on `ON CONFLICT DO NOTHING`): both promos must be active and neither already in the member's completions, else return `not_found`; otherwise a conflict on one row would silently drop only half the pair.
- Do not use `.onConflictDoNothing()` on the pair insert; on a genuine unique violation let it throw and return `save_failed`.
- Optional alternative (not needed, only if the owner wants relational integrity): a nullable `pair_id` column + migration 0010. Recommendation: skip.

Precedent to mirror: `markPromoDone`/`unmarkPromoUsed` in `src/db/promoTracking.ts`, `computeMemberPromoState` in `src/db/memberPromoState.ts`, `markPromoUsedAction` in `src/app/actions/mark-promo-used.ts` (requireUser first, strict zod, server recompute, `isSameDisplayedProfit`).

`computeMemberPairState({userId, promoIdA, promoIdB, precision, now})`: load active promos, find both (else `not_active`), compute with the same inputs as `getOpportunities` (own books, hedge books irrelevant to pair legs but needed for the singles/D-08 recheck), run `findPairCandidates([A, B])` and take the best market for exactly that pair. Because discovery keeps the best market per (A,B) with a deterministic tie-break, the recompute returns the identical pair the feed showed (add a parity test like the one in `get-promos.test.ts`). Compare `expectedGuaranteedProfit` with `isSameDisplayedProfit`; mismatch -> `{status:"odds_changed"}` (client shows the UI-SPEC copy); if the pair no longer exists/beats separate -> `odds_changed` with `currentGuaranteedProfit: null`.

### Pattern 6: Totals (D-12) and profit period numbers

- `totalProfit` (Total profit available) = `sumPortfolioProfit`: sum of own-book single profits for promos NOT in a chosen pair, plus each chosen pair's profit. Equivalent to singles-sum + sum(gain). Pure function in `profitTotals.ts` with tests (pair counted once; done promos excluded; empty -> "0.00").
- `totalExtracted`: unchanged (see Pattern 5).
- Today/week/month `availableProfit` come from `promo_profit_observations` keyed by promoId and are group-level singles. They are **not** pair-aware today. Recommendation (see Open Question 1): leave them singles-only in Phase 4 and note it; do not add a table.

### Anti-Patterns to Avoid
- **Reusing the single-promo solver with the "hedge" leg treated as plain odds.** A pair's second leg has its own cap/boost; it needs the two-leg solver.
- **Native `number` math anywhere in pair code** (CLAUDE.md). Pruning included: use Decimal.
- **Greedy pair selection** (counterexample above).
- **Trusting client-supplied stakes/profit.** Client sends only `promoIdA/B`, `precision`, `expectedGuaranteedProfit`.
- **Fetching on the server per sort change.** Sorting is client-side from one payload.
- **Putting UI logic in `.tsx` only.** Vitest here is node-only; `pickTop`, sort-preference parsing, tab-label/count helpers must be pure `.ts`.
- **Exporting non-async helpers from a `"use server"` file** (already burned once; that is why `promoRowDto.ts` exists). Extract `buildMarkets`/`toArbResultDTO` to `src/domain/arb/build.ts`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Boost price from published price vs boost % | New derivation | `effectiveBoostedDecimal` in `profitBoost.ts` | D-03 rule (published wins) already encoded |
| American <-> decimal | Custom | `americanToDecimal`, `decimalToAmericanDisplay` | Exactness discipline (40-digit clone + 20dp `clean`) |
| Scope enumeration / opposite-side resolution | New market walker | `candidatesFor` (export it), `enumerateScopeSelections`, `resolveSelection` | Half-point filtering, 2-way check, scope windows already correct |
| Min-odds gate | Re-implement | `passesBaseMinOdds` (export it) + solver's boosted-vs-min check | WR-06 semantics |
| Arb rows | New arb search | `rankArbs` + extracted `buildMarkets` | Different-book and rounding-erased-arb rules |
| DTO labels | New label helpers | `marketBadgeLabel`, `selectionLabel`, `formatUsd`, `formatPct`, `formatAmerican` | Consistent copy |
| Per-device preference | New storage code | `usePersistentString` (+ new `STORAGE_KEYS.sortMode`) | SSR-safe, cross-component sync via its listener registry, try/catch built in |
| Max-weight matching | Blossom algorithm | Component-wise bitmask DP (n <= 20) | N is tiny; exactness is trivially testable |

**Key insight:** The pair solver is the only place a new formula lives. Everything else is glue; keep the glue thin and the math oracle-tested.

## Runtime State Inventory

Not a rename/refactor phase. Not applicable. One migration-style note: existing `promo_completions` rows stay valid (snapshot schema is additive; `toDonePromoDTO` tries the pair schema first, then the existing single schema, then legacy).

## Common Pitfalls

### Pitfall 1: Tie-break plateaus (lower-stake solutions the breakpoint set misses)
**What goes wrong:** With cent/dollar flooring, profit is flat over a range of stakes (e.g., V2 below: kink-based stakes give 26/33 = $6, but 24/30 also gives $6 with less money staked).
**How to avoid:** Assert **profit** equals the oracle's profit and assert invariants (both net outcomes >= profit; stakes <= max; no leg exceeds caps); do NOT assert exact stake pairs unless the vector is unambiguous. Say so in test names/comments.
**Warning sign:** A test comparing stakes to a brute-force "min total" fails while profits agree.

### Pitfall 2: Window too narrow
**What goes wrong:** +/-2 units around breakpoints missed the oracle profit by $0.02-$0.06 in ~1 of 400 random cases (cent flooring of both legs). +/-4 matched 3,850/3,850.
**How to avoid:** Use +/-4 units and keep the oracle property test (seeded, whole-dollar, max stakes <= 60) in the suite.

### Pitfall 3: "Both promos in the pair also appear in Best promos"
**What goes wrong:** Owner sees the same promos twice and may Mark one done separately, orphaning the pair.
**How to avoid:** Decision needed (Open Question 2). Default recommended below; server pair recompute already rejects if either promo is no longer active/not done.

### Pitfall 4: Odds-changed check on pairs compares one number
**What goes wrong:** Expected profit can coincide while stakes changed.
**How to avoid:** Also compare both legs' stakes (send `expectedStakeA/B` optionally) or simply recompute and require equal profit AND equal stakes to the cent. Recommended: profit + both stakes (cheap, strict).

### Pitfall 5: Same-book pairs
**What goes wrong:** Opposite sides at one book is an unusable "arb" (voids/limits). **How to avoid:** `A.bookKey !== B.bookKey` (mirrors `findBestArbPair` D-06).

### Pitfall 6: keepMounted panels go stale across tabs
**What goes wrong:** Mark done on Opportunities updates Opportunities but the (mounted, hidden) Promos Done list stays stale, and vice versa.
**How to avoid:** `promosVersion` counter in AppShell bumped by every Mark/Undo/review mutation; both screens add it to their refetch effect deps. Do not reuse `recomputeKey` for this (it also re-runs Finder/Arb).

### Pitfall 7: "Promos (N)" needs data the shell does not own
**What goes wrong:** Review count N comes from `getPromos`, which lives inside `PromosScreen`.
**How to avoid:** `PromosScreen` calls `onReviewCount(n)` in an effect after each load; AppShell stores it for the tab label. Extract label formatting to a pure helper (`tabLabel("Promos", n)`) so it is testable.

### Pitfall 8: See all -> Promos lands on Done/Review
**How to avoid:** Either lift the Promos inner `view` to a prop/`key`, or have `onNavigate("promos")` also reset a `promosView` state to "active".

### Pitfall 9: neon-http has no interactive transaction
**How to avoid:** single multi-row INSERT / single DELETE (statements are atomic) or `db.batch`; never two sequential awaited writes for the pair.

### Pitfall 10: Sort by ROI mixes incomparable percentages
Conversion (profit / bonus amount), ROI (profit / cash staked) and pair ROI (profit / boost stake) are different denominators. Locked by D-06b; just label each row. `pickTop` must treat `pct` as Decimal (strings compared via `new Decimal`).

## Code Examples

### Exhaustive oracle (test helper; whole-dollar, small max stakes)
```typescript
// pairMath.oracle.ts (test-only). Compare PROFIT only.
function bruteForceBoostBoost(A: LegModel, B: LegModel, unit: Decimal) {
  let best: { profit: Decimal; total: Decimal } | null = null;
  for (let sa = unit; sa.lte(A.max); sa = sa.plus(unit))
    for (let sb = unit; sb.lte(B.max); sb = sb.plus(unit)) {
      const total = sa.plus(sb);
      const profit = Decimal.min(payout(A, sa).minus(total), payout(B, sb).minus(total)); // payout = floor cents of R(s)
      if (!best || profit.gt(best.profit) || (profit.eq(best.profit) && total.lt(best.total))) best = { profit, total };
    }
  return best;
}
```
Prototype status: this oracle + the breakpoint solver were run in a scratch script (not committed). Property test in the repo should use a seeded PRNG (no `Math.random`) so failures reproduce.

### Known-answer vectors (decimal.js, floor-to-cent payouts, oracle-verified)

All odds American; "boosted" means the price actually paid on that leg. Profit is the asserted value; stakes shown are one optimal solution (see Pitfall 1).

| # | Case | Inputs | Expected guaranteed profit | One optimal stake set |
|---|------|--------|---------------------------|----------------------|
| V1a | boost+boost, cents | A +150 boosted, max $50, no win cap; B +100 boosted, max $100 | **$12.50** | A $50.00, B $62.50 (payout $125.00 both; total $112.50; ROI 11.11%) |
| V1b | same, whole dollars | same | **$12.00** | A $48, B $60 (total $108; payout $120 both). Proof: $12.50+ needs B >= A+13 and 1.5A - B >= 12.5 -> A >= 51 > max 50 |
| V2 | boost+boost, net_winnings | A +150 max $100 net_winnings $40; B +100 max $100; whole | **$6.00** | A $24, B $30 (A payout 24 + min(36,40) = $60; B $60; total $54) |
| V3 | boost+boost, total_payout | A +150 max $100 total_payout $60; B +110 max $100; whole | **$7.00** | A $24, B $29 (A $60 cap-limited... payout min(60,60); B floor(29*2.1)=$60.90; total $53) |
| V4 | boost+boost, max stake binds on B | A +200 max $100; B +100 max $20; whole | **$6.00** | A $12, B $18 (A payout $36, B $36; total $30). Note B's $20 max does NOT bind: the balanced solution is smaller |
| V5 | boost+boost, boost_extra | A boosted +150 (base +125), max $100, boost_extra $10; B +110 max $100; whole | **$21.00** | A $89, B $100 (B max binds) |
| V6 | boost+boost, no arb | A +100 max $50; B -110 max $50 | **none (null)** | implied sum 0.5 + 0.5238 > 1; best is -$0.10, never shown |
| V7 | boost+bonus, uncapped | bonus $50 on Y at +200 (W = $100.00); boost A +150 max $100; whole | **$60.00** | boost stake $40 = W/O (payout $100 = W); ROI 150.00% (60/40) |
| V8 | boost+bonus, max stake binds | same, boost max $25 | **$37.50** | boost stake $25 (X wins 62.50 - 25; Y wins 100 - 25 = 75) |
| V9 | boost+bonus, net_winnings $30 | boost max $100, net_winnings $30, else as V7 | **$30.00** | stake $20 (kink 30/1.5); plateau up to $70, choose the smallest |
| V10 | boost+bonus, cents | bonus $25 on Y at -110 (W = floor(25 x 0.90909...) = $22.72); boost A -120 max $100; cents | **$10.32** | boost stake $12.39 (payout floor(12.39 x 1.8333...) = $22.71; X wins 10.32, Y wins 10.33) |
| V11 | D-08 gate | any V7 pair where singles are $20.00 + $15.00 | shown ($60 > $35); with singles $40 + $30 -> NOT shown | pure `pairPromos` test with stubbed singles |
| V12 | matching counterexample | gains AB=10, BC=9, AD=9 | chosen {BC, AD}, total gain 18 | greedy would return 10 |

Values V1b-V10 were produced by the brute-force oracle over the stated stake grids and independently sanity-checked by hand (V1, V7-V9 closed forms). Re-derive V3's payout note during implementation (the oracle profit $7.00 is authoritative; the stake set is one of several).

### getOpportunities skeleton
```typescript
"use server";
export async function getOpportunities(input: unknown): Promise<OpportunitiesResponse> {
  const user = await requireUser();                       // literal first statement
  const parsed = OpportunitiesInputSchema.safeParse(input); // strictObject { precision, arbTotalStake }
  if (!parsed.success) return { status: "invalid" };
  const now = new Date();
  const userBookSet = new Set(await getUserBookKeys(user.userId));
  // getActivePromos, getPromoCompletions (done ids), hedge keys, both odds caches: Promise.all
  // singles = rankPromoHedges(feedPromos, rankOpts); rows = singles.map(toPromoRowDTO).filter(r => r.hasPromoBook)
  // pairs = selectPairs(findPairCandidates(ownBookFeedPromos, singlesById, rankOpts))
  // arbs = rankArbs(buildArbMarkets(... allowed = hedge keys), { totalStake, precision })
  // totals = sumPortfolioProfit(...), totalExtracted (sumProfitExtracted(doneRows)), availableProfit (loadAvailableProfit)
}
```
Refactor note: get-promos.ts has non-exported helpers (`loadAvailableProfit`, done-row mapping). Extract the shared read/compute steps into a non-"use server" helper (e.g. `src/db/feedContext.ts`) used by both actions rather than calling `getPromos` from `getOpportunities` (getPromos also writes observations and returns queue/scrape data Opportunities does not need). Keep `getPromos`'s response shape stable (existing tests); ProfitSummary simply stops rendering on Promos.

## State of the Art

| Old | Current | Impact |
|-----|---------|--------|
| Single-promo hedge only (Phase 3) | Two-promo pair with both legs' mechanics | New solver; D-08 gate keeps only pairs that beat singles |
| Tabs: Bonus bets / Arbitrage / Promos / Sign-up offers, default "bonus" | Opportunities / Arbitrage / Promos / Tools, default "opportunities" | Bonus bets + Sign-up move under Tools; Review moves under Promos |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Bonus bets are placed in full (no partial bonus stake), matching the existing `bonusBet.ts` model | Pattern 1 | If a book allows partial bonus stakes, a second degree of freedom exists; Phase 3 already assumed full amount |
| A2 | Boost+bonus pair ROI = profit / boost cash stake (bonus costs $0) | Pattern 1 | Owner may prefer profit / (boost stake + bonus amount); display-only, sort order shifts |
| A3 | The Best-arbs section uses the Arb tab's persisted stake (default $200) | Pattern 4 | Profit-sort order of arbs depends on stake; UI-SPEC does not specify. Alternative: fixed $100 |
| A4 | Keeping promos that are inside a displayed pair also visible in Best promos | Pitfall 3 / Open Q2 | Duplicate-looking rows; alternative hides them |
| A5 | Group-level today/week/month "available" figures stay singles-only | Pattern 6 / Open Q1 | Period numbers slightly understate pair upside; D-12 only names Total profit available |

## Open Questions (RESOLVED)

All resolved by owner decisions recorded 2026-09-29 in 04-CONTEXT.md (D-20..D-24). Pair ROI (Assumption A2) -> RESOLVED: D-24 (profit / cash staked; bonus leg costs $0).

1. **Period figures (today/week/month) and pairs (D-12 names only "Total profit available").** RESOLVED: D-22 (singles-only).
   - Known: observations are per promoId, group-level, singles.
   - Unclear: whether the owner expects pairs reflected there.
   - Recommendation: singles-only in Phase 4, documented; revisit if the owner asks. Do not add tables.
2. **Should promos inside a displayed pair also appear in "Best promos"?** RESOLVED: D-20 (yes, they still appear).
   - Recommendation: yes (Best promos = exactly what Promos tab ranks; See all stays consistent); the pair card's comparison line already explains why together is better. Planner may instead hide them; if so it is one filter in `getOpportunities`.
3. **Arb stake for profit-sorted arbs** (A3): confirm "use the Arb tab's stake" vs a fixed reference stake. RESOLVED: D-21 (fixed $100 total stake, owner choice; NOT the Arb tab stake).
4. **Odds-changed check strictness** (Pitfall 4): recommend profit + both stakes. RESOLVED: D-23 (profit + both stakes).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^5.0.2 (node environment) |
| Config file | `/Users/bentorio/Desktop/Personal Projects/promoprofit/vitest.config.ts` (`include: ["src/**/*.test.ts"]`) |
| Quick run command | `npx vitest run src/domain` |
| Full suite command | `npm test` |
| Constraint | No jsdom/component tests exist: keep UI logic in pure `.ts` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CALC-07 | Boost+boost known-answer V1-V6 (cents + whole, each cap kind, no-arb -> null, min-odds gate, published vs derived price) | unit | `npx vitest run src/domain/hedge/pairMath.test.ts` | Wave 0 |
| CALC-07 | Boost+bonus known-answer V7-V10 | unit | same | Wave 0 |
| CALC-07 | Property test vs whole-dollar brute-force oracle (seeded, >= 500 cases; profit equality, invariants) | unit | same | Wave 0 |
| DASH-05 | D-08 gate (V11); market-key normalization (spread home/away line sign, totals over/under); different books; opposite sides; pinned vs unpinned | unit | `npx vitest run src/domain/promos/pairPromos.test.ts` | Wave 0 |
| DASH-05 | D-10 exact matching (V12 counterexample, ties deterministic, component > 20 fallback conflict-free) | unit | same | Wave 0 |
| DASH-05 | Pair DTO: both stakes, comparison amounts, delta = pair - (a+b), cap notes, bonus note | unit | `npx vitest run src/domain/promos/pairRowDto.test.ts` | Wave 0 |
| DASH-01 | `pickTop` sorts by profit/ROI (Decimal), tie-breaks, n=5, mixed conversion/ROI (D-06b) | unit | `npx vitest run src/domain/opportunities/pick.test.ts` | Wave 0 |
| DASH-01 | `getOpportunities`: requireUser first, invalid input, empty variants (no odds / nothing at your books / none scraped), sources populated; no Odds API import | unit (mock db like `get-promos.test.ts`) | `npx vitest run src/app/actions/get-opportunities.test.ts` | Wave 0 |
| DASH-03 | Promo at non-member book excluded; hedge only at member books; pair/arb require both books member | unit | `get-opportunities.test.ts` + `pairPromos.test.ts` | Wave 0 |
| DASH-05 (D-12) | `sumPortfolioProfit` counts pair once, excludes done, matches singles when no pairs | unit | `npx vitest run src/domain/promos/profitTotals.test.ts` | extend existing |
| D-11 | Pair snapshot schema round-trip; `pair_member` hidden; legacy/unknown snapshot fallback; extracted total counts pair once | unit | `npx vitest run src/domain/promos/pairSnapshot.test.ts src/domain/promos/doneSnapshot.test.ts` | Wave 0 / extend |
| D-11 | `markPairDoneAction`: requireUser first, strict input (distinct ids, no userId), not-active/already-done -> not_found, changed odds -> odds_changed and nothing written, success writes 2 rows in one statement, Undo removes both from either id | unit (mock db) | `npx vitest run src/app/actions/mark-pair-done.test.ts` | Wave 0 |
| D-11 | Parity: recompute of (A,B) equals the feed's pair | unit | `mark-pair-done.test.ts` | Wave 0 |
| D-13..D-15 | Sort preference parse/fallback (invalid stored value -> "profit"); tab-label helper `Promos (N)` | unit | `npx vitest run src/lib/sortPreference.test.ts` | Wave 0 |
| D-01/D-06 | Tab restructure / keepMounted / See all | manual-only (no jsdom): open app on Opportunities, switch tabs, verify Finder results survive, Review count label | manual UAT | — |

### Sampling Rate
- **Per task commit:** `npx vitest run src/domain`
- **Per wave merge:** `npm test`
- **Phase gate:** full suite green, plus `npx tsc --noEmit` and lint, before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/domain/hedge/pairMath.test.ts` (+ seeded PRNG helper and oracle) - CALC-07
- [ ] `src/domain/promos/pairPromos.test.ts` - DASH-05, D-08, D-10
- [ ] `src/domain/opportunities/pick.test.ts` - DASH-01
- [ ] `src/domain/promos/pairSnapshot.test.ts`, `pairRowDto.test.ts`
- [ ] `src/app/actions/get-opportunities.test.ts`, `mark-pair-done.test.ts` (copy mock scaffolding from `get-promos.test.ts` / `mark-promo-used.test.ts`)
- No framework install needed.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | inherited | existing iron-session; `requireUser()` first statement in both new actions |
| V3 Session Management | inherited | unchanged |
| V4 Access Control | yes | acting user id ONLY from session; completions keyed by session user id; no `userId` in any input schema; pair ids validated as ACTIVE promos server-side (no IDOR: completions are per-user rows) |
| V5 Input Validation | yes | zod `strictObject`: `promoIdA`/`promoIdB` positive ints and distinct, `precision` enum, `expectedGuaranteedProfit` 2-dp numeric string, `arbTotalStake` via existing `ArbInputSchema` |
| V6 Cryptography | no | none |

### Known Threat Patterns
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Client forging stakes/profit to pollute Total profit extracted | Tampering | Server recomputes pair from DB + cache; client values only compared, never stored |
| Marking someone else's promo state | Elevation | session userId only; delete/insert scoped by `user_id` |
| Half-written pair (one of two rows) | Tampering (integrity) | one multi-row INSERT, pre-check both not done, single DELETE for undo |
| Stored XSS via promo text in pair card | Injection | render as React text only (existing rule); `sourceUrl` allowlist untouched |
| Stale-odds mark | Repudiation/Integrity | odds-changed rejection (profit + stakes) before write |

## Sources

### Primary (HIGH confidence, direct code reading)
- `src/domain/hedge/profitBoost.ts`, `bonusBet.ts`, `arbMath.ts`, `americanOdds.ts`, `rankArbs.ts` (cap kinds, rounding discipline, solver conventions)
- `src/domain/promos/rankPromoHedges.ts`, `selection.ts`, `scope.ts`, `types.ts`, `promoRowDto.ts`, `doneSnapshot.ts`, `profitTotals.ts`
- `src/app/actions/get-promos.ts`, `find-arbs.ts`, `mark-promo-used.ts`; `src/db/promoTracking.ts`, `memberPromoState.ts`, `queries.ts`, `schema.ts` (`promoCompletions`)
- `src/components/AppShell.tsx`, `promos/PromosScreen.tsx`, `promos/MarkUsedButton.tsx`, `src/lib/persistentState.ts`
- `04-CONTEXT.md`, `04-UI-SPEC.md`, `CLAUDE.md`

### Secondary (MEDIUM confidence, own verification)
- Scratch brute-force oracle (decimal.js) comparing the breakpoint solver on ~3,850 random whole-dollar boost+boost cases (0 profit mismatches at +/-4 units) and on all vectors V1-V10 (not committed; reproduce in the Wave 0 test).

### Tertiary
- None (no web sources needed; no external libraries added).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH (no additions; existing files read)
- Architecture: HIGH (mirrors 260929-igk and Phase 3 patterns)
- Pair math: HIGH for derivation and vectors (oracle-verified); MEDIUM for real-world book quirks (A1, A2)
- Pitfalls: HIGH

**Research date:** 2026-09-29
**Valid until:** 2026-10-29 (domain code is stable; re-check only if `profitBoost.ts` cap semantics change)

## Project Constraints (from CLAUDE.md)
- decimal.js for ALL money math; never native floats; format to cents at display only.
- Correct to the cent (guaranteed profit exact, promo mechanics incl. stake-not-returned and caps).
- Odds only from the Postgres cache; viewing spends no Odds API credits (do not import the odds-fetch client in the new actions).
- Regulated Colorado sportsbooks only; private small group (no public signup).
- Next.js App Router 16 + Drizzle + Neon HTTP driver; server actions call `requireUser()` first.
- GSD workflow enforcement: all edits go through a GSD command (execute-phase).
- Plain-English owner preference: UI copy says "pair"/"both bets", not "tandem"/"leg" (UI-SPEC already codifies).
