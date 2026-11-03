# Phase 10: Ranked Intro Offers - Context

**Gathered:** 2026-11-03
**Status:** Ready for planning

<domain>
## Phase Boundary

New-customer (sign-up / intro) offers at books the member does NOT have yet are priced and ranked by estimated value, each with the exact qualifying bet and hedge from cached odds. The top ones appear in a separate "Best intro offers" section on Opportunities, and the full ranked list with whole-plan views appears on the Sign-up offers screen. Intro offers never mix with the promos list or its sort, and their profit never reaches the profit graph. Bonus bets (from intro offers AND from no-sweat refunds in the feed) are valued at a historical per-book conversion rate. Requirements: INTRO-01..INTRO-11.

Out of this phase: new scrapers (BetMGM, Hard Rock etc. are Phase 11), hand entry of intro offers, deposit-match bonuses.

</domain>

<decisions>
## Implementation Decisions

### Which offers count
- **D-01:** **Scraped sign-up offers only.** No hand entry of intro offers in this phase (it stays a Future Requirement). BetMGM's intro offer arrives with Phase 11's scraper. The owner's hand-added BetMGM no-sweat (#144) stays an ordinary no-sweat promo. INTRO-09's "including hand-entered" has nothing to apply to yet; the separation must still hold if hand entry is added later.
- **D-02:** "Books the member has" = their **saved books (My Books)**, the same rule as today's Sign-up offers screen. Adding a book to My Books hides its intro offer. No separate "intro used" list.
- **D-03:** Sign-up offers the app can't turn into bettable value (deposit-match, racing credit such as "Crown Cash", sweepstakes, anything not a bet & get or no-sweat first bet) are **left out of ranking**. They stay only in the plain informational list on the Sign-up offers screen and never appear in "Best intro offers".
- **D-04:** When a book has several usable intro offers, "Best intro offers" shows **only that book's highest-value offer**. The full list on Sign-up offers shows the others, marked "pick one".

### Valuing offers
- **D-05:** **Qualifying bet = the offer's minimum required stake**, hedged at one of the member's books on the line that loses the least, so the qualifying step costs cents and the value is nearly all bonus. Same market/line-matching and Low-profile rules as promos (min odds hard filter, Low-profile limits apply).
- **D-06:** **Win-only offers** (bonus paid only if the qualifying bet wins): size a hedge to **lock in part of the value either way**, a smaller but steadier result, rather than valuing at bonus × win probability. Win-or-lose offers are valued as above. No-sweat-first-bet offers use the Phase 8 no-sweat solver.
- **D-07:** Bonus bets are valued at each book's **14-day median of the recorded "median of top 5" conversion** (`bonus_conversion_snapshots.median_top_pct`, recorded since 2026-11-03 by quick task 261103-mok at a $100 reference).
- **D-08:** Until a book has **7 days** of snapshots, use a **fixed default rate of 65%**. Show which basis was used on the row (historical vs default).
- **D-09:** **Installments** ("$50 a day for 4 days") are each valued at the **same rate**, and each is shown with its own expiry in the plan.
- **D-10:** The historical rate applies **everywhere**: no-sweat promos in the feed switch from today's top-1 rate (Phase 8 D-01) to the same historical/default rate, so feed no-sweats and intro offers never disagree. Keep it behind the existing single injected `conversionRateFor` seam. The tracked no-sweat "Bet lost" card's live conversion options (actual hedges to place now) still come from today's cached odds.

### "Best intro offers" section on Opportunities
- **D-11:** Placed **below the promos** list.
- **D-12:** Shows the **top 3** books plus a **"See all"** link to the full ranked list on the Sign-up offers screen.
- **D-13:** Ranked by **total estimated value**, biggest first. It **ignores the Profit/ROI Sort switch** (always by value).
- **D-14:** Rows reuse the **approved no-sweat row look** (sketch 001 / quick 261103-lx2): collapsed row with book, offer and an "est. +$X" figure (never green); expand for the waterfall bars and the whole plan (qualifying bet + hedge, then each bonus bet as it arrives with expiry and a link to the bonus-bet finder); all notices in one (i) popover. Can't-price offers follow D-03 / INTRO-07 (headline only, "can't price" note, never invented odds).

### Tracking and recording profit
- **D-15:** **Track** pins the intro offer to the existing **Tracking strip** as a step checklist: qualifying bet + hedge → result → each bonus bet as it arrives (expiry + link to convert in the bonus-bet finder) → done.
- **D-16:** Tapping Track **adds that book to the member's My Books** automatically (they're signing up there).
- **D-17:** Recorded profit is the **real total**, like no-sweats: qualifying + hedge result, plus each bonus bet's actual conversion as it is marked done; editable if the member bet different amounts. Never the estimate.
- **D-18:** Intro-offer profit counts in its **own "Intro offers extracted" total** on the Dashboard. It is **not** added into the green extracted total and **not** shown on the profit graph (INTRO-10). Estimates never count anywhere (carried from Phase 9 D-12).

### Claude's Discretion
- How intro offers are stored with structured terms (INTRO-06: offer kind, qualifying stake, min odds, refund cap / bonus total, installments, requires-win, expiry), whether that's new columns on `signup_offers` or a new table, and how the AI reader extracts them. "Terms incomplete" offers rank lower (INTRO-06).
- Exact hedge-sizing math for win-only offers (D-06), as long as it's exact Decimal math with table-driven tests and a brute-force oracle like Phase 8.
- Exact median computation and how "7 days of snapshots" is counted (distinct Denver dates is the natural reading).
- Copy and labels, within the existing UI-SPEC voice.

