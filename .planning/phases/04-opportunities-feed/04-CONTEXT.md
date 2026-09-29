# Phase 4: Opportunities Feed - Context

**Gathered:** 2026-09-29
**Status:** Ready for planning

<domain>
## Phase Boundary

A new **Opportunities** tab — the app's landing screen — that pulls the top profit opportunities from across the site into one phone-friendly view: the best single-promo hedges, the new **paired promos** (two books' promos on opposite outcomes of the same game/market, CALC-07 / DASH-05), and the best arbitrage bets. Sortable by guaranteed profit or ROI, limited to what the member can actually bet at their own books. Requirements: DASH-01, DASH-03, DASH-05, CALC-07.

Not in this phase: new promo sources or promo entry (Phase 5), exchange / prediction-market arbs (out of scope), alerts.

</domain>

<decisions>
## Implementation Decisions

### Screen layout & tabs
- **D-01:** Opportunities is a **new, separate tab** named **"Opportunities"**. It is the **first tab and the tab the app opens on**. Top-level tabs (updated 2026-09-29 during UI-SPEC): **Opportunities | Arbitrage | Promos | Tools** — four tabs, fits a phone without scrolling. **Tools** holds the Bonus bets finder and Sign-up offers (as sub-sections/sub-tabs).
- **D-02:** Opportunities is the **site-wide "best money right now" view**, not a replacement for the Promos tab. Owner: "Kalshi/Polymarket arb data will come later, so Opportunities will just grab the top profit opportunities across the site." Build it as a set of **sources** so more can be added later without reworking the screen.
- **D-03:** Phase 4 sources: **promo hedges** (each active promo's best single hedge — what the Promos tab ranks today), **paired promos** (new), and **arbitrage** (the Arbitrage tab's cached-odds arbs). Bonus-bet finder results are NOT a source (nothing is stored; it's a calculator).
- **D-04:** Show the **top 5 per source**, as grouped sections (e.g. "Best promos", "Best pairs", "Best arbs"). Each section can link to its full tab (Promos / Arbitrage) for everything else.
- **D-05:** The profit summary (**Total profit available**, **Total profit extracted**, today/week/month available) sits at the **top of Opportunities**. (Whether it also stays on Promos is Claude's discretion — avoid visual duplication.)
- **D-06:** (updated 2026-09-29, supersedes "own Review tab") The **review queue ("Needs review", "Needs a look") and the scrape freshness lines live inside the Promos tab** as their own sub-section/sub-tab alongside Active and Done (e.g. Active | Done | Review (N)), not a top-level tab.
- **D-06a:** Opportunities sections **Best promos** and **Best arbs** get **"See all"** links that switch to the Promos / Arbitrage tab.
- **D-06b:** Under the ROI sort, bonus-bet promos rank by their **conversion %** mixed in one ordering with boosts' and arbs' ROI; each row labels which % it shows.

### Paired promos (CALC-07 / DASH-05)
- **D-07:** A pair shows as **one combined card**: both legs (book, side, odds, stake), the paired guaranteed profit and ROI, and beneath it the comparison "vs. $X + $Y hedging each separately".
- **D-08:** Show a pair **only when pairing beats hedging each promo separately** (paired profit > sum of the two single-hedge profits).
- **D-09:** Pair types: **boost + boost** and **boost + bonus bet**. Not bonus + bonus. Each leg's promo mechanics and caps apply (max stake, max winnings, min odds, stake-not-returned for bonus bets). Exact decimal math (decimal.js), per project constraints.
- **D-10:** **Best pair per promo:** each promo appears in at most one pair — the most profitable non-conflicting combination — so suggestions never conflict.
- **D-11:** **Mark done on a pair marks both promos done**, saving one snapshot (both legs, stakes, odds, paired profit) and adding the paired profit once to Total profit extracted. Reuse the 260929-igk snapshot/odds-changed rules (server recomputes; reject if odds changed since load).
- **D-12:** **Total profit available counts a winning pair once**, using the pair's profit in place of its two single-hedge profits (no double counting).

### Sorting
- **D-13:** A **profit / ROI sort switch** at the top of both **Opportunities** and **Promos**. On Opportunities it re-picks the top 5 in every section by the chosen measure.
- **D-14:** Default sort is **guaranteed profit ($)**.
- **D-15:** The choice is **remembered per device** (browser storage, wrapped so it degrades to the default).

### Book filtering (DASH-03)
- **D-16:** **Opportunities excludes promos at books the member doesn't have** — every item on it is something they can bet now. (Those promos still appear on Promos, dimmed and last, and the books appear under Sign-up offers.)
- **D-17:** **Hedge side is limited to the member's own books** everywhere on Opportunities.
- **D-18:** **Pairs and arbs require both books to be the member's.**
- **D-19:** **Promos tab keeps its current rule** (other-book promos dimmed and sorted last — WR-07, Phase 3).

### Planning-time decisions (2026-09-29, after research)
- **D-20:** A promo that is part of a displayed pair **still appears on its own in Best promos**. Marking either the pair or the single done removes the promo from both.
- **D-21:** **Best arbs on Opportunities are ranked at a fixed $100 total stake** (owner choice), stated in the section caption; independent of the Arbitrage tab's stake setting.
- **D-22:** Today/week/month "available" figures stay **singles-only** (pair-awareness applies only to Total profit available, D-12).
- **D-23:** Pair odds-changed check compares **guaranteed profit and both stakes** to what the member saw.
- **D-24:** Pair ROI = guaranteed profit / cash staked (a bonus-bet leg costs $0).

### Claude's Discretion
- Exact card layouts, section headings, empty states per section ("No pairs right now"), and how odds age / "odds changed" is surfaced on Opportunities — follow 03-UI-SPEC patterns and the existing PromoRow / ArbRow components.
- Whether "see all" links switch tabs in place or are omitted.
- Pair search algorithm (matching opposite outcomes across books within each promo's scope, and choosing non-conflicting best pairs) — research/planning decides; must be exact and fixture-tested.
- Whether the profit summary is shown once (Opportunities) or on both tabs.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope & requirements
- `.planning/ROADMAP.md` §Phase 4 — goal and 4 success criteria
- `.planning/REQUIREMENTS.md` — DASH-01, DASH-03, DASH-05, CALC-07; Out of Scope table (exchange/prediction-market hedges excluded)
- `.planning/PROJECT.md` — core value (correct to the cent), constraints

### Prior decisions & UI contract
- `.planning/phases/03-promo-scraping-review/03-CONTEXT.md` — promo scope model, caps, review decisions
- `.planning/phases/03-promo-scraping-review/03-UI-SPEC.md` — Promos tab UI contract (spacing, 44px targets, row patterns) to extend
- `.planning/phases/01.1-arbitrage-tab/01.1-CONTEXT.md` — arbitrage tab decisions (odds age, account-risk advisory)
- `.planning/quick/260929-igk-mark-done-snapshots-promo-done-tab-total/260929-igk-PLAN.md` + SUMMARY — mark-done snapshot, odds-changed rejection, Total profit extracted (pairs must reuse)
- `.planning/quick/260927-n12-*/` — Total profit available / profit observations rules

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/domain/hedge/profitBoost.ts`, `bonusBet.ts` — per-leg promo math with caps (decimal.js); pairs combine two legs of these.
- `src/domain/promos/rankPromoHedges.ts` — best single hedge per promo within its scope; source for "Best promos" and the "separately" comparison.
- `src/domain/hedge/rankArbs.ts`, `arbMath.ts`, `src/app/actions/find-arbs.ts` — arbitrage source.
- `src/app/actions/get-promos.ts` + `src/domain/promos/promoRowDto.ts` — promo feed DTOs, own-books partition, profit totals, done split.
- `src/domain/promos/doneSnapshot.ts`, `src/db/promoTracking.ts`, `src/app/actions/mark-promo-used.ts` — mark-done snapshot + undo (extend for pairs).
- `src/components/promos/ProfitSummary.tsx`, `PromoRow.tsx`, `DonePromoRow.tsx`, `ReviewQueueSection.tsx`, `ScrapeStatusPanel.tsx`; `src/components/arb/*` rows.
- `src/components/finder/FinderForm.tsx` — existing localStorage pattern for per-device preferences.

### Established Patterns
- Tabs live in `src/components/AppShell.tsx` (`TabsList variant="line"`, `keepMounted` contents, `activeTab` state defaulting to "bonus" today).
- Money math only through decimal.js; format at display.
- Server actions call `requireUser()` first; per-user data filtered by session user id.
- Odds come only from Postgres cache (no API credit spent by viewing).

### Integration Points
- AppShell tab list + default tab; Promos screen loses the review queue + scrape status to the new Review tab.
- Profit totals (available/extracted) must account for pairs (D-11, D-12).

</code_context>

<specifics>
## Specific Ideas

- Example pair the owner had in mind: a DraftKings boost on one side and a FanDuel boost on the other side of the same game, hedged against each other.
- Opportunities should feel like "the top of everything" — short sections, top 5 each, phone-first.

</specifics>

<deferred>
## Deferred Ideas

- **Kalshi / Polymarket arbitrage as an Opportunities source** — owner plans it later. Currently Out of Scope (exchange / prediction-market hedges); needs a roadmap/scope change. Opportunities is structured as sources so it can be added.
- **Scheduled scrape never fires** — tracked open item from Phase 3 (STATE blockers); owner chose to fix it alongside Phase 4, but it is infrastructure, not a Phase 4 feed capability.
- **Phase 5 note:** add-promo game selection should use the 260929-hht search/date-range picker, not a dropdown.

</deferred>

---

*Phase: 04-opportunities-feed*
*Context gathered: 2026-09-29*
