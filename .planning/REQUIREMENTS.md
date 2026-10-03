# Requirements: MarginMind (PromoProfit) — Milestone v1.1 Profit Stats

**Defined:** 2026-10-03
**Core Value:** Show every profitable opportunity from current promos, ranked by guaranteed profit, with the exact stakes and hedge book — correct to the cent, so a user can just pick and place bets.
**Milestone goal:** Each member can see how much profit was on offer at their books over time, next to how much they actually captured.

## v1.1 Requirements

### Profit graph

- [ ] **STATS-01**: Member sees a cumulative profit graph at the top of the Opportunities (home) page
- [ ] **STATS-02**: Grey line = running total of profit available at the member's books — each promo counted once, at its best observed guaranteed profit, on the Denver day it was first seen
- [ ] **STATS-03**: Green line = running total of profit the member personally extracted (Mark done), by Denver day of completion
- [ ] **STATS-04**: Member can switch the graph between Last 7 days, Last 30 days, and All time
- [ ] **STATS-05**: Hovering/tapping a day shows that date with both running totals, exact to the cent
- [ ] **STATS-06**: Graph is readable on a phone; a member with no history sees a short "nothing yet" message instead of an empty chart

### Stats page

- [ ] **STATS-07**: Member can open a Stats page from the main navigation; it shows the same graph and range picker
- [ ] **STATS-08**: Stats page shows headline totals: total profit extracted, total profit available, last 7 days, last 30 days
- [ ] **STATS-09**: Stats page shows simple counts: promos completed, average profit per completed promo, best single promo
- [ ] **STATS-10**: Promos tab no longer shows the profit summary — those numbers live on the Stats page

## Future Requirements

- Breakdowns by sportsbook, promo type, or sport
- Group total or leaderboard across members
- Completed-bets history list
- 90-day graph range

## Out of Scope

| Feature | Reason |
|---------|--------|
| History for undone promos | Undoing Mark done deletes the completion row by design; the green line reflects only current completions |
| Other members' numbers | Owner chose own-numbers-only for privacy within the group |
| New stored data / schema change | Both lines derive from existing `promo_profit_observations` (since 2026-09-27) and `promo_completions` |

## Constraints carried forward

- All money math with decimal.js; format to cents only at display (CLAUDE.md)
- Denver (America/Denver) day bucketing, matching `src/domain/promos/profitTotals.ts`
- Available-profit history starts 2026-09-27 (when observations began)

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| STATS-01 | Phase 6 | Pending |
| STATS-02 | Phase 6 | Pending |
| STATS-03 | Phase 6 | Pending |
| STATS-04 | Phase 6 | Pending |
| STATS-05 | Phase 6 | Pending |
| STATS-06 | Phase 6 | Pending |
| STATS-07 | Phase 7 | Pending |
| STATS-08 | Phase 7 | Pending |
| STATS-09 | Phase 7 | Pending |
| STATS-10 | Phase 7 | Pending |

---
*Requirements defined: 2026-10-03*
*Roadmap created: 2026-10-03 (10/10 mapped)*
