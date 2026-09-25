# Phase 1: Bonus Bet Finder - Context

**Gathered:** 2026-09-25
**Status:** Ready for planning

<domain>
## Phase Boundary

A user enters a book and a bonus-bet amount and sees, from cached Colorado odds, a ranked list of the best markets to convert it on, each with the best hedge book, exact stakes, guaranteed profit, and conversion %. The phase also builds the project scaffold, the Colorado book configuration (verified against a live Odds API call), odds ingestion with caching, a user-triggered refresh button, a credit meter, and odds-age display, plus the fixture-tested bonus-bet hedge engine (CALC-01, CALC-04, CALC-05, ODDS-01..05, BONUS-01).

Not in this phase: login and per-user book selection (Phase 2), the account-risk advisory (Phase 2, CALC-06), boost math (Phase 3), promos, scraping, and the opportunities feed (Phases 3–5).

</domain>

<decisions>
## Implementation Decisions

### Carried from PROJECT.md (locked)
- Hedge stakes equalize profit across both outcomes; guaranteed profit is identical to the cent whichever side wins.
- American odds only; money shown to the cent; bonus-bet results show conversion % (profit ÷ bonus amount).
- Odds come from The Odds API free tier; nothing polls automatically.
- Stack per research: Next.js, Drizzle + Neon Postgres, decimal.js for all money math, Vitest for fixtures.

### Search scope
- **D-01:** Sports scanned: **NFL, NBA, MLB, NCAAF, NCAAB**, stored as a configurable list. **NHL is left out for now** (owner will add it later).
- **D-02:** **Moneyline only** (h2h market). No spreads or totals in this phase.
- **D-03:** Only games starting in the **next 7 days** are considered.
- **D-04:** Out-of-season sports are **skipped automatically** using the free (zero-credit) `/sports` endpoint, so no credits are spent on empty sports.

### Finder inputs & results
- **D-05:** Inputs: **book** and **bonus amount** (required); **sport filter** (optional, limits results to one sport). **No minimum-odds field**: the owner says bonus bets almost always convert best with the bonus side at +200 to +400, so ranking by profit already surfaces the right lines and the filter adds nothing.
- **D-06:** Show the **top 10** results, ranked by guaranteed profit (equivalently conversion %, since the amount is fixed).
- **D-07:** **Compact rows with expand**: each row shows game, bonus side + odds, hedge book + odds, guaranteed profit $, and conversion %. Expanding shows both stakes and per-outcome payouts/net profit.
- **D-08:** Each row uses **only the best-priced hedge book** for that market (one row per market).

### Refresh & credits
- **D-09:** One refresh fetches **all in-season sports** from the D-01 list (bulk `/sports/{sport}/odds`, h2h, regions covering the CO books).
- **D-10:** **No cooldown.** If a refresh is pressed **within 15 minutes of the last refresh**, show an in-page confirmation ("Odds were refreshed N min ago. Refresh again and spend ~X credits?") before fetching. Must be an in-page dialog, not `window.confirm`.
- **D-11:** Credit guard from the API's `x-requests-remaining` header: **warning banner under 100 credits**, **refresh disabled under 20 credits** until the monthly reset.
- **D-12:** Odds age shown at the top ("Odds updated 42 min ago"); **turns amber after 2 hours** with "Refresh before betting".
- **D-13:** Between refreshes the finder computes from the cached odds and shows the timestamp (ODDS-04). Finder queries themselves spend no credits.

### Book coverage
- **D-14:** The bonus-book dropdown lists **only books with Odds API coverage**. Books without coverage (bet365, Circa, SBK, BetMonarch) are hidden until manual odds entry (v2, ODDS-06).
- **D-15:** Hedge books = **every API-covered Colorado book** (no per-user filtering until Phase 2).
- **D-16:** If the live check shows Caesars and/or Fanatics are **paid-tier only**, **leave them out** of the config and note why; revisit with a paid tier later.
- **D-17:** **Same-book hedging is allowed**: if the bonus book also has the best price on the other side, the finder may suggest it.

