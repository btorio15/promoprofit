# Phase 8: No-Sweat Bet Math - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning

<domain>
## Phase Boundary

A pure, exact (decimal.js, to the cent) solver for no-sweat bets, plus the conversion-rate function that values the refund. Given a no-sweat promo (book, refund cap, min odds, optional sport/league limit, refund paid as a bonus bet), the app finds the best qualifying line across cached odds, computes the qualifying stake, the hedge book and stake, profit if the qualifying bet wins, profit if it loses (refund converted at the estimated rate), and the worst case (refund worth $0). Requirements: NSB-01..04.

Not in this phase: the `no_sweat` promo type in the DB/feed, ingestion/reader changes, UI, "est." labels, Mark done flow (Phase 9); intro-offer valuation (Phase 10).

</domain>

<decisions>
## Implementation Decisions

### Refund value rate
- **D-01:** The refund bonus bet is valued at the bonus-bet finder's **single best conversion rate right now** (top-1) for the refund's book, not a median or cushioned rate. The owner chose this knowing it runs slightly optimistic (the refund is converted days later, usually a bit below today's best); the worst-case figure (D-02) is the honesty check. Keep the rate behind one injected function (e.g. `conversionRateFor(bookKey)`) so the statistic can be changed later in one place.
- **D-02:** Every result also returns the **worst case**: profit if the refund turns out to be worth $0 (v = 0). Downstream UI will show e.g. "est. +$14.20 at 78% · worst case −$3.10".
- **D-03:** The rate is computed using **only the member's own books (My Books)** as hedge books, matching how the finder already works per member. Cached odds only; 0 Odds API credits.
- **D-04:** If the refund book has no cached odds (no rate can be computed), the result is "can't price". There is no fixed fallback rate (NSB-02).

### Which bets qualify
- **D-05:** Search the **same markets and line-matching rules the other promos use** (moneylines plus the spreads/totals that boost and bonus-bet promo ranking already supports), for both the qualifying bet and its hedge.
- **D-06:** If the promo has a known sport/league limit, search **only eligible games**. If the terms don't say, search everything (same as boosts today).
- **D-07:** The promo's **minimum odds are a hard filter** on the qualifying bet. Lines below the minimum are never suggested.
- **D-08:** Among all qualifying lines, pick the one with the **highest estimated profit** (NSB-03), with a deterministic tie-break consistent with `rankPromoHedges.ts`.

### Stake size & rounding
- **D-09:** The qualifying stake is **exactly the refund cap** (e.g. "no sweat up to $25" → bet $25). No user-chosen stake in this phase.
- **D-10:** The hedge stake follows the **member's existing stake-precision setting** (whole dollars or cents, `StakePrecision`), choosing the best rounded stake exactly, as bonusBet.ts/profitBoost.ts do.
- **D-11:** Rounded-stake results are checked in tests against a brute-force search over whole-dollar and cent stakes (test-only oracle, like `pairMath.oracle.ts`) (NSB-04).

### Claude's Discretion
- **How to hedge:** the owner skipped this. Default: equal-outcome hedge at the estimated rate (`H = (S·Oa − v·R) / Oh`, profit `= S·(Oa − 1) − H`, R = min(S, cap)), with the worst case (D-02) shown alongside. Planner may refine the rounding/candidate search.
- Module layout and naming (e.g. `src/domain/hedge/noSweat.ts`), return-type shape, and how "can't price" is represented in the result type.
- Pushes/voids pay no refund. Handle per the research pitfalls (a void returns the stake, so no refund and no loss).

### Folded Todos
- **Support no-sweat bets with a hedge algorithm** (`.planning/todos/pending/2026-10-22-no-sweat-bets.md`): its math section is exactly this phase. One change from the note: it suggested a fixed ~70% default conversion rate. That is superseded by D-01/D-04 (live finder top-1, no fixed fallback). Its ingestion/feed/intro-offer parts belong to Phases 9–10.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & research
- `.planning/REQUIREMENTS.md`: NSB-01..04 (this phase) and FEED/INTRO requirements that will consume the solver
- `.planning/ROADMAP.md` § Phase 8: goal and success criteria
- `.planning/research/SUMMARY.md`: NSB formula, conversion-rate injection, pitfalls (cap vs stake, pushes/voids, min odds, profit from rounded stakes)
- `.planning/research/PITFALLS.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/FEATURES.md`: detailed research behind the summary
- `.planning/todos/pending/2026-10-22-no-sweat-bets.md`: folded todo (original problem statement)

### Existing math to mirror
- `src/domain/hedge/bonusBet.ts`: bonus-bet solver, floor/ceil cent search, `clean()` noise snapping, `precision` handling; source of the conversion %
- `src/domain/hedge/profitBoost.ts`: sibling solver pattern
- `src/domain/hedge/pairMath.oracle.ts`: brute-force oracle pattern for NSB-04
- `src/domain/hedge/americanOdds.ts`: odds conversion at precision 40

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/domain/hedge/rankBonusBetHedges.ts` and `src/app/actions/find-hedges.ts`: the finder's ranking. The top-1 conversion rate for a book across the member's books comes from here (reuse, don't re-derive).
- `src/domain/promos/rankPromoHedges.ts`: qualifying-line search across cached markets, market filters, deterministic tie-break.
- `src/domain/hedge/marketFilter.ts`, `spreadsTotalsFilter.ts`, `src/domain/promos/altSpreads.ts`: the market/line matching rules D-05 reuses.
- `StakePrecision` (`src/domain/hedge/arbMath.ts`), read per member via `src/db/feedContext.ts` / `src/db/memberPromoState.ts`.

### Established Patterns
- Self-contained solver per promo type (no generic hedge function). Local `Decimal.clone({ precision: 40 })`, never mutate global Decimal config.
- Table-driven Vitest tests against hand-calculated examples, plus brute-force oracles for rounded stakes.
- Research warning: a `profit_boost ? boost : bonus` ternary in `rankPromoHedges.ts` would silently price a new type as a bonus bet. Phase 9 converts these to exhaustive switches, but this phase's code should not add new binary branches.

### Integration Points
- New pure module(s) under `src/domain/hedge/` (solver) plus a conversion-rate function fed by cached odds and the member's books. No DB schema change, no UI in this phase.

</code_context>

<specifics>
## Specific Ideas

- Display shape the solver must support downstream: "est. +$14.20 at 78% · worst case −$3.10".
- Hard Rock worked example from research ($5 qualifying bet, −500 or longer, refunds as bonus bets) is a good fixture.

</specifics>

<deferred>
## Deferred Ideas

- Middle-of-top-N or cushioned conversion rate: considered and rejected for now. It can be swapped in via the injected rate function later.
- User-chosen qualifying stake below the cap (e.g. low balance at that book): not in this phase.

### Reviewed Todos (not folded)
- **2-bet pair solver can be a cent short** (`.planning/todos/pending/2026-10-03-two-bet-pair-solver-rounding.md`): a different solver (`pairMath.ts`), so it stays a separate low-priority fix.

</deferred>

---

*Phase: 08-no-sweat-bet-math*
*Context gathered: 2026-10-22*
