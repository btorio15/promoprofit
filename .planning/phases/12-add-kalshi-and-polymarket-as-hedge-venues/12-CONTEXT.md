# Phase 12: Add Kalshi and Polymarket as hedge venues - Context

**Gathered:** 2026-10-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Kalshi and Polymarket become **hedge venues**: places where the hedge (cash) leg of an opportunity can be placed, next to the 7 free-tier Colorado sportsbooks. Promos still come only from sportsbooks. Every opportunity keeps at least one sportsbook leg. Markets get no promos, no scraping and no intro offers.

**Scope reversal (owner, 2026-10-22/26):** PROJECT.md currently lists "Hedging on exchanges / prediction markets (Prophet X, Novig, Sporttrade, Kalshi) — sportsbooks only" under Out of Scope, and Constraints says "Hedge venues: Regulated sportsbooks only". The owner added this phase deliberately. The planner should include a task that updates PROJECT.md (Constraints, Out of Scope, Key Decisions) and REQUIREMENTS.md with new requirement IDs for this phase. Prophet X, Novig and Sporttrade stay out of scope.

</domain>

<decisions>
## Implementation Decisions

### Where they show up
- **D-01:** Markets are hedge options in **every hedge engine**: bonus-bet finder, promo hedges, paired promos, no-sweat hedges (Phase 8/9 solver), and the Arbitrage tab (sportsbook on one side, market on the other).
- **D-02:** **Pure best profit after fees.** A market hedge wins whenever its after-fee profit beats every sportsbook hedge. No tie preference for sportsbooks, and no side-by-side "best book vs best market" display.
- **D-03:** Market-hedged profit **counts the same** in Dashboard totals, the grey (available) and green (extracted) graph lines, Statistics and profit recording. Members who haven't enabled a market in My Books never get market hedges, so their numbers stay their own.
- **D-04:** **Always one sportsbook leg.** No Kalshi-vs-Polymarket arbs and no YES/NO-within-a-venue arbs (deferred).

### Price source and credits
- **D-05:** **Odds API first.** If The Odds API carries Kalshi/Polymarket on the free tier, add their keys to the existing `bookmakers=` list (same refresh, same event matching). Use the venues' own public APIs **only as a fallback** for a venue the Odds API doesn't cover (or covers only on a paid tier).
- **D-06:** **Never cost more credits.** A refresh must cost no more credits than today (cost = markets × ceil(bookmakers ÷ 10); 7 books today, so up to 3 more fit in one bucket). If a venue can't be added at zero extra cost through the Odds API, use its free native API or drop the venue. The credit meter's estimate must stay accurate.
- **D-07:** **Moneylines first.** Spreads and totals only where the venue lists the **exact** same line (half-point lines matched exactly, like the Arbitrage tab). Alternate lines aren't required.
- **D-08:** **Settlement mismatches are allowed, with a badge.** Where a market contract can settle differently from the sportsbook bet (e.g. NFL/soccer tie: book refunds, "Team B wins" resolves NO; postponement or overtime rules), the hedge is still suggested with a **"Settlement differs"** badge that explains the case. Research should map each sport/market's settlement rules per venue against the books'.
- **D-09:** Badged hedges **rank normally and count in totals**, the same treatment as today's NFL "Tie risk" badge.

### Fees, contracts and display
- **D-10:** **Exact published fee formula** per venue (e.g. Kalshi's fee with its round-up-to-the-cent rule), in decimal.js. Shown profit is after fees and correct to the cent. Research must pin down the current fee schedules (including whether Polymarket US charges taker/maker fees, and Kalshi's maker vs taker rates; assume the member takes liquidity at the ask).
- **D-11:** **Whole contracts.** The solver picks a whole number of contracts ($1 payout each) that keeps profit as equal as possible across outcomes. The profit shown is computed from the actual rounded buy plus fees (same principle as Low-profile whole-dollar stakes). Never show profit from an un-roundable continuous stake.
- **D-12:** **Card display: native and American odds.** e.g. "Kalshi: buy 42 YES @ 61¢ ($25.62 + $0.42 fee) ≈ −156". The member sees exactly what to buy, plus a comparable American price.

### Liquidity and who can use it
- **D-13:** **Price at the best ask.** If native depth data is available and the hedge needs more contracts than are on offer at that price, show **"Thin market: only N contracts at 61¢"**. If there's no depth data (e.g. Odds API price only), show a short "price may move" note on market legs. No walking the book.
- **D-14:** **Opt in through My Books.** Kalshi and Polymarket appear in the existing My Books picker (onboarding and Settings) in a separate **"Prediction markets"** group, **off by default**. Existing book filtering then controls who gets market hedges.
- **D-15:** **Colorado availability.** Research confirms each venue can be used from Colorado for sports contracts. A venue that isn't available is dropped. Ticking a market in My Books shows a one-line note, e.g. "Regulated by the CFTC, not Colorado's gaming division. Check it's available to you." Never suggest VPNs, location tricks or multiple accounts.
- **D-16:** **Low-profile settings apply only to sportsbook legs** (odds cap, main lines only, whole-dollar stakes from Phase 9 D-21). Markets don't limit winning accounts, and their stakes are whole contracts anyway. The sportsbook account-risk advisory still applies to the book leg.

