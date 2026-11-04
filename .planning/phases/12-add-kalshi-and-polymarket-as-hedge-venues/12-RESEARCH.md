# Phase 12: Add Kalshi and Polymarket as hedge venues - Research

**Researched:** 2026-11-02
**Domain:** Prediction-market venues as cash hedge legs inside exact-cent American-odds hedge engines (Next.js 16 / TypeScript / decimal.js / Vitest)
**Confidence:** MEDIUM (venue availability and credit math HIGH; Odds API price semantics for exchanges and Polymarket fee/state details LOW-MEDIUM, see Open Questions)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- D-01: Markets are hedge options in every hedge engine: bonus-bet finder, promo hedges, paired promos, no-sweat hedges (Phase 8/9 solver), and the Arbitrage tab. **(SCOPE OVERRIDE from the user: Phase 9 is not built on this branch. Build for bonus-bet finder, promo hedges, paired promos, Arbitrage tab. Defer the no-sweat hedge integration part of D-01 as a follow-up.)**
- D-02: Pure best profit after fees. A market hedge wins whenever its after-fee profit beats every sportsbook hedge. No tie preference, no side-by-side display.
- D-03: Market-hedged profit counts the same in Dashboard totals, grey/green graph lines, Statistics and profit recording. Members who haven't enabled a market never get market hedges.
- D-04: Always one sportsbook leg. No Kalshi-vs-Polymarket arbs, no YES/NO-within-venue arbs.
- D-05: Odds API first; add keys to the existing `bookmakers=` list. Venue native APIs only as fallback.
- D-06: Never cost more credits (cost = markets x ceil(bookmakers/10)); credit meter estimate must stay accurate.
- D-07: Moneylines first. Spreads/totals only where the venue lists the exact same line.
- D-08: Settlement mismatches allowed with a "Settlement differs" badge explaining the case. Research maps rules per sport/venue.
- D-09: Badged hedges rank normally and count in totals (same as NFL "Tie risk").
- D-10: Exact published fee formula per venue in decimal.js; profit after fees correct to the cent; member takes liquidity at the ask.
- D-11: Whole contracts; solver picks integer contracts keeping profit as equal as possible; shown profit computed from the actual rounded buy plus fees.
- D-12: Card shows native and American odds, e.g. "Kalshi: buy 42 YES @ 61c ($25.62 + $0.42 fee) ~ -156".
- D-13: Price at best ask. If native depth available and hedge needs more contracts: "Thin market: only N contracts at 61c". No depth data: short "price may move" note. No book walking.
- D-14: Opt in via My Books, separate "Prediction markets" group, off by default.
- D-15: Confirm Colorado availability per venue; drop unavailable ones. One-line CFTC note on tick. Never suggest VPNs/location tricks/multiple accounts.
- D-16: Low-profile settings apply only to sportsbook legs. **(SCOPE OVERRIDE: Low-profile is Phase 9, not built. Defer D-16 as a follow-up; do not depend on Phase 9 code.)**

### Claude's Discretion
- YES-on-other-side vs NO-on-this-side (cheaper after fees at the ask); 2-way vs 3-way mapping.
- Venue-leg abstraction vs effective odds, as long as D-10/D-11 exactness holds, verified by table-driven Vitest and a brute-force oracle.
- Event/contract matching for native-API fallback (only if needed); native price caching (must go through refresh lock + price-age display).
- Copy/styling of "Settlement differs", "Thin market", "price may move" badges (reuse Tie risk / RiskAdvisory).
- Schema changes via committed drizzle-kit migrations.

### Deferred Ideas (OUT OF SCOPE)
- Market-vs-market arbs; walking the order book; Prophet X / Novig / Sporttrade (stay out of scope), even though The Odds API lists novig/prophetx under `us_ex`.
- Plus (from user scope note): no-sweat hedge integration (D-01 part) and Low-profile interaction (D-16) until Phase 9 lands.
</user_constraints>

<phase_requirements>
## Phase Requirements (PROPOSED IDs, to be added to REQUIREMENTS.md)

