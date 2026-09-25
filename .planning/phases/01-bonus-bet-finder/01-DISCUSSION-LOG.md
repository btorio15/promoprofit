# Phase 1: Bonus Bet Finder - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-25
**Phase:** 1-Bonus Bet Finder
**Areas discussed:** Search scope, Finder inputs & results, Refresh & credits, Book coverage

---

## Search scope

| Question | Options | Selected |
|----------|---------|----------|
| Sports | NFL / NBA / MLB / NHL | "What do you recommend" → Claude recommended the 4 pro leagues; user then added college sports |
| Add college? | Next area / Add college sports / More questions | Add college sports |
| Markets | Moneyline only / ML + half-point spreads/totals | Moneyline only |
| Window | Next 7 days / Next 48 hours / Everything | Next 7 days |
| Skip out-of-season | Yes / No | Yes |

**Notes:** In Refresh & credits the user dropped NHL for now → final list NFL, NBA, MLB, NCAAF, NCAAB.

---

## Finder inputs & results

| Question | Options | Selected |
|----------|---------|----------|
| Extra inputs | Min odds rule / Sport filter / Nothing else | Min odds rule + Sport filter |
| Result count | Top 10 / Top 3 / All paginated | Top 10 |
| Row detail | Compact + expand / Everything inline | Compact + expand |
| Hedge pick | Best book only / Best + runners-up | Best book only |

---

## Refresh & credits

| Question | Options | Selected |
|----------|---------|----------|
| Refresh fetches | All in-season sports / Only filtered sport | All in-season sports, drop NHL for now |
| Cooldown | 15 min / 5 min / None | No cooldown, but confirm when refreshing within 15 min of the last refresh |
| Low credits | Warn <100, block <20 / Block at 0 | Warn <100, block <20 |
| Stale odds | Age + warning / Age only | Age + warning |

---

## Book coverage

| Question | Options | Selected |
|----------|---------|----------|
| Bonus book | API-covered only / Show all, disable uncovered | API-covered only |
| Hedge books pre-Phase 2 | All API books / Temporary checklist | All API books |
| Caesars/Fanatics paid-only | Leave them out / Ask me then | Leave them out |
| Same-book hedge | Never / Allow | Allow |

---

## Claude's Discretion

- Layout/styling, cache schema, refresh implementation, credit estimate, pre-auth access approach.

## Deferred Ideas

- NHL, spreads/totals, runner-up hedge books.