### Claude's Discretion
- Page layout and visual styling (a UI-SPEC can refine this via `/gsd:ui-phase 1`).
- Cache storage shape (Postgres tables for odds snapshots and credit usage), refresh implementation (server action or route handler), and how the credit estimate for a refresh is computed.
- Whether a refresh is available without login in this phase (the app has no auth until Phase 2; keep it local/undeployed or behind a simple shared secret if deployed early).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — core value, constraints, Key Decisions (hedge-engine and display rules carried from the superseded calculator phase)
- `.planning/REQUIREMENTS.md` — CALC-01, CALC-04, CALC-05, ODDS-01..05, BONUS-01
- `.planning/ROADMAP.md` §Phase 1 — goal, success criteria, research flag

### Odds API & stack
- `.planning/research/STACK.md` — The Odds API quota mechanics (credits = markets × regions), CO bookmaker keys and regions, Next.js/Drizzle/Neon/decimal.js/Vitest versions
- `.planning/research/ARCHITECTURE.md` — zero-credit `/sports` and `/events` endpoints, bulk vs per-event odds cost, quota headers, pure I/O-free hedge engine
- `.planning/research/SUMMARY.md` §Open Conflicts — Caesars/Fanatics tier question, theScore Bet key (verify live)

### Hedge math
- `.planning/research/FEATURES.md` — bonus-bet formula `H = B×(Ob−1)/Oh`, profit `H×(Oh−1)`, conversion %, known-answer fixture ($100 @ +300, hedge −275 → $220, $80, 80%)
- `.planning/research/PITFALLS.md` — stake-not-returned trap, rounding, push/void handling, quota exhaustion

### Superseded (reference only)
- `.planning/archive/01-core-hedge-calculator-superseded/01-UI-SPEC.md` — earlier design tokens (shadcn/zinc/emerald, Geist); may be reused as a starting point for this phase's UI

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield repository (only `.planning/`, `.claude/settings.json`, `CLAUDE.md`).

### Established Patterns
- None yet. This phase sets them: the hedge engine must be pure functions over decimal.js values with no I/O, so Phase 3 (boosts) and Phase 4 (feed, tandem) can reuse it.

### Integration Points
- Odds cache and book config created here are read by Phases 3–5. The credit meter and refresh flow are reused by the feed in Phase 4.

</code_context>

<specifics>
## Specific Ideas

- Must reproduce the reference fixture exactly: $100 bonus bet at +300, hedge at −275 → hedge $220.00, profit $80.00, 80% conversion.
- Bonus bets convert best at longer odds, so expect top results to be underdog moneylines on the bonus side.

### Notes for research/planning
- **NFL moneyline ties:** US books typically refund (push) NFL moneylines on a tie. This conflicts with CALC-05's no-push rule. Research should confirm how CO books settle NFL moneyline ties and the planner should pick a treatment (e.g. accept with a small flag, or exclude). NBA/MLB/NCAAF/NCAAB moneylines cannot tie.
- **Cent rounding:** rounding the hedge stake to the cent can make the two outcomes differ by $0.01 (found while building the mockup: $50 bonus at +290 hedged at −310 → hedge $109.63, profit $35.37 vs $35.36). CALC-04 requires identical profit to the cent, so the engine needs an explicit rule (e.g. report the lower of the two, or choose the rounding direction that equalizes) and a fixture for this case.
- Confirm which regions (`us`, `us2`) are needed to cover all CO books and use the minimum set, since each region doubles credit cost.

</specifics>

<deferred>
## Deferred Ideas

- NHL (owner will add later; 3-way/overtime moneyline handling needs checking then).
- Spreads/totals as hedge markets (3× credit cost) — revisit with a paid tier or ODDS-08.
- Showing runner-up hedge books in the expanded row.

</deferred>

---

*Phase: 01-bonus-bet-finder*
*Context gathered: 2026-09-25*