| ID | Description | Research Support |
|----|-------------|------------------|
| MKT-01 | Kalshi and Polymarket US are configured as hedge venues (venue type on book config), off by default, in a "Prediction markets" group in My Books (onboarding + Settings) with the CFTC/availability note | `books.ts` single source; `bookSelection.ts` allowlist |
| MKT-02 | A refresh adds the venues to the existing `bookmakers=` list at zero extra credits; credit estimate stays accurate | Cost math section: 7+2=9 <= 10 |
| MKT-03 | Venue quotes are parsed from Odds API h2h into a per-contract cost (cents) with exact fee, validated with Zod | Fee formulas, price recovery |
| MKT-04 | Fee functions per venue in decimal.js (Kalshi `ceil(0.07*C*P*(1-P))`, Polymarket `Theta*C*p*(1-p)` banker's-round) match published schedule | Fee section |
| MKT-05 | A whole-contract market-hedge solver picks the contract count maximizing worst-case profit after fees; proven by a brute-force oracle | Solver design |
| MKT-06 | Bonus-bet finder, promo hedges, paired promos and Arbitrage tab consider market hedges and rank by after-fee profit (best of book vs market) | Integration points |
| MKT-07 | Market legs render native + American odds, contracts, cost, fee; plus "Settlement differs" / "price may move" (and "Thin market" where depth exists) badges | Settlement section, UI-SPEC |
| MKT-08 | Done snapshots store contracts, price and fee so recorded profit matches; market-hedged profit counts in totals/graph/Statistics | `doneSnapshot.ts`, `pairSnapshot.ts` |
| MKT-09 | PROJECT.md (Constraints, Out of Scope, Key Decisions) and REQUIREMENTS.md updated for the scope reversal | CONTEXT scope reversal |
| MKT-10 | Venue availability: only venues confirmed usable from Colorado are shipped; live smoke test proves the Odds API serves the venue keys on the free key | Open Questions Q1 |
</phase_requirements>

## Summary

The Odds API **does** carry both venues. Its bookmaker page lists a "US Exchanges" region (`us_ex`) with bookmaker keys `kalshi`, `polymarket`, `polymarket_us`, `novig`, `prophetx`, `limitless`, `betopenly`; none carry the "paid subscriptions only" flag that Caesars/Fanatics do. [VERIFIED: the-odds-api.com/sports-odds-data/bookmaker-apis.html] Because `bookmakers=` takes priority over `regions=` and "every group of 10 bookmakers is the equivalent of 1 region", adding `kalshi` + `polymarket_us` to the 7 free books gives 9 bookmakers = 1 bucket: **zero extra credits** (D-06 satisfied; up to 3 venues fit). [CITED: the-odds-api.com/liveapi/guides/v4/] The pricing page only says the free plan has "most bookmakers" and does not say whether `us_ex` is included, so a one-time live smoke probe (1-2 credits) is the gating Wave 0 task. [ASSUMED: free key serves us_ex]

Fees are quadratic in price and published. Kalshi taker: `ceil(M x 0.07 x C x P x (1-P))`, maker `0.0175` with per-series multiplier M (default 0 for maker); Polymarket US (schedule effective 2026-10-19): `Fee = Theta x C x p x (1-p)`, Theta 0.0695 standard taker, banker's rounding to the cent, 0 maker. Both change often, so coefficients must live in config (and Kalshi's per-series `fee_multiplier` is a real input). Settlement differs materially: Kalshi pays $0.50 to each side on a tie/NFL tie rather than resolving NO (a partial mismatch vs a book refund); both venues have postponement clocks (Kalshi 48h then exchange-set price) versus book voids.

The design: do NOT convert a market leg into "effective American odds" (fee is nonlinear, contracts are whole). Add a `MarketLeg` value type (price in cents, fee fn, whole contracts) and a small set of market-hedge solvers that work from the book side's two payoffs. Payoff structure makes this a monotone 1-D search over integer N (or N x book-stake for arbs), cheap to brute-force as an oracle. Existing engines stay untouched for sportsbook hedges; rankers compare the best book hedge profit to the best market hedge profit (D-02).

**Primary recommendation:** Config-driven venue entries in `books.ts` (new `venue: "sportsbook" | "market"` field), a separate `marketHedge` domain module (fee fns + whole-contract solvers + oracle), and wiring into the four existing rankers behind a pure "best of book vs market" comparison. Gate everything on the Wave 0 live probe proving the Odds API returns `kalshi`/`polymarket_us` h2h prices on the free key.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Venue config, opt-in selection | API / Backend (config + server action) | Browser (BookPicker UI) | `books.ts` is source of truth; `saveBooks` validates allowlist server-side |
| Fetching venue prices | API / Backend (`ingestion/odds`) | — | Server-only API key, credit guard |
| Parsing/validating venue quotes | API / Backend (domain, Zod) | — | Pure functions, exact math |
| Fee + whole-contract solver | API / Backend (pure domain) | — | Correctness-critical, decimal.js, oracle-tested |
| Ranking book vs market | API / Backend (rankers) | — | Pure functions over cached odds |
| Badges / card copy | Browser / Client | Frontend Server (DTO shaping) | Presentation only; DTO carries contracts/price/fee |
| Done snapshots / totals | Database / Storage | API / Backend | Must persist contracts, price, fee |
| Depth (Thin market) | API / Backend (optional native Kalshi call) | — | Public REST, zero credits, behind refresh lock |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| decimal.js | ^10.6.0 (already installed) | Fee/cost math | Project rule: no floats for money |
| zod | 4.x (already installed) | Validate venue responses/config | Existing pattern in `domain/odds/schemas.ts` |
| vitest | ^5.0.2 (already installed) | Table-driven + oracle tests | Existing |
| drizzle-orm / drizzle-kit | 0.45.x / 0.31.x | Snapshot/migration changes | Existing; migrations through `drizzle/00NN_*.sql` (latest 0017) |

### Supporting
None. **No new npm packages are required.** Polymarket's `polymarket-us` TS SDK exists but needs keyId/secretKey, so it is not used (fallback is not viable, see below). Package Legitimacy Audit: no external packages recommended; slopcheck not needed. [VERIFIED: codebase package.json]

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `MarketLeg` + dedicated solvers | Convert to effective American odds | Rejected: fee is quadratic in price and integer contracts, so no single odds number is exact (D-10/D-11); only usable as the *display* "~ -156" |
| Odds API for prices | Kalshi public REST for prices | Kalshi native is a free fallback and the only source of depth; Polymarket US native orderbook requires a Bearer JWT, so no native fallback for Polymarket [CITED: docs.polymarket.us orderbook page] |

**Installation:** none.

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| (none new) | — | — | — | — | — | — |

**Packages removed due to slopcheck [SLOP] verdict:** none. **Flagged [SUS]:** none.

## Architecture Patterns

### System Architecture Diagram

