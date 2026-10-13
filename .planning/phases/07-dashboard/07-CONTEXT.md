# Phase 7: Dashboard - Context

**Gathered:** 2026-10-13
**Status:** Ready for planning

<domain>
## Phase Boundary

The Opportunities tab becomes the **Dashboard** (tabs: Dashboard · Stats · Arbitrage · Promos · Tools; Dashboard stays the home tab; the teammate's separate stats tab is renamed Stats, D-15). At the top: a totals card (headline totals + simple counts), then the existing Phase 6 profit graph card, then the full ranked opportunities feed. The old separate profit summary card (`ProfitSummary`, today rendered on the Opportunities screen below the graph — it is already gone from the Promos tab) is replaced by the new totals card. Requirements STATS-07..STATS-10.

Out of scope: new stats beyond those listed (by-book / by-type breakdowns, history tables), changing the graph's math or start day, the feed's ranking.
</domain>

<decisions>
## Implementation Decisions

### Which numbers count
- **D-01:** "Available" totals (all-time, last 7 days, last 30 days) come from the member's OWN record — `member_profit_observations`, the same source and rules as the graph's grey line (own books, "Your cap", private promos, pairs counted once, best value per promo, Denver days). NOT the old group-wide `promo_profit_observations` / `loadAvailableProfit` path that the current summary uses. Consequence accepted: available only counts from the graph start day (Oct 13, 2026).
- **D-02:** "Extracted" headline is **all-time**: every `promo_completions.profit_extracted` for the member, including promos marked done before Oct 13 (owner currently $33.09).
- **D-03:** "Last 7 days" and "Last 30 days" each show **extracted with available**, e.g. "Last 7 days: $10.79 extracted of $2.56 available". Extracted placed on the Denver day of `completed_at` (same rule as the graph's green line, Phase 6 D-10); windows use the existing Denver-day helpers (today minus 6 / minus 29).
- **D-04:** Labels state the time basis so a larger extracted than available never looks wrong: "Extracted all-time" and "Available since Oct 13" (the graph start day, formatted short; derive it, don't hard-code).
- **D-05:** All money exact to the cent (decimal.js, `formatUsd`); nothing displayed is derived from float math.

### Top-of-page layout
- **D-06:** **Option B — two cards** (owner picked from desktop mockups, see canonical refs): (1) a **totals card** with the four totals and a counts line under them, (2) the **existing graph card** below it, unchanged, keeping its own range headline ("Extracted $X of $Y available") framed as "since Oct 13" so it does not contradict the all-time totals above. Then the feed.
- **D-07:** "Hide graph" hides **only the graph card**; the totals card is always visible (a "Show graph" control remains reachable, e.g. in the collapsed graph bar as today).
- **D-08:** Phone: the totals card shows a **2 × 2 grid** (Extracted all-time / Available since Oct 13 on top; Last 7 days / Last 30 days below) with the counts as one wrapping line under it. Must satisfy success criterion 5 (first opportunity visible without much scrolling); desktop shows the four totals in one row (as in the mockup).

### The three counts
- **D-09:** Counts are **all-time** (they do not follow the graph's 7d / 30d / All picker).
- **D-10:** A **pair counts as one promo**: "promos done" excludes the pair's `0.00` member-marker completion row (Phase 6 A5: the primary row stores the pair profit, the marker row stores "0.00"); average = total extracted ÷ promos done. Owner check value today: 10 done, $33.09, avg $3.31 (12 raw rows).
- **D-11:** "Best promo" shows **$ + book + promo name** (name trimmed to fit), e.g. "Best $9.05 · DraftKings · College Football 50% Profit Boost".

### Tab name and header
- **D-12:** The tab trigger reads **"Dashboard"** (internal tab id may stay `opportunities` if renaming adds risk — Claude's discretion).
- **D-13:** Page heading: **"Dashboard"** with subtitle **"Your profit so far, and the best money available right now at your books."**
- **D-14:** The feed gets a small **"Opportunities"** section heading above the "Sort by" row.


### Teammate's Dashboard tab (added 2026-10-13 after commit 456ea6e by teammate dico1108)
- **D-15:** The teammate's separate "Dashboard" tab (`src/components/dashboard/DashboardScreen.tsx`, `get-dashboard-stats.ts`: average profit available by Denver hour, profit by sport and game weekday, from `profit_snapshots`) is **renamed "Stats"** and kept as its own tab. Phase 7's Dashboard is still the renamed Opportunities tab (D-12..D-14). Tab id/labels must not collide: internal id for theirs becomes `stats`.
- **D-16:** Tab order: Dashboard · Stats · Arbitrage · Promos · Tools (Stats keeps the slot the teammate gave it, right after the home tab) — Claude may adjust only if it hurts phone tab-bar fit.
- **D-17:** Owner accepts the teammate's schedule change: every scheduled scrape run (15:37, 18:37, 22:37 UTC) also runs the moneyline odds refresh + profit recording (~4 credits/run, ~360 of 1,000 credits/month with key rotation), and the Vercel cron is removed (GitHub schedule is the only daily trigger). Phase 7 must not add any further automatic Odds API spending.

### Claude's Discretion
- Best promo when it is a pair: label as "<BookA> + <BookB> pair" with the pair's profit.
- Empty states: no completions → counts line reads "No promos done yet" and extracted shows $0.00; no member observations yet → "Available since <start>" shows $0.00 (or the graph's not-ready wording if the table is unavailable).
- Whether the totals card is a new component vs reshaping `ProfitSummary`; whether totals are computed in `get-opportunities` / `feedContext` (preferred: same request, no extra round trip) or a sibling loader.
- Removing now-unused code paths (`loadAvailableProfit` callers, unused fields on the Promos response) if nothing else needs them.

### Folded Todos
- **Stats overhaul** (`.planning/todos/pending/2026-09-30-stats-overhaul.md`, `resolves_phase: 7`): the owner's "stats overhaul + profit graph" request. Phase 6 delivered the graph; this phase delivers the coherent stats redesign (one source for available, clear labels, counts). It auto-closes when Phase 7 completes.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Owner-approved layout
- Desktop mockups the owner chose from (Option B + "keep the totals" hide behavior): https://claude.ai/artifact/M1k9kqahCUcGAnLPGu8NwV — mirrors the app's dark theme; numbers are the owner's real figures as of 2026-10-13.

### Prior phase decisions
- `.planning/phases/06-profit-graph/06-CONTEXT.md` — graph decisions D-04 (start day, no estimates), D-05..D-07 (what "available" includes), D-10 (extracted by Denver day of completion), D-11..D-17 (graph card behavior, hide/show, headline).
- `.planning/phases/06-profit-graph/06-UI-SPEC.md` — graph card visual contract (colors: green = extracted only; selected range = foreground on background; 44px touch targets).
- `.planning/phases/06-profit-graph/06-07-SUMMARY.md` — selected-range visibility fix and the Turbopack stale-CSS note for local checks.
- `.planning/phases/06-profit-graph/06-REVIEW.md` — WR-04 (labeling of pre-start-day completions) is resolved by D-02/D-04 here.

### Requirements
- `.planning/REQUIREMENTS.md` — STATS-07..STATS-10.
- `.planning/ROADMAP.md` — Phase 7 success criteria 1–5.
</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/promos/ProfitSummary.tsx`: current summary card (Total profit available / Total profit extracted / Last 7 / Last 30) — the thing being replaced; reuse its card styling.
- `src/components/opportunities/ProfitGraph.tsx` + `profitGraphView.ts`: the graph card (hide/show via `STORAGE_KEYS.profitGraphHidden`); stays as is.
- `src/domain/promos/profitSeries.ts`: per-member daily gains (available from `member_profit_observations`, extracted from completions) — the natural source for D-01/D-03 sums.
- `src/domain/promos/profitTotals.ts`: Denver-day helpers (`addDays`, week/month starts), `sumProfitExtracted`.
- `src/domain/promos/pairSnapshot.ts`: identifies pair primary vs marker rows (needed for D-10).
- `src/lib/format` `formatUsd` and decimal.js for all money.

### Established Patterns
- Data arrives with the feed in one `getOpportunities` call (`profitSeries` already embedded); keep totals in the same response (no client-supplied ranges, `requireUser()` first).
- Tabs live in `src/components/AppShell.tsx` (`ActiveTab` union, `TabsTrigger` labels); all tab panels stay mounted.
- Copy is plain English, phone-first (`min-h-11` touch targets), no emoji.

### Integration Points
- `src/components/AppShell.tsx` — tab label "Opportunities" → "Dashboard".
- `src/components/opportunities/OpportunitiesScreen.tsx` — page heading/subtitle, totals card above `ProfitGraph`, "Opportunities" section heading above `SortSwitch`, remove `ProfitSummary` usage.
- `src/app/actions/get-opportunities.ts` / `src/db/feedContext.ts` — compute totals + counts for the session member.
- `src/app/actions/get-promos.ts` — may still compute summary fields no longer shown anywhere.
</code_context>

<specifics>
## Specific Ideas

- Owner reviewed desktop-size mockups before choosing; layout B ("Totals card, then graph card") with the graph card keeping its own "since Oct 13" headline.
- Example copy from the mockup: "Extracted all-time $33.09", "Available since Oct 13 $2.56", "Last 7 days $10.79 of $2.56", "10 promos done · avg $3.31 each · best $9.05 · DraftKings CFB 50% boost".
</specifics>

<deferred>
## Deferred Ideas

- No-sweat bets are misread as bonus bets by the promo reader (2026-10-08, DraftKings Eagles vs Jaguars) — owner has not yet asked for the fix ("skip no-sweats"); not part of this phase.
- Audit page follow-ups (CI checks workflow, Odds API fetch timeouts, scrape-failure alerts, per-IP login limit, table retention) — backlog candidates, not this phase.
- 2-bet pair solver 1¢ rounding todo (`.planning/todos/pending/2026-10-03-two-bet-pair-solver-rounding.md`) — reviewed, not folded (unrelated to the Dashboard).
</deferred>
