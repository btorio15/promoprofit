# Phase 6: Profit Graph - Context

**Gathered:** 2026-10-03
**Status:** Ready for planning

<domain>
## Phase Boundary

A compact, two-line cumulative profit graph at the top of the Opportunities (home) page, for the signed-in member only:
- **Grey line**: running total of profit *available* to this member
- **Green line**: running total of profit this member *extracted* (Mark done)
- Range picker: Last 7 days / Last 30 days / All time
- Tap/hover readout, phone-friendly, "nothing yet" empty state

Requirements: STATS-01 to STATS-06. The Stats page, headline totals/counts page, and removing the Promos-tab summary are Phase 7 (which will reuse this phase's graph component). No breakdowns, no other members' numbers.

</domain>

<decisions>
## Implementation Decisions

### Ranges
- **D-01:** Both lines **start at $0 at the beginning of the selected range**. "Last 7 days" shows only profit that happened in those 7 days, not the tail of the all-time total.
- **D-02:** Ranges are rolling Denver days including today, the same definition as the "Last 7 days"/"Last 30 days" labels shipped 2026-10-03 (`periodStartDates` in `src/domain/promos/profitTotals.ts`).
- **D-03:** Default range is **Last 30 days**. The member's last pick is **remembered on this device** (use the existing `src/lib/persistentState.ts` pattern).
- **D-04:** **All time starts 2026-09-27 for both lines**, because available-profit observations only began then. Any older completions are not shown before that date, so both lines cover the same days and the gap is fair. (Planner's choice: whether pre-09-27 completions are dropped or rolled into the starting value. Pick the one that keeps both lines on the same footing, and document it.)

### What counts as "available" (grey line)
- **D-05:** **Include the member's private hand-added promos** (`promos.added_by_user_id`). Otherwise green could exceed grey.
- **D-06:** **Pairs are counted the way the feed would show them.** If the feed's pair rule (pair only when it beats the two singles; owner reaffirmed 2026-10-03) picks the pair, count the pair's profit once. Otherwise count the singles.
- **D-07:** **Use the member's "Your cap"** when they have one, so grey is what *they* could have taken, not the promo's full max stake.
- **D-08:** Each promo's available profit lands on the **Denver day it was first seen**, at its **best observed** guaranteed profit, and is counted once.
- **D-09 (feasibility flag, for research and planning):** Today `promo_profit_observations` stores one group-level number per promo per Denver day, ranked at full max stake (`stripMemberCaps`) with no pair awareness. D-05/D-06/D-07 may not be derivable from it as-is. The researcher must check what can be derived from stored data (e.g. re-ranking is impossible after the fact because historical odds aren't kept), and propose the smallest honest solution. That could be a per-member/pair-aware observation table going forward, with older days falling back to the group-level number. A schema change is acceptable if needed. Surface the trade-off plainly to the owner if the choices can't be met for past days.

### Extracted (green line)
- **D-10:** Green = sum of `promo_completions.profit_extracted` for this member, placed on the **Denver day of `completed_at`**. Undo deletes the completion row, so undone promos vanish from history (accepted, see REQUIREMENTS Out of Scope).

### Size and placement
- **D-11:** **Compact** graph (~160px tall) at the top of Opportunities, so the opportunities list stays visible on a phone.
- **D-12:** **Hide/show toggle, remembered per device.**
- **D-13:** Above the graph: two totals for the selected range in the line colors, e.g. "Extracted **$123.45** of **$210.00** available".

### Tap/hover readout
- **D-14:** The readout shows the **date, both running totals, and that day's gain** (e.g. "+$12.40 available, +$8.00 extracted"), exact to the cent.
- **D-15:** On a phone it is a **tooltip at the finger** (same as desktop hover).
- **D-16:** With no tap, the numbers above the graph show the **end-of-range totals** (D-13).

### Empty state
- **D-17:** A member with no history in the selected range sees a short "nothing yet" message instead of an empty chart (STATS-06).

### Claude's Discretion
- Line style (step vs smooth). The recommendation was step lines, since the data is daily.
- Charting library choice (none is installed yet). Pick one that works with React 19 / Next 16 and supports touch tooltips.
- Exact green shade (reuse the app's `text-primary` green if it fits), grey shade, axis labels and ticks.
- Whether the toggle and range picker sit in one header row.

### Folded Todos
- **Stats overhaul** (`.planning/todos/pending/2026-09-30-stats-overhaul.md`): its profit-graph notes are folded in. Data comes from `promo_completions.completed_at` / `profit_extracted` (and the snapshot `commenceTime` for rows since 260929-igk). Graph by Denver day. Undo deletes history. The todo stays open and is resolved by Phase 7.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone scope
- `.planning/REQUIREMENTS.md`: STATS-01..06 (this phase), Out of Scope, carried-forward constraints
- `.planning/ROADMAP.md` § Phase 6: goal and success criteria
- `.planning/PROJECT.md` § Current Milestone: v1.1 Profit Stats
- `.planning/todos/pending/2026-09-30-stats-overhaul.md`: folded graph notes

### Data and math
- `src/domain/promos/profitTotals.ts`: Denver-day bucketing (`denverDate`), rolling `periodStartDates`, per-promo max dedupe (`summarizeAvailableProfit`)
- `src/db/promoObservations.ts`: how daily observations are recorded (group-level, full max stake)
- `src/db/promoTracking.ts`: `recordProfitObservations`, `getProfitObservationsSince(sinceDate, viewerUserId)`, `getPromoCompletions`
- `src/db/schema.ts`: `promo_profit_observations` (~L403), `promo_completions` (~L307), `promos.added_by_user_id` (~L245)
- `src/domain/promos/yourCap.ts`: `applyMemberCaps` / `stripMemberCaps`
- `src/domain/promos/pairPromos.ts`: `findPairCandidates`, `selectPairs` (feed pair rule)
- `.planning/debug/resolved/three-bet-pairs-not-showing.md`: pair rule reaffirmed by owner 2026-10-03
- `CLAUDE.md`: decimal.js for all money math, format to cents only at display

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/`: shadcn-style `tooltip`, `toggle-group` (range picker), `card`, `collapsible` (hide/show), `skeleton` (loading)
- `src/lib/persistentState.ts`: per-device remembered UI state (range pick, collapsed state)
- `src/components/promos/ProfitSummary.tsx`: current summary card styling (`bg-secondary`, `text-primary`, `num` class for figures)
- `src/lib/format.ts`: `formatUsd`

### Established Patterns
- Server actions in `src/app/actions/` call `requireUser()` first; the user id comes from the session only (never from input)
- Pure domain math in `src/domain/` (no DB imports), DB access in `src/db/`
- Dark mode via `prefers-color-scheme` (no class toggle)
- Table-driven Vitest tests for money math

### Integration Points
- `src/components/opportunities/OpportunitiesScreen.tsx`: graph mounts at the top
- `src/app/actions/get-opportunities.ts` (or a new sibling action): supplies the graph's series data
- `src/db/feedContext.ts`: already loads observations since the earliest period start

</code_context>

<specifics>
## Specific Ideas

- The headline wording above the graph: "Extracted $X of $Y available" (colors match the lines)
- The tap readout includes that day's gain alongside the running totals
- Grey must never read lower than green for honest reasons (D-05 exists for this)

</specifics>

<deferred>
## Deferred Ideas

- "Gap / left on the table" figure in the readout (offered, not chosen)
- Breakdowns by book / promo type / sport, group totals, completed-bets list, 90-day range (milestone-level deferrals in REQUIREMENTS.md)

### Reviewed Todos (not folded)
- 2-bet pair solver 1¢ rounding (`.planning/todos/pending/2026-10-03-two-bet-pair-solver-rounding.md`): unrelated to the graph, so it stays a standalone fix

</deferred>

---

*Phase: 06-profit-graph*
*Context gathered: 2026-10-03*