```
Member ticks Kalshi/Polymarket in My Books (off by default)
        |
        v
 user_books (bookKeys incl. "kalshi","polymarket_us")      config/books.ts (venue:"market")
        |                                                          |
        |                        refresh: bookmakers= 7 books + venue keys (<=10 => 1 bucket)
        |                                                          v
        |                                            Odds API /odds (h2h; spreads/totals extended)
        |                                                          v
        |                          Zod parse -> cached odds in Postgres (existing refresh lock, price age)
        v                                                          |
 hedgeBookKeys (books + markets)  <---------------------------------+
        |
        v
 marketFilter.extractTwoWayMoneylines  -> quotes {bookKey, outcome, oddsAmerican}
        |
        +--> sportsbook quote?  -> existing engine (bonusBet / pairMath / arbMath / profitBoost)
        |
        +--> venue quote? -> toMarketLeg(): price cents = round(implied p x 100) (+ side YES/NO)
                              -> marketHedge solver (whole contracts N, fee fn)  -> after-fee profit
        |
        v
 rankers: best book hedge vs best market hedge by after-fee profit (D-02)
        |
        v
 DTO: leg {venue, side, contracts, priceCents, feeUsd, american~, badges[settlementDiffers, priceMayMove, thin]}
        |
        v
 Cards (ResultRow / PromoRow / PairCard / ArbRow)  +  Done snapshot (contracts, price, fee) -> totals/graph/stats
```

### Recommended Project Structure
```
src/
├── config/books.ts                  # add venue field; kalshi / polymarket_us entries; marketVenues()
├── config/venues.ts                 # fee params (coefficient, rounding), settlement-rule table per sport
├── domain/market/
│   ├── fees.ts                      # kalshiFee(), polymarketFee() in decimal.js
│   ├── marketLeg.ts                 # MarketLeg type, priceCentsFromAmerican(), americanDisplay()
│   ├── solveMarketHedge.ts          # bonus-bet / promo / arb / pair solvers over integer contracts
│   ├── solveMarketHedge.oracle.ts   # brute force (test-only, like pairMath.oracle.ts)
│   ├── settlement.ts                # sport x venue -> "Settlement differs" explanation | null
│   └── *.test.ts
├── domain/hedge/rank*.ts            # compare book vs market hedge
├── domain/promos/{rankPromoHedges,pairPromos,doneSnapshot,pairSnapshot}.ts
```

### Pattern 1: Market leg as two payoffs, not a rate
**What:** Every engine reduces to: given the book-side stake, what do I net if the book bet wins vs loses. A market hedge buying N contracts at price `p` (dollars/contract) with total cost `K(N) = N*p + fee(N,p)` pays `N` if the contract wins, 0 otherwise.
- hedge contract wins: `profit_W(N) = N - K(N) + bookNetWhenBookLoses`
- hedge contract loses: `profit_L(N) = -K(N) + bookNetWhenBookWins`
`N - K(N) = N(1-p) - fee` is increasing in N (fee per contract < 1-p), `-K(N)` decreasing, so `min(profit_W, profit_L)` is unimodal: crossover search then check N* +/- a few. Bonus bet: `bookNetWhenBookLoses = 0`, `bookNetWhenBookWins = B*(d-1)` (stake not returned). Arb: pick book stake S (rounded per precision) and N; for each N in a window, best S is the balancing S rounded +/- 1 unit; take max of min. Pair promos: market is the "top-up" third leg (see `solveBoostBoostPairWithTopUp` in `pairMath.ts`, which already does a +/- 1 unit neighbourhood search); implement market top-up by scanning N over a window around the continuous balance.
**When to use:** all four engines.
**Example:**
```typescript
// Source: derived from published formulas (docs.kalshi.com fee_rounding, docs.polymarket.us/fees.md)
import Decimal from "decimal.js";
export interface MarketLeg {
  venue: "kalshi" | "polymarket_us";
  side: "yes" | "no";          // which contract is bought
  priceCents: number;          // integer ask, 1..99
  fee: (contracts: number) => Decimal; // exact, venue rounding applied
}
export const cost = (l: MarketLeg, n: number) =>
  new Decimal(n).times(l.priceCents).dividedBy(100).plus(l.fee(n));
export const kalshiTakerFee = (n: number, pCents: number, mult = 1, precision = 0.01) =>
  // ceil(0.07 * M * C * P * (1-P)) to `precision` (cent default: conservative vs centicent)
  new Decimal(0.07).times(mult).times(n).times(pCents).times(100 - pCents)
    .dividedBy(10000).dividedBy(precision).ceil().times(precision);
```

### Pattern 2: YES-here vs NO-there choice (Claude's discretion, resolved)
For a two-way game with outcomes A (the side to hedge *against* the book bet) pick the contract that wins when the book bet loses. Odds API h2h gives one price per team (YES on that team). Hedging "book bet on Team A" means buy the Team B contract; that is the quote Odds API returns for Team B's outcome. The alternative (NO on Team A) is only visible with native data (Kalshi: NO ask = 1 - best YES bid). With Odds API-only data, use the opposite team's YES quote; with Kalshi orderbook available, also evaluate NO-on-A and keep the cheaper after fees. 3-way (soccer, not currently in `config/sports.ts`) is out of scope: sports list is NFL/NBA/MLB/NCAAF/NCAAB/NHL.

