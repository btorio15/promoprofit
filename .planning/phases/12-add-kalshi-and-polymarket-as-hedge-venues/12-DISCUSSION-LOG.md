# Phase 12: Add Kalshi and Polymarket as hedge venues - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-26
**Phase:** 12-add-kalshi-and-polymarket-as-hedge-venues
**Areas discussed:** Where they show up, Price source & credits, Fees, contracts & display, Liquidity & who can use it

---

## Where they show up

| Option | Description | Selected |
|--------|-------------|----------|
| Everywhere | Finder, promo hedges, pairs, no-sweat hedges, and book-vs-market arbs | ✓ |
| Promo hedges + finder only | Arbitrage tab stays sportsbook-only | |
| Arbitrage only | Book-vs-market sure bets only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pure best profit | Market wins whenever its after-fee profit is higher | ✓ |
| Prefer sportsbooks on ties | Book wins when profit is within a few cents | |
| Show both | Best book and best market side by side | |

| Option | Description | Selected |
|--------|-------------|----------|
| Count the same | Market-hedged profit counts in totals, lines and stats | ✓ |
| Count, but tag them | Count, with a "via Kalshi" tag | |
| Exclude from totals | Feed only | |

| Option | Description | Selected |
|--------|-------------|----------|
| No, always one sportsbook leg | Markets are only ever the hedge side | ✓ |
| Yes, include market-vs-market arbs | Kalshi vs Polymarket sure bets too | |

---

## Price source & credits

| Option | Description | Selected |
|--------|-------------|----------|
| Odds API first, fallback native | Add to bookmakers= list; native APIs only for gaps | ✓ |
| Native APIs only | Live prices and depth, new matching code | |
| Odds API only | Drop a venue the Odds API lacks | |

| Option | Description | Selected |
|--------|-------------|----------|
| Never cost more credits | Use native APIs or drop the venue instead | ✓ |
| Small increase OK | Up to about +1 credit per refresh | |
| Separate opt-in refresh | Own "Refresh markets" button | |

| Option | Description | Selected |
|--------|-------------|----------|
| Moneylines first, others if available | Spreads/totals only on exact same lines | ✓ |
| Moneylines only | | |
| Everything the venue lists | Including alternates | |

| Option | Description | Selected |
|--------|-------------|----------|
| Exclude risky matchups | Never suggest where settlement differs | |
| Allow with a badge | "Settlement differs" badge, like Tie risk | ✓ |
| You decide per sport | Research maps rules, Exclude by default | |

| Option | Description | Selected |
|--------|-------------|----------|
| Rank normally, badge only | Same as Tie risk | ✓ |
| Rank lower | | |
| Exclude from totals | | |

---

## Fees, contracts & display

| Option | Description | Selected |
|--------|-------------|----------|
| Exact published fee formula | Official schedules incl. rounding, decimal.js | ✓ |
| Flat conservative % | Fixed buffer, not exact | |

| Option | Description | Selected |
|--------|-------------|----------|
| Whole contracts, profit from rounded | Profit from the actual rounded buy + fees | ✓ |
| Ignore rounding | Continuous stake | |

| Option | Description | Selected |
|--------|-------------|----------|
| Native + American | "buy 42 YES @ 61¢ (+fee) ≈ −156" | ✓ |
| American odds only | | |
| Native only | | |

---

## Liquidity & who can use it

| Option | Description | Selected |
|--------|-------------|----------|
| Warn if over top-of-book | Best ask; "Thin market" or "price may move" note | ✓ |
| Walk the order book | Blended exact pricing, needs native depth | |
| Ignore depth | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Add them in My Books | "Prediction markets" group, off by default | ✓ |
| Separate setting | Settings toggle | |
| On for everyone | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Research checks CO, small note in app | Drop unavailable venues; one-line CFTC note | ✓ |
| Research only, no in-app note | | |
| No checks | | |

**Notes:** Owner accepted the default that Low-profile settings apply only to sportsbook legs.

---

## Claude's Discretion

- YES-on-other-side vs NO-on-this-side choice; market leg representation in the solvers; native-API matching/caching if needed; badge copy/styling; schema shape.

## Deferred Ideas

- Market-vs-market arbs; walking the order book; other exchanges (Prophet X, Novig, Sporttrade).
