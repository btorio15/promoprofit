# Phase 9: No-Sweat Promos in the Feed - Context

**Gathered:** 2026-10-22
**Status:** Ready for planning

<domain>
## Phase Boundary

Existing-customer no-sweat promos at DraftKings, FanDuel and Bally Bet stop being skipped. They become a real `no_sweat` promo type (scraper + AI reader), are priced with the Phase 8 solver, and are ranked in the Opportunities feed as labelled estimates. New-customer no-sweat offers are routed to Sign-up offers (ranking/valuing them is Phase 10). Members can also add no-sweats by hand at any book with odds. Instead of Mark done, a no-sweat is **tracked** through to settlement so the profit actually made (not the estimate) is recorded. Estimates never touch Dashboard totals, the profit graph's grey line or the Statistics tab. Requirements: FEED-01..05.

Not in this phase: ranking/valuing intro offers (Phase 10), parlay/SGP no-sweats, cash-refund pricing, new books (Phase 11).

</domain>

<decisions>
## Implementation Decisions

### Tracking a no-sweat and recording real profit (FEED-05)
- **D-01:** No-sweat rows have a **Track** button instead of Mark done. Tracking snapshots what was shown (game, line, qualifying stake/odds, hedge book/stake/odds, estimate, rate) and moves the row out of the ranked list.
- **D-02:** Tracked no-sweats are **pinned in a "Tracking" strip at the top of Opportunities** (above the ranked feed).
- **D-03:** Once the game's start time has passed, the tracked card asks **"How did it go? Bet won / Bet lost"**. The app can't see sportsbook accounts, so the member taps one. Before game start, the buttons are not offered.
- **D-04:** **Bet won** records the exact profit right away from the tracked stakes (qualifying winnings − hedge stake), with an option to edit if they actually bet different amounts/odds.
- **D-05:** **Bet lost** turns the pinned card into a **live bonus-bet hedge for the refund** (refund amount at the promo's book, priced the way the finder does: best market, hedge book, stakes, from cached odds). When the member marks that done, the real total is recorded: hedge winnings from the original bet + converted refund − lost qualifying stake.
- **D-06:** Real recorded no-sweat profit **counts in the green "profit extracted" line and Dashboard extracted totals**, on the day it is recorded. Nothing counts while a no-sweat is waiting to settle.
- **D-07:** If the member never enters a result, the card **stays "waiting" with a reminder** and counts $0. No auto-recording.

### How estimates rank and look (FEED-03, FEED-04)
- **D-08:** No-sweats are ranked inline with other promos by the **estimate** (the "est." figure on the card, i.e. Phase 8's best-rate-right-now value).
- **D-09:** The card shows **estimate + rate + worst case** at a glance, e.g. "est. +$14.20 at 78% · worst case −$3.10", with a small "est." label.
- **D-10:** **"Can't price"** no-sweats (no odds at the refund book) are shown at the bottom of the feed with a "can't price" note, never with an invented number.
- **D-11:** No-sweats with a **negative estimate** go wherever unprofitable bonus bets/boosts go today, not in the main ranked list.
- **D-12 (locked by FEED-04):** Estimates are excluded from Dashboard totals, the grey line (per-member daily available-profit record) and the Statistics tab.

### Adding no-sweats by hand
- **D-13:** The Add promo form gets a **No-sweat type**, allowed at **any book that has odds** (e.g. BetMGM, Caesars). Same solver, same "est." label, same Track flow.
- **D-14:** Manual fields: **refund cap, minimum odds, sport/league, expiry**, plus an optional market limit (moneyline/spread/total) like boosts have. Refund is assumed to be paid as a bonus bet (no cash-refund option).

### Review and misreads (FEED-01, FEED-02)
- **D-15:** When the scraper and AI reader disagree (no-sweat vs bonus bet), the review item shows the promo text, **both readings side by side** (e.g. "Scraper: no-sweat $25 cap, −200+" vs "Reader: bonus bet $25"), with one-tap **"It's a no-sweat" / "It's a bonus bet" / "Skip"**, using the existing review queue.
- **D-16:** **Parlay / same-game-parlay no-sweats stay skipped** with a clear skip reason (the solver covers single bets only). They are not sent to review.
- **D-17:** Scraped no-sweats that refund in **cash** go to **review**. They are not priced this phase.
- **D-18:** Existing data: skipped no-sweats are re-read on the next scrape. Already-stored promos are **re-checked once**, and any that now read as no-sweat are moved over (or go to review if unsure). The 2026-10-08 misread (no-sweat stored as bonus bet) is a regression test (FEED-02).
- **D-19:** A no-sweat is **never** shown or priced as a bonus bet. Replace binary `profit_boost ? boost : bonus` branches with exhaustive switches over promo type (research warning carried from Phase 8).

### Claude's Discretion
- What ROI % means for a no-sweat under the ROI sort (e.g. estimate ÷ total outlay).
- Exactly how the "waiting" reminder is shown, and whether a tracked card can be un-tracked/undone (mirror existing undo of Mark done).
- How "Bet won" edits are entered (stakes vs a final profit figure), and the exact snapshot shape stored at Track time.
- Whether the "Bet lost" bonus-bet card reuses the existing bonus-bet promo row/snapshot machinery or a dedicated tracked-row type.
- Schema shape for the new promo type and tracking state (migration via drizzle-kit, committed).

### Folded Todos
- **Support no-sweat bets with a hedge algorithm** (`.planning/todos/pending/2026-10-22-no-sweat-bets.md`): the math was done in Phase 8. This phase takes its ingestion parts (turn the `no_sweat` skip into a recognised type, update the reader prompt and review triage) and its feed parts (rank alongside bonus bets/boosts, clearly labelled as estimates). Its intro-offer part stays with Phase 10, so the to-do stays open.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements & scope
- `.planning/REQUIREMENTS.md`: FEED-01..05 (this phase), NSB-01..04 (solver it consumes), INTRO-04 (Phase 10 reuses the same type)
- `.planning/ROADMAP.md` § Phase 9: goal and success criteria
- `.planning/PROJECT.md` § Current Milestone v1.2: key owner answers (live finder rate, bet365 out, deposit-match out)
- `.planning/phases/08-no-sweat-bet-math/08-CONTEXT.md`: locked solver decisions (top-1 rate, worst case, can't price, stake = refund cap, precision)
- `.planning/todos/pending/2026-10-22-no-sweat-bets.md`: folded to-do (feed/ingestion parts)

### Research
- `.planning/research/SUMMARY.md`, `.planning/research/PITFALLS.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/FEATURES.md`: no-sweat pitfalls (binary type branches, pushes/voids, misreads), architecture notes for the feed integration

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/domain/hedge/noSweat.ts`, `src/domain/hedge/conversionRate.ts`, `src/domain/promos/rankNoSweat.ts`: Phase 8 solver, finder top-1 rate, and best-qualifying-line ranking. Feed integration calls these and does not re-derive anything.
- `src/domain/hedge/rankBonusBetHedges.ts` / `src/app/actions/find-hedges.ts`: pricing for the "Bet lost" refund bonus-bet card (D-05).
- `src/app/actions/mark-promo-used.ts`, `src/db/promoTracking.ts`, `src/domain/promos/doneSnapshot.ts`, `src/db/memberPromoState.ts`: the current Mark done flow (server recomputes, snapshot, `profitExtracted`), the model for Track and settle actions.
- `src/components/promos/MarkUsedButton.tsx`, `DonePromoRow.tsx`, `PromoRow.tsx`, `UnprofitablePromoRow.tsx`: row/button patterns for the Track button, tracked card and can't-price/negative rows.
- `src/components/promos/AddPromoForm.tsx`, `BonusBetFields.tsx`, `BoostFields.tsx`, `src/domain/promos/addedPromoInput.ts`, `buildAddedPromo.ts`: manual-add form. Add a NoSweatFields sibling.
- `src/components/promos/ReviewPanel.tsx`, `QueueItemCard.tsx`, `src/db/promoReview.ts`: review queue for D-15.

### Established Patterns
- Ingestion: `src/ingestion/promos/exclusions.ts` currently returns `"no_sweat"` as a skip reason (NO_SWEAT_RE). `src/ingestion/promos/reviewTriage.ts` lists `no_sweat`. `promoReading.ts`/`promoReader.ts`/`reconcile.ts` handle scraper-vs-reader agreement. Per-book scrapers live in `src/ingestion/promos/books/`. New-customer routing goes through `src/ingestion/promos/signupOffers.ts` / `signupStore.ts`.
- Promo type list: `src/domain/promos/types.ts` (`PROMO_TYPES`). Adding `no_sweat` must be followed through every switch (D-19).
- Guaranteed-only numbers: `src/domain/promos/dashboardTotals.ts`, `profitSeries.ts`, `src/db/profitHistory.ts`, `src/db/memberFeedRecording.ts`, `src/app/actions/get-stats.ts`. Estimates must be filtered out of the grey line/available totals/stats, while recorded real no-sweat profit flows into extracted totals (D-06, D-12).
- Feed sort: `src/components/opportunities/SortSwitch.tsx` (Profit $ / ROI %), `src/domain/opportunities/`.
- Money math with decimal.js only, server recomputes and never trusts client numbers. Table-driven Vitest tests.

### Integration Points
- Opportunities screen (`src/components/opportunities/OpportunitiesScreen.tsx`): new Tracking strip above the feed.
- DB schema (`src/db/schema.ts`): new promo type and tracked/settled state. Migration committed. Note the teammate pushes migrations to main directly, so fetch first.

</code_context>

<specifics>
## Specific Ideas

- The owner's idea for FEED-05: "a track button that pins the no sweat and updates it with the bonus bet after the original bet settles."
- Card text shape: "est. +$14.20 at 78% · worst case −$3.10".
- Review shape: "Scraper: no-sweat ($25 cap, −200+)" vs "Reader: bonus bet ($25)" with one-tap buttons.

</specifics>

<deferred>
## Deferred Ideas

- Parlay / same-game-parlay no-sweats: need different math, kept skipped.
- Pricing cash-refund no-sweats (they'd be guaranteed): sent to review for now, not priced.
- Auto-recording worst case after N days for untouched tracked bets: rejected for now (D-07).

### Reviewed Todos (not folded)
- **2-bet pair solver can be a cent short** (`.planning/todos/pending/2026-10-03-two-bet-pair-solver-rounding.md`): unrelated solver, stays a separate fix.

</deferred>

---

*Phase: 09-no-sweat-promos-in-the-feed*
*Context gathered: 2026-10-22*