### Anti-Patterns to Avoid
- **Effective-odds conversion in the solver:** hides fee nonlinearity; breaks D-10. Use only for the "~ -156" display.
- **Putting venues in `usableOddsBooks()` unfiltered:** that list feeds the promo/bonus book dropdown and `SaveBooksInputSchema`; a market must never be selectable as the *promo* book (promos only come from sportsbooks). Split into `usableSportsbooks()` (promo/bonus dropdown, existing behaviour) and `usableHedgeBooks()` (sportsbooks + markets; refresh list, My Books, hedge search). Audit every consumer: status.ts, refresh.ts, refreshExtended.ts, get-promos.ts, get-add-promo-options.ts, queries.ts, feedContext.ts, addedPromoPipeline.ts, signupOffers.ts, bookSelection.ts.
- **Assuming the Odds API price equals the ask:** unverified (Open Question Q2).
- **Using `polymarket` (global, crypto) instead of `polymarket_us`:** global Polymarket is not for US persons; only `polymarket_us` is the regulated US exchange. [ASSUMED]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Fee rounding | ad-hoc `toFixed` | `Decimal.ceil()` / `toDecimalPlaces(2, ROUND_HALF_EVEN)` per venue | Kalshi rounds UP; Polymarket US uses banker's rounding; float drift breaks cent-exactness |
| Credit estimate | new estimator | existing `estimateRefreshCredits(sports, bookmakerCount, markets)` | Already `ceil(n/10)`; just feed the venue-inclusive count |
| Oracle RNG | new PRNG | `mulberry32/randInt/pick` re-exported from `pairMath.oracle.ts` | Existing deterministic seeds |
| Response validation | hand checks | Zod `looseObject` in `domain/odds/schemas.ts` | Existing pattern; venue keys parse with no schema change for Odds API path |
| Tie/NFL badge | new badge infra | extend `tieRisk` plumbing (`config/sports.ts` -> market filter -> row) | Same data path |

**Key insight:** the engines' exactness comes from candidate search + oracles; extend that pattern, don't introduce a continuous solver with a final rounding step (the open pair-solver todo shows that is the exact flaw to avoid).

## Fee Schedules (D-10)

| Venue | Taker | Maker | Rounding | Source |
|-------|-------|-------|----------|--------|
| Kalshi | `round_up(M x 0.07 x C x P x (1-P))`, M = series multiplier (default 1; e.g. 0.5 on some baseball series, 0 on some) | `round_up(M x 0.0175 x ...)`, M defaults to 0 unless the series is a maker-fee series (NFL and NBA game series are on that list as of 2026-10-10) | Round up; fee plus cost aligned to centicent ($0.0001) for direct members, cent for non-direct, with sub-precision overcharge rebated across the order's fills | [CITED: docs.kalshi.com/getting_started/fee_rounding; formulas via quantvps.com/blog/kalshi-fees-explained, a secondary summary of the official schedule] |
| Polymarket US | `Fee = Theta x C x p x (1-p)`, Theta 0.0695 standard (Table Tennis 0.10; Combo curve), effective 2026-10-19 | Rebate tiers only above $10M monthly maker volume; Tier 1 none, so makers pay 0 | Nearest cent, banker's rounding; per-fill rounded with cumulative cap (aggregate never exceeds rounded cumulative exact fee) | [CITED: docs.polymarket.us/fees.md] |

Notes for the planner:
- The Polymarket US schedule has changed repeatedly (secondary sources report 5% sports in July 2026, 0.05 w/ 25% maker rebate in April 2026). The official page dated 2026-10-19 says 0.0695; use it, but keep Theta in `config/venues.ts` with a source-date comment and a test that pins the table. [CITED: docs.polymarket.us/fees.md] Treat as MEDIUM; re-verify before ship.
- Worked example (Kalshi taker, 42 contracts at 61c): 0.07 x 42 x 0.61 x 0.39 = 0.69943 -> ceil to cent = $0.70 (the CONTEXT copy example shows "$0.42 fee" illustratively; do not hard-code it). Polymarket: 0.0695 x 42 x 0.61 x 0.39 = 0.6944 -> $0.69.
- Rounding precision: D-10 says "correct to the cent". Use ceil-to-cent for Kalshi (always >= centicent-rounded, so profit is never overstated) unless the member's account type is confirmed direct. Make `precision` a parameter. [ASSUMED: retail accounts are "direct members"; the fetched doc does not define the term]
- A multi-fill order's fee is computed on aggregate; since we buy at one price (best ask only, D-13), single-price aggregate math is exact. If the order spans levels the real fee can differ by a cent; the "price may move" note covers it.
- Maker vs taker: assume taker at the ask (D-10), so use the taker formula only.
- Kalshi per-series multiplier: `GET /series/{series_ticker}` exposes `fee_multiplier`/`fee_type`; the Odds API path has no series info, so v1 uses M=1 default taker per sport (taker M is 1 for general; baseball series 0.5 is a *discount*, so M=1 overstates fee, safe direction). [CITED: quantvps; ASSUMED safe-direction claim for all sports]

## Venue API Facts

### The Odds API (primary path, D-05)
- Keys under `us_ex`: `kalshi`, `polymarket`, `polymarket_us`, `novig`, `prophetx`, `limitless`, `betopenly`. Not flagged paid-only. [VERIFIED: bookmaker-apis.html]
- Page notes these exchange bookmakers are covered for moneyline markets (h2h); spreads/totals coverage not stated, consistent with D-07 "moneylines first". [LOW: single search snippet]
- Exchanges with lay betting get an `h2h_lay` market; prediction markets are not described as lay venues, so expect plain `h2h` outcomes. [CITED: v4 guide on lay odds for Betfair/Matchbook; ASSUMED for Kalshi]
- `includeBetLimits=true` returns bet limits per option "mainly for betting exchanges" (e.g. betopenly docs). If Kalshi/Polymarket return a max size at the quoted price, this gives free depth for D-13 without native calls. Cost impact unverified; test in the smoke probe. [CITED: v4 guide; effect on Kalshi ASSUMED]
- `oddsFormat=american` is already used; American integers are rounded, so recover cents with `round(impliedProb x 100)`: near every probability the integer American step is smaller than 1c, so the mapping is unique. Add a test over -9900..+9900 proving round-trip stability. [Derivation; verify in tests]
- Free tier: 500 credits/month, "most bookmakers"; whether `us_ex` is included is not stated. [CITED: the-odds-api.com]