### Folded Todos
- **"Support no-sweat bets (normal promos and intro offers) with a hedge algorithm"** (`.planning/todos/pending/2026-10-22-no-sweat-bets.md`, resolves_phase: 10). Phases 8–9 delivered the math and the feed part. The remaining piece, applying the no-sweat algorithm to no-sweat intro offers ("first bet back up to $X"), is in scope via INTRO-04. The todo's "later could use the app's own bonus-bet conversion history" is now D-07/D-10.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope and requirements
- `.planning/ROADMAP.md` §Phase 10: goal and success criteria 1–8
- `.planning/REQUIREMENTS.md`: INTRO-01..INTRO-11, Future Requirements and Out of Scope lists

### Prior decisions carried forward
- `.planning/phases/08-no-sweat-bet-math/08-CONTEXT.md`: no-sweat solver decisions (D-01 rate is superseded by this phase's D-10; D-05..D-11 still apply)
- `.planning/phases/09-no-sweat-promos-in-the-feed/09-CONTEXT.md`: Track flow, Tracking strip, estimates never counted, can't-price handling, Low-profile settings (D-20..D-23), exhaustive promo-type switches (D-19)
- `.planning/phases/09-no-sweat-promos-in-the-feed/09-UI-SPEC.md`: UI contract the no-sweat row came from
- `.planning/sketches/001-no-sweat-math-diagram/README.md` + `index.html`: approved row look (waterfall bars + single (i) popover)
- `.planning/quick/261103-lx2-no-sweat-row-waterfall-diagram-and-singl/261103-lx2-SUMMARY.md`: how that look was built
- `.planning/quick/261103-mok-record-bonus-bet-conversion-rate-history/261103-mok-SUMMARY.md`: the conversion history table this phase reads

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/domain/hedge/noSweat.ts` (`solveNoSweat`): no-sweat-first-bet intro offers.
- `src/domain/hedge/bonusBet.ts`, `rankBonusBetHedges.ts`: bonus-bet conversion math (stake not returned).
- `src/domain/hedge/conversionRate.ts` (`ConversionRateFor`, `topConversionFor`, `rankRefundOpportunities`): the single rate seam to swap to historical (D-10).
- `src/domain/hedge/conversionSnapshot.ts` + `src/db/bonusConversionSnapshots.ts`: recorded per-book history (`median_top_pct`, `denver_date`).
- `src/domain/promos/rankNoSweat.ts` / `rankNoSweatFeed.ts`: line search with min odds and Low-profile filters.
- `src/components/promos/NoSweatRow.tsx`, `NoSweatDetails.tsx`, `noSweatWaterfall.ts`, `NoSweatNoticesPopover.tsx`: row look to reuse (D-14).
- `src/components/opportunities/TrackingStrip.tsx`, `TrackedNoSweatCard.tsx`, `src/db/trackedNoSweats.ts`, `src/app/actions/track-no-sweat.ts`: Track pattern to extend into a multi-step checklist (D-15).
- Sign-up offers today: `src/ingestion/promos/signupOffers.ts` (extract, `parseSignupBonusAmount`), `src/ingestion/promos/signupStore.ts`, `src/db/signupOffers.ts` (`getActiveSignupOffers`), `src/domain/promos/signupOffers.ts` (informational DTOs, grouped by owned / not-owned books), `src/app/actions/get-signup-offers.ts`, `src/components/signup/SignupOffersScreen.tsx`.
- AI reader: `src/ingestion/promos/promoReading.ts`, `readerPass.ts`, `reconcile.ts` (for structured intro terms, INTRO-06).

### Established Patterns
- All money math in decimal.js, cent-exact, table-driven tests and brute-force oracles (`*.oracle.ts`).
- Server actions call `requireUser()` first; the member id only ever comes from the session.
- The `signup_offers` table is deliberately separate from `promos` (no profit math or dedupe crossover); the boundary test forbids `src/domain/promos/signupOffers.ts` importing `@/ingestion/promos`.
- Estimates are never green and never in Dashboard totals, the grey line or Statistics.
- Migrations touch the shared live Neon DB: generate with drizzle-kit (next free index after 0019; fetch origin first, since a teammate also adds migrations) and apply only with the owner's OK.

### Integration Points
- `src/app/actions/get-opportunities.ts` + `src/components/opportunities/OpportunitiesScreen.tsx`: add the separate "Best intro offers" section below promos (D-11), outside the promo sort.
- `src/components/opportunities/DashboardTotals.tsx` / `dashboardTotalsView.ts`: new "Intro offers extracted" figure (D-18). `ProfitGraph.tsx` / `profitGraphView.ts` / `src/db/profitHistory.ts` must exclude intro-offer profit.
- `src/app/actions/save-books.ts` / `saveUserBooks`: auto-add the book on Track (D-16).
- Odds: cached odds only (`getCachedEvents`), 0 Odds API credits.

</code_context>

<specifics>
## Specific Ideas

- Live examples to test against: DraftKings "Bet $5 Get $200 in Bonuses" and FanDuel "Bet $5, Get $50 for 4 days" (a $200 total in 4 daily installments).
- Today's recorded conversion medians are 67–73% per book; the 65% default sits just under that on purpose.
- Intro offers are one-time at each book, so the account-risk notice from Phase 9 applies; keep it in the single (i) popover.

</specifics>

<deferred>
## Deferred Ideas

- Hand entry of intro offers for books that can't be scraped (still a Future Requirement; owner chose scraped-only for Phase 10).
- A separate "intro offer already used" list independent of My Books (owner chose My Books).
- Ranking intro offers by value per dollar put up / following the Sort switch (owner chose total value, always).

### Reviewed Todos (not folded)
- **"2-bet pair solver can be a cent short of optimal at whole-dollar stakes"**: unrelated to intro offers; stays a pending todo.

</deferred>

---

*Phase: 10-ranked-intro-offers*
*Context gathered: 2026-11-03*
