# Phase 8: No-Sweat Bet Math - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-10-22
**Phase:** 08-no-sweat-bet-math
**Areas discussed:** Refund value rate, Which bets qualify, Stake size & rounding

---

## Todos

| Option | Description | Selected |
|--------|-------------|----------|
| No-sweat bets note | 2026-10-22 note describing the no-sweat math | ✓ |
| Pair-solver 1¢ rounding | Separate pairMath.ts bug | |

## Refund value rate

| Option | Description | Selected |
|--------|-------------|----------|
| Best rate right now | Finder top-1 for that book across hedge books | ✓ |
| Middle of the top few | Median of finder's top 5 | |
| Best rate minus a cushion | Top-1 minus a fixed few points | |

**User's choice:** First asked for the risk of each option to be explained. After the explanation (top-1 runs a bit optimistic because the refund is converted days later; median underestimates and is jumpy with few books, about $1–2 difference on a $25 refund), the owner chose "best rate now".

| Option | Description | Selected |
|--------|-------------|----------|
| Yes, show worst case | Profit if refund worth $0 | ✓ |
| No, estimate only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| My books | Only member's My Books as hedge books for the rate | ✓ |
| All covered books | | |

## Which bets qualify

| Option | Description | Selected |
|--------|-------------|----------|
| Same as other promos | Moneylines + spreads/totals with existing matching rules | ✓ |
| Moneylines only | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Only search eligible games | Respect known sport/league limit; else search all | ✓ |
| Always search everything | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Min odds hard rule | Never suggest lines below the minimum | ✓ |
| Allow with a warning | | |

## Stake size & rounding

| Option | Description | Selected |
|--------|-------------|----------|
| Exactly the refund cap | Bet = cap | ✓ |
| Let me choose, default to cap | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Follow my stake setting | Existing whole/cents StakePrecision | ✓ |
| Always cents | | |
| Always whole dollars | | |

## Claude's Discretion

- How to hedge (owner skipped): equal-outcome split at the estimated rate, worst case shown alongside.
- Module layout, result type, "can't price" representation, push/void handling.

## Deferred Ideas

- Median/cushioned conversion rate (swappable later via the injected rate function)
- User-chosen qualifying stake below the cap