### Credit cost (D-06) [VERIFIED: client.ts, quota.ts + guide]
`cost = markets x ceil(bookmakers/10)` per sport (`estimateRefreshCredits`). Today 7 books -> 1 bucket. Adding `kalshi` + `polymarket_us` -> 9 -> still 1 bucket (a 3rd market venue also fits). `status.ts` uses `usableOddsBooks().length`: switch it to the venue-inclusive refresh list count (NOT per-member selection) and add a guard test: `refreshBookmakerKeys().length <= 10` so a future addition that would double cost fails CI. The refresh asks for all configured keys regardless of member opt-in, so a market-less member still shares the same cached odds. `fetchEventOdds` (alt lines) uses the same list, same bucket.

### Kalshi native (fallback/depth) [CITED: docs.kalshi.com]
- Base `https://external-api.kalshi.com/trade-api/v2`; market data REST needs no auth (`GET /markets`, `/events/{t}`, `/series/{t}`, `/markets/{ticker}/orderbook`). WebSocket requires auth.
- Orderbook returns **bids only**: `orderbook_fp.yes_dollars` / `no_dollars`, arrays of `[price_dollars_string, count_fp_string]` ascending, best bid last. Best YES ask = 1 - best NO bid; best NO ask = 1 - best YES bid. Counts are fixed-point strings and fractional contracts (0.01) exist; still buy whole contracts per D-11.
- `GET /markets` supports `series_ticker`, `status=open`, `event_ticker`, limit up to 1000, cursor pagination; fields `yes_ask_dollars`, `no_ask_dollars`, `rules_primary`, `status`. Rate limits exist (tiered, token cost); not quantified.
- Sports series tickers (e.g. an NFL game series) were not confirmed from docs. [UNVERIFIED]. If native depth is built, event matching (team names + start time within the series) is the riskiest piece; recommend making Thin-market a late, optional wave (see Open Questions Q3).

### Polymarket US native [CITED: docs.polymarket.us]
- Order book endpoint `GET /v1/orderbook/{symbol}` on `https://api.prod.polymarketexchange.com` requires a Bearer JWT; response `bids`/`offers` with `px`/`qty` as int64 strings with unstated scaling. Not usable without credentials, so **no native fallback and no depth for Polymarket**: Polymarket legs get the "price may move" note only. Gamma/market listing endpoints on docs.polymarket.us (Get Markets, BBO) may be public but were not confirmed. [LOW]

## Colorado availability (D-15)

| Venue | Finding | Confidence |
|-------|---------|------------|
| Kalshi | CFTC-regulated DCM; Colorado residents (18+, US citizen/PR) can open accounts; operates outside Colorado's gaming division and pays no state sports-betting tax; Colorado press (CPR 2026-05-08, KUNC 2026-05-11) describe it operating in the state with legislative debate ongoing; no Colorado ban found. Legal status nationally is unsettled (Nevada, Maryland, Massachusetts, Michigan actions; 10th Circuit litigation from NM/UT could affect Colorado) | MEDIUM |
| Polymarket US | CFTC-regulated (QCX LLC d/b/a Polymarket US), relaunched Dec 2025, waitlist dropped May 2026; secondary sources say Colorado available, no state action; no official state list found (docs "Trading Restrictions" page lists no states) | LOW-MEDIUM |

Recommendation: ship both (D-15 says drop unavailable ones, and nothing found says unavailable), with the My Books note and a config flag `availableInColorado: true` plus source/date so it can be flipped. Add a confirm item to the Wave 0 human check: owner or a member checks Polymarket US state eligibility in-app. Never reference VPNs. [Open Question Q4]

## Settlement differences (D-08)

Venues vs sportsbook moneylines. Sportsbook baseline: tie/no-contest = refund (push/void); NFL tie = push; postponement/cancel = void.

| Case | Kalshi | Polymarket US | Hedge impact |
|------|--------|---------------|--------------|
| NFL tie (only `tieRisk` sport in `config/sports.ts`) | A game tied after regulation and OT pays each tied team $1/(tied teams), rounded down: $0.50 each (CFTC filing) | Market-specific; one MLB market resolves to a named team on tie, others 50-50 on cancel. Treat as unknown | Book refunds stake; contract pays 50c each. Not a clean push: Kalshi hedge leg nets partial. Badge text: "On a tie your book refunds the bet but this contract pays 50c" |
| Postponement | If rescheduled and starts within 48h of original date, stays open and settles on the final result; otherwise settles at an exchange-set price (no void) | Market stays open until the game completes (one market) | Book may void/hold; market may settle at arbitrary price. Badge: "Postponement rules differ" |
| Canceled / no contest | Exchange-set price | One MLB market resolves 50-50 | Book refunds; market pays 50c or set price |
| Overtime / shootout | Moneyline "full game" scope includes OT; "regulation time" contracts treat a draw as not a win. NBA/NHL/MLB/NCAA have no ties so OT/SO resolves | Depends on market | Match only full-game moneyline contracts; Odds API h2h for these books is the full-game winner, so no OT mismatch expected for NBA/NHL/MLB |
| Suspended game | Football stopped before 55 min settles at exchange price for unfinished periods; MLB shortened game settles on declared result if official | Unknown | Rare; fold under the postponement badge |
| Venue change | Home/away reversal or outside the week -> exchange price | Unknown | Rare |