### Claude's Discretion
- Whether to hedge with **YES on the other side or NO on this side** (pick whichever is cheaper after fees at the ask). Same for 2-way vs 3-way market mapping.
- How a market leg is represented in the solvers. All current engines assume American odds and stake-proportional payouts. A venue-leg abstraction (price per contract, fee function, whole-contract rounding) vs converting to effective odds is the planner's call, but D-10/D-11 exactness must hold, verified by table-driven Vitest cases and a brute-force oracle like `noSweat.oracle.ts` / `pairMath.oracle.ts`.
- Event/contract matching approach for the native-API fallback (only if needed), and how native prices are cached (they cost no credits, but must still go through the refresh lock and the price-age display).
- Exact copy and styling of the "Settlement differs", "Thin market" and "price may move" badges (reuse the Tie risk / RiskAdvisory patterns).
- Schema changes (e.g. venue type on book config, depth fields), done through committed drizzle-kit migrations.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and constraints
- `.planning/PROJECT.md` — core value (correct to the cent), Constraints ("Hedge venues: Regulated sportsbooks only", to be updated), Out of Scope (prediction markets, to be updated), Key Decisions
- `.planning/REQUIREMENTS.md` — v1.2 requirements; this phase needs new requirement IDs
- `.planning/ROADMAP.md` §Phase 12 — goal is TBD; derive it from this context
- `.planning/milestones/v1.0-phases/04-opportunities-feed/04-CONTEXT.md` — D-02: Opportunities built as sources so Kalshi/Polymarket can be added later

### Prior phase decisions that interact
- `.planning/phases/08-no-sweat-bet-math/08-CONTEXT.md` — no-sweat solver; market hedges must plug in
- `.planning/phases/09-no-sweat-promos-in-the-feed/09-CONTEXT.md` — D-20..D-23 Low-profile settings (sportsbook legs only per D-16 here); A-02 exhaustive type switches

### Code
- `src/config/books.ts` — single source of truth for books; `usableOddsBooks()` feeds both the refresh bookmaker list and hedge-book search
- `src/ingestion/odds/client.ts` — credit-cost formula (markets × ceil(bookmakers/10)); `bookmakers=` param
- `src/ingestion/odds/status.ts` — refresh credit estimate (uses `usableOddsBooks().length`)

### External (research to verify)
- The Odds API bookmaker list (https://the-odds-api.com/sports-odds-data/bookmaker-apis.html): check whether Kalshi/Polymarket keys exist, on which region, and on the free tier
- Kalshi fee schedule and API docs; Polymarket (US) fee schedule, API docs and US/Colorado availability

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config/books.ts` `BookConfig` / `usableOddsBooks()`: add the market venues here (probably with a venue-type field) so refresh, hedge search and My Books pick them up from one place.
- `src/domain/books/bookSelection.ts` + `src/components/settings`: the My Books picker gets a "Prediction markets" group (D-14).
- "Tie risk" badge (`src/components/finder/ResultRow.tsx`, `arb/ArbRow.tsx`, `promos/PromoRow.tsx`, `opportunities/PairCard.tsx`; logic in `domain/hedge/rankBonusBetHedges.ts`, `rankArbs.ts`, `noSweat.ts`, `config/sports.ts`): template for the "Settlement differs" badge.
- `src/components/RiskAdvisory.tsx`: style reference for the availability note and market-leg warnings.
- Brute-force oracles (`domain/hedge/noSweat.oracle.ts`, `pairMath.oracle.ts`): pattern for proving whole-contract + fee solvers optimal.

### Established Patterns
- All money math uses decimal.js; stakes are rounded per the member's stake precision and profit is recomputed from the rounded stakes.
- Odds are cached in Postgres per refresh; refreshes are all-or-nothing with a concurrency lock and price-age display.
- Hedge engines take American odds (`domain/hedge/americanOdds.ts` → decimal). Market legs (per-contract price + nonlinear fee + whole contracts) don't fit "stake × decimal odds", so this is the main design point for the planner.
- Odds API responses are validated with Zod (`domain/odds/schemas.ts`); native venue responses need the same.

### Integration Points
- Hedge engines: `domain/hedge/rankBonusBetHedges.ts`, `rankArbs.ts`, `pairMath.ts`, `noSweat.ts`, `profitBoost.ts`, `bonusBet.ts`; `domain/promos/rankPromoHedges.ts`, `pairPromos.ts`, `rankNoSweat.ts`.
- Refresh: `ingestion/odds/refresh.ts`, `refreshExtended.ts`, `status.ts`, `store.ts`.
- Display rows: finder `ResultRow`, `ArbRow`, `PromoRow`, `PairCard`, and Done snapshots (`domain/promos/doneSnapshot.ts`, `pairSnapshot.ts`), which must store the contract count, price and fee so recorded profit matches.

</code_context>

<specifics>
## Specific Ideas

- Card copy example: "Kalshi: buy 42 YES @ 61¢ ($25.62 + $0.42 fee) ≈ −156".
- Thin-market copy example: "Thin market: only N contracts at 61¢".
- Availability note example: "Regulated by the CFTC, not Colorado's gaming division. Check it's available to you."
- The "Settlement differs" badge should explain the specific case (e.g. "On a tie, the book refunds your bet but this contract resolves NO").

</specifics>

<deferred>
## Deferred Ideas

- **Market-vs-market arbs** (Kalshi vs Polymarket, or YES/NO across contracts within a venue): a new opportunity type, its own phase if wanted.
- **Walking the order book** for exact blended pricing on large hedges: needs native depth; revisit if thin-market warnings show up often.
- **Other exchanges** (Prophet X, Novig, Sporttrade): remain out of scope.

### Reviewed Todos (not folded)
- **Support no-sweat bets with a hedge algorithm** (`2026-10-22-no-sweat-bets.md`): keyword match only; belongs to Phases 9/10.
- **2-bet pair solver can be a cent short of optimal at whole-dollar stakes** (`2026-10-03-two-bet-pair-solver-rounding.md`): related in spirit (rounded stakes), but it's a sportsbook-solver fix. The whole-contract solver here should avoid the same flaw (use an oracle), but the todo stays separate.

</deferred>

---

*Phase: 12-add-kalshi-and-polymarket-as-hedge-venues*
*Context gathered: 2026-10-26*