Recommended implementation: `settlement.ts` returns a reason string for (sportKey, venue) from a table. Always badge NFL (tie differs: Kalshi 50c vs book refund, a known mismatch; tie probability is about 0.3-0.5% so profit still counts per D-09). For other sports, show "Settlement differs" only in the rarely-triggered postponement case? D-08 says badge "where a market contract can settle differently". Recommended minimum: NFL tie badge always; a single generic postponement line inside the "price may move"/info tooltip for all market legs rather than a badge on every card (avoids badge spam). Planner/UI-SPEC to confirm. [Sources: Kalshi CFTC filing via search, oddsshopper.com/articles/prediction-markets/kalshi-postponed-game-rules; MEDIUM; Polymarket US general rules not found, LOW]

## Common Pitfalls

### Pitfall 1: Credit bucket creep
**What goes wrong:** Adding the 11th bookmaker silently doubles cost.
**How to avoid:** Single `refreshBookmakerKeys()`; test `length <= 10`; `status.ts` estimate uses the same list.
**Warning signs:** `x-requests-last` doubles in `credit_usage`.

### Pitfall 2: Odds API exchange price semantics
**What goes wrong:** The h2h price for an exchange could be last trade, mid, or best back; if it is not the ask, "profit after fees at the ask" is wrong, and a market with no liquidity may still show a price.
**How to avoid:** Wave 0 probe: call `GET /sports/{key}/odds?bookmakers=kalshi,polymarket_us&markets=h2h&includeBetLimits=true` for one in-season sport, compare with the Kalshi public orderbook (YES ask = 1 - best NO bid). Document the result in the plan; if prices are mids, fall back to Kalshi native asks (Kalshi only) or drop the venue.

### Pitfall 3: Fee rounding direction and precision
**What goes wrong:** Rounding fee half-up on Kalshi, or at centicent, understates cost by a cent; oracle disagrees with solver.
**How to avoid:** Kalshi `ceil`, Polymarket `ROUND_HALF_EVEN`; share one fee function between solver and oracle? No: oracle must use an independent integer-cents implementation (see Validation).

### Pitfall 4: Solver monotonicity assumptions with rounding
**What goes wrong:** Fee ceil makes `profit(N)` non-monotone by a cent, so a pure crossover can miss the optimum (same class of bug as the pair-solver todo).
**How to avoid:** Evaluate a window N*-3..N*+3 (and for arbs, S +/- 1 unit per N); oracle scans all N.

### Pitfall 5: Existing code assumes every hedge leg is a book
**What goes wrong:** `HedgeLeg.bookKey`, `MoneylineQuote.bookKey`, Done snapshots, DTOs, `bookSelection` allowlist all assume sportsbooks; exhaustive type switches (A-02) will fail to compile or silently mis-render.
**How to avoid:** Add a discriminated `leg.kind: "book" | "market"` and let the compiler find every site; extend snapshots with nullable `contracts`, `priceCents`, `feeCents` columns via migration.

### Pitfall 6: Min-odds and promo constraints don't apply to the hedge
Hedge-side books have no min odds; the market leg is never the promo leg, so `passesBaseMinOdds` is unaffected. Do not let a market quote satisfy a promo's required-book check.

### Pitfall 7: Thin market with whole contracts on cheap events
At 1-3 contracts the fee rounds to 1c and swings profit by a visible percentage; require a minimum viable profit (> 0 after fee) and drop when N*=0.

## Code Examples

### Bonus-bet market hedge (outline, exact)
```typescript
// Bonus bet B at book decimal odds d (stake not returned): book pays B*(d-1) on win, 0 on loss.
// Hedge: N contracts at price p cents. Maximize min(Wbook, Wmkt).
//   Wbook = B*(d-1) - K(N)        (book bet wins, contract loses)
//   Wmkt  = N - K(N)              (book bet loses, contract wins)
// K(N) = N*p/100 + fee(N,p)
// Continuous: N0 ~ B*(d-1)/(1 - ...) ; search N in [N0-3, N0+3] clipped >= 1, keep max min().
// Tie-break equal min by larger max, then smaller N (deterministic).
```

### Oracle (test-only)
```typescript
// solveMarketHedge.oracle.ts: integer cents only, no Decimal in the loop.
// feeCentsKalshi(n,p) = ceil(7*n*p*(100-p) / 10000)   // 0.07*C*P*(1-P) in cents, P in cents
// feePolyCents(n,p)   = bankersRound(695*n*p*(100-p) / 1_000_000)
export function bruteForceBonusHedge(i: { bonusCents: number; dNum: number; dDen: number;
  priceCents: number; fee: (n: number, p: number) => number; maxN: number }) {
  let best = { n: 0, worst: -Infinity };
  for (let n = 1; n <= i.maxN; n++) {
    const cost = n * i.priceCents + i.fee(n, i.priceCents);
    const wBook = Math.floor((i.bonusCents * (i.dNum - i.dDen)) / i.dDen) - cost;
    const wMkt = n * 100 - cost;
    const worst = Math.min(wBook, wMkt);
    if (worst > best.worst) best = { n, worst };
  }
  return best;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Sportsbooks only (PROJECT.md) | Regulated prediction markets as hedge venues | Owner decision 2026-10-22/26 | Update PROJECT.md |
| Polymarket US fees ~5% sports/rebates | Theta 0.0695 standard taker, rebates only at $10M+ maker volume | 2026-10-19 schedule | Config-driven coefficients |
| Kalshi cents-only API | Dollar-string prices and fixed-point counts (`*_dollars`, `*_fp`) | 2026 API | Parse as strings into Decimal |

**Deprecated/outdated:** old cent-integer Kalshi orderbook fields (`yes`/`no` int arrays) in blog posts; use `orderbook_fp`.

## Runtime State Inventory

Not a rename phase, but there is persisted state to extend: 
| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | `user_books` rows (book keys), cached odds JSON (bookmakers array), Done snapshots (`doneSnapshot.ts`, `pairSnapshot.ts`) | Code edit: allowlist + new nullable snapshot fields via drizzle migration; no backfill (old snapshots are book-only). Existing cached odds lack venue rows until next refresh |
| Live service config | None | None |
| OS-registered state | None | None |
| Secrets/env vars | None needed (Odds API keys unchanged). Native Polymarket fallback would need credentials: not planned | None |
| Build artifacts | None | None |

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node/npm/Vitest | tests | assumed present (repo has tests) | package.json | — |
| Odds API key (free) | live smoke probe | present in project config (not read) | — | none: probe blocked without key |
| Kalshi public REST | optional depth | network, no auth | — | omit Thin-market |
| Polymarket US credentials | n/a | not needed | — | "price may move" |

**Missing dependencies with no fallback:** none confirmed. The probe costs about 1-2 credits and needs the owner's go-ahead (I did not spend credits during research).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^5.0.2 |
| Config file | `vitest.config.ts` (tests are `src/**/*.test.ts`; `*.oracle.ts` not matched) |
| Quick run command | `npx vitest run src/domain/market` |
| Full suite command | `npm test` (`vitest run`) |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MKT-01 | Venue entries off by default, grouped; saveBooks accepts venue keys, promo/bonus dropdown excludes them | unit | `npx vitest run src/domain/books src/config` | Wave 0 (new) |
| MKT-02 | `refreshBookmakerKeys().length <= 10`; estimate equals prior value with venues | unit | `npx vitest run src/ingestion/odds/status.test.ts src/ingestion/odds/quota.test.ts` | extend existing |
| MKT-03 | Odds API venue h2h parses; american -> cents round-trip for -9900..+9900 | unit | `npx vitest run src/domain/market/marketLeg.test.ts` | Wave 0 |
| MKT-04 | Fee tables: Kalshi ceil, Polymarket half-even, worked examples, pinned coefficients | table-driven | `npx vitest run src/domain/market/fees.test.ts` | Wave 0 |
| MKT-05 | Solver == brute-force oracle over seeded random (mulberry32) grids for bonus, promo, arb, pair top-up | property/oracle | `npx vitest run src/domain/market/solveMarketHedge.test.ts` | Wave 0 |
| MKT-06 | Rankers choose market when after-fee profit higher, book otherwise; member without market never sees one | unit | `npx vitest run src/domain/hedge src/domain/promos` | extend existing rank tests |
| MKT-07 | DTO carries contracts/price/fee/american; badges (NFL tie, price may move, thin) | unit + component | `npx vitest run src/domain/market/settlement.test.ts` | Wave 0 |
| MKT-08 | Done snapshot round-trips contracts/price/fee and recorded profit equals solver profit | unit | `npx vitest run src/domain/promos/doneSnapshot.test.ts src/domain/promos/pairSnapshot.test.ts` | extend existing |
| MKT-09 | Docs updated | manual | review diff | n/a |
| MKT-10 | Live: Odds API returns kalshi/polymarket_us h2h on the free key; price vs Kalshi orderbook ask | manual-only (spends credits, needs key) | script `scripts/smoke-venues.ts` (optional) | Wave 0 |

### Sampling Rate
- Per task commit: `npx vitest run src/domain/market` (plus the file touched)
- Per wave merge: `npm test`
- Phase gate: full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/domain/market/{fees,marketLeg,solveMarketHedge,settlement}.test.ts` and `solveMarketHedge.oracle.ts`
- [ ] Live probe of Odds API `us_ex` keys (human-gated, 1-2 credits)
- [ ] Guard test for bookmaker bucket size

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no change | iron-session unchanged |
| V3 Session Management | no change | — |
| V4 Access Control | yes | `saveBooks` stays server-session scoped; allowlist includes venue keys; per-member filter by `user_books` |
| V5 Input Validation | yes | Zod for Odds API and any native Kalshi responses; clamp price 1..99, contracts integer >= 1 |
| V6 Cryptography | no | no new secrets |

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/hostile upstream price (0, 100, negative) | Tampering | Zod range + reject price outside 1..99c |
| Odds API key leakage in errors | Information disclosure | Keep existing error-message discipline (T-01-13) |
| Native fetch SSRF / unvalidated URLs | Tampering | Fixed base URL constants, no user-supplied hosts |
| Misleading compliance posture | Repudiation/legal | CFTC note in My Books; no location-evasion copy (D-15) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Free Odds API key serves `us_ex` bookmakers (kalshi, polymarket_us) | Summary | High: if paid-only, D-05/D-06 make Polymarket drop (no native fallback), Kalshi needs native path |
| A2 | Odds API Kalshi/Polymarket h2h price represents the YES ask (taker price) | Venue API Facts | High: profits misstated; need native asks |
| A3 | Retail accounts are "direct members" (centicent fee precision); research defaults to cent ceil, which is conservative | Fees | Low: fee overstated by <1c |
| A4 | Kalshi taker multiplier M=1 is the safe (>=) fee for all supported sports | Fees | Low-Med: overstated fee only |
| A5 | `polymarket` (global) is unsuitable for US members; `polymarket_us` is the right key | Anti-patterns | Med: wrong key shows no/incorrect odds |
| A6 | Polymarket US available in Colorado for sports | Availability | Med: legal/user-facing |
| A7 | Kalshi per-series sports tickers and Polymarket public listing endpoints exist as assumed | Venue API | Low (only affects optional depth) |
| A8 | Prediction-market h2h from Odds API gives only plain `h2h` (no lay) | Venue API | Low |
| A9 | Polymarket US sports tie/postponement rules are per-market and not uniform | Settlement | Med: badge text |

## Open Questions (RESOLVED)

1. **Does the free Odds API key return `kalshi`/`polymarket_us`?**
   - Known: listed under `us_ex`, not flagged paid-only; free plan says "most bookmakers".
   - Unclear: actual entitlement and price semantics (ask/mid/last).
   - Recommendation: Wave 0 probe task (owner approves 1-2 credits); plan has a fallback branch: if only Kalshi returns, ship Kalshi alone; if neither, use Kalshi native public REST for prices (zero credits) and drop Polymarket.
   - **RESOLVED:** Answered by the Wave 0 live probe (plan 12-03, owner-approved, about 1 credit), which records branch A (both via Odds API), B (Kalshi only), C (Kalshi via its public API, Polymarket dropped) or D (no venue; re-scope) in 12-PROBE.md; plan 12-08 applies the branch to `src/config/books.ts`.
2. **Is the exchange price the ask?** Compare against Kalshi `/orderbook` in the same probe. Decide Odds-API-only vs native-priced Kalshi accordingly.
   - **RESOLVED:** The same 12-03 probe compares Odds API Kalshi cents with Kalshi's native ask; "not the ask" forces branch C (native asks, plans 12-15/12-16), applied in 12-08.
3. **Thin-market (D-13) scope:** `includeBetLimits` may supply depth cheaply; otherwise Kalshi native orderbook needs event matching. Recommend making this the last wave and shipping "price may move" first.
   - **RESOLVED:** Thin market is the last wave: Kalshi client/enrichment in 12-15, refresh wiring and the badge in 12-16; "Price may move" ships first with every engine (12-06, 12-09..12-14).
4. **Polymarket US Colorado eligibility:** confirm in-app / terms before the ship checkpoint.
   - **RESOLVED:** The owner checks Polymarket US Colorado eligibility at the 12-03 checkpoint; not eligible -> Polymarket dropped (branch B/C), applied in 12-08; unknown ships with the CFTC note (D-15).
5. **Kalshi fee precision (cent vs centicent) for the member's account type.** Default cent-ceil.
   - **RESOLVED:** Cent precision, rounded up (conservative; never overstates profit), as implemented in plan 12-02.
6. **Spreads/totals on venues (D-07):** coverage unverified; extended refresh should be tested on the same probe. Default: moneyline only in v1.
   - **RESOLVED:** Moneylines (D-07). No extra spreads/totals fetch for venues; a venue spread/total is used only if the existing extended refresh already returns the exact same line, through the existing exact-line matching.
7. **Fee-coefficient drift:** Polymarket US changed schedules at least 3 times in 2026. Pin in tests; add a "last verified" comment.
   - **RESOLVED:** Coefficients pinned in `src/config/venues.ts` with `FEES_LAST_VERIFIED` and source URLs, plus a pinning test (plan 12-02).

## Sources

### Primary (HIGH confidence)
- https://the-odds-api.com/sports-odds-data/bookmaker-apis.html - `us_ex` keys, paid-only flags
- https://the-odds-api.com/liveapi/guides/v4/ - cost = markets x regions; 10 bookmakers = 1 region; bookmakers overrides regions; lay and `includeBetLimits`
- https://docs.polymarket.us/fees.md - fee formula, Theta 0.0695, rounding, tiers (effective 2026-10-19)
- https://docs.kalshi.com/getting_started/orderbook_responses and /quick_start_market_data - public REST, bids-only book
- https://docs.kalshi.com/getting_started/fee_rounding - rounding and rebate mechanics
- Codebase: `src/config/books.ts`, `src/ingestion/odds/client.ts`, `quota.ts`, `status.ts`, `src/domain/hedge/*`, `src/domain/odds/schemas.ts`

### Secondary (MEDIUM confidence)
- https://www.quantvps.com/blog/kalshi-fees-explained - Kalshi 0.07/0.0175 formulas, fee_type, sports multipliers (official fee schedule PDF/page returned HTTP 429, not read directly)
- https://www.oddsshopper.com/articles/prediction-markets/kalshi-postponed-game-rules - 48h rule
- Kalshi CFTC filings (cftc.gov, via search) - tie pays 50c each
- https://www.cpr.org/2026/05/08/colorado-sports-gambling-kalshi-prediction-market/ and kunc.org - Colorado operation
- https://www.rivermarkets.com/insights/polymarket-us-fees.html - superseded earlier schedule (July 2026)

### Tertiary (LOW confidence)
- polyguana.com market summaries (Polymarket US market-specific tie/cancel rules)
- Colorado availability for Polymarket US from comparison sites

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new packages; codebase read
- Odds API coverage/credits: MEDIUM-HIGH - listing and cost formula verified; entitlement and price semantics unverified (A1, A2)
- Fees: MEDIUM - Polymarket official page read; Kalshi via secondary summary of official schedule
- Availability: MEDIUM (Kalshi), LOW-MEDIUM (Polymarket)
- Settlement: MEDIUM for Kalshi, LOW for Polymarket
- Architecture/solver: HIGH - derived from payoff structure; oracle plan mirrors existing practice

**Research date:** 2026-11-02
**Valid until:** 2026-11-09 for Polymarket fee schedule (fast-moving); 30 days for the rest
