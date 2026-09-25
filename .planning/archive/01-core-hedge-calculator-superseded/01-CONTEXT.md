# Phase 1: Core Hedge Calculator - Context

**Gathered:** 2026-09-25
**Status:** Ready for planning

<domain>
## Phase Boundary

A single calculator page where the user manually enters American odds for two legs and gets exact, fixture-verified hedge stakes and guaranteed profit. Covers: bonus-bet (stake-not-returned) hedges, profit-boost hedges with max-stake/max-winnings caps, and tandem hedges where both legs are promos on opposite outcomes of the same market (CALC-01..07). No odds API, no saved promos, no auth, no dashboard — those are Phases 2–4. This phase also establishes the project scaffold (Next.js + decimal.js per research) and the pure, I/O-free hedge-math module that later phases reuse.

</domain>

<decisions>
## Implementation Decisions

### Hedge strategy
- **D-01:** Hedge stakes always **equalize profit across both outcomes** — the single "guaranteed profit" number is the same whichever leg wins. No skew/lean option in v1.
- **D-02:** For a profit boost, the calculator **suggests the promo-side stake that maximizes profit within the caps** (typically the max stake) and pre-fills it; the user can override.
- **D-03:** When a **max-winnings cap binds**, the calculator **auto-reduces the promo stake** to the point where the cap is exactly reached and shows a short explanation (e.g. "Stake reduced to $X — above this, boosted winnings are capped").
- **D-04:** Bonus bets are a **single amount per calculation** (the amount being wagered now). No remaining-balance tracking (that's deferred TRACK-01).

### Odds input & format
- **D-05:** **American odds only** for input and display (e.g. +300, −275). No decimal toggle.
- **D-06:** Boost legs have a **toggle between "boost %" and "boosted price"** input modes.
- **D-07:** Boost % is **applied to profit** (industry standard: +200 at 50% → +300). Formula per research: `Ob_eff = 1 + (O−1)×(1+boost%)` in decimal terms.
- **D-08:** **Live inline validation**: invalid American odds (e.g. between −100 and +100 exclusive), missing required fields, non-positive amounts flagged as the user types; results hidden until the form is valid.

### Results display
- **D-09:** Headline = **guaranteed profit in dollars** (large), with **conversion %** (bonus-bet legs: profit ÷ bonus amount) or **ROI %** (cash legs: profit ÷ cash risked) beneath. Never label boost ROI as "conversion" (per research).
- **D-10:** Below the headline, a **per-outcome table**: one row per outcome showing which bet wins, payout, and net profit — visibly proving profit is equal both ways.
- **D-11:** Stakes and profit displayed **to the cent** ($220.00). Whole-dollar rounding is deferred (CALC-09).
- **D-12:** Account-risk advisory (CALC-06) is a **small one-line footnote under results with a "learn more" expander**.

### Page layout & tandem entry
- **D-13:** **One two-leg form** (Leg A / Leg B), not tabs. Each leg has a type: **Plain / Bonus bet / Boost**. A standard bonus-bet or boost hedge = one promo leg + one plain leg; a **tandem hedge (CALC-07) = both legs are promo types**. Tandem mixes: boost+boost, boost+bonus bet, bonus bet+bonus bet.
- **D-14:** Each leg has **optional free-text book and outcome labels** (e.g. "FanDuel", "Bills ML") used to render results in plain language ("Bet $220.00 at FanDuel on Bills ML"). Not required for math.
- **D-15:** No-push enforcement (CALC-05) via a **market-type select** per calculation (Moneyline / Spread / Total / Other 2-way). Spread/total require a line; **half-point lines are accepted, whole-number lines trigger a push warning**. Moneyline and other 2-way no-push markets need no line.
- **D-16:** **Calculator inputs are stored in the URL** (query params) so a refresh keeps state and a calculation can be shared with friends by link.

### Claude's Discretion
- Project scaffold specifics (package layout, test setup — research suggests Vitest), visual styling, and exact wording of explanations/advisory text.
- Exact algorithm for choosing the optimal stake when both max-stake and max-winnings caps exist on one or both tandem legs, provided it satisfies D-01–D-03 and is fixture-tested.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project scope & requirements
- `.planning/PROJECT.md` — core value (exact, correct hedges), constraints, key decisions
- `.planning/REQUIREMENTS.md` — CALC-01..07 (Phase 1), v2 deferrals CALC-08/09
- `.planning/ROADMAP.md` §Phase 1 — goal and 6 success criteria

### Hedge math & domain
- `.planning/research/FEATURES.md` — verified bonus-bet formula `H = B×(Ob−1)/Oh`, profit-boost formula and cap interactions, conversion vs ROI display guidance, known-answer example ($100 bonus @ +300, hedge −275 → $220 hedge, $80 profit, 80%)
- `.planning/research/PITFALLS.md` — bonus-bet vs boost separate calculation paths, rounding/min-stake, push/void traps
- `.planning/research/STACK.md` — Next.js, decimal.js (no native floats for money), Vitest
- `.planning/research/ARCHITECTURE.md` — hedge engine as pure, I/O-free module reused by later phases
- `.planning/research/SUMMARY.md` — synthesized recommendations

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield repository (only `.planning/`, `.claude/settings.json`, `CLAUDE.md`).

### Established Patterns
- None yet. This phase establishes them: the hedge-math module must be pure functions over decimal.js values with no I/O, so Phase 2 (live odds), Phase 3 (promos) and Phase 4 (tandem detection, DASH-05) can call it directly.

### Integration Points
- Future phases feed odds and promos into the same two-leg hedge function; design its input shape as `{ legs: [Leg, Leg], market }` where `Leg = { odds, type: plain|bonus|boost, amount/stake, boost%|boostedOdds, maxStake?, maxWinnings?, bookLabel?, outcomeLabel? }` (shape is a suggestion; planner may refine).

</code_context>

<specifics>
## Specific Ideas

- Must reproduce the OddsJam reference example exactly: $100 bonus bet at +300, hedge at −275 → hedge $220.00, profit $80.00, 80% conversion.
- User's motivating tandem example: two books each offering a 50% profit boost on opposite sides of the same game — play both boosts and hedge them against each other.

</specifics>

<deferred>
## Deferred Ideas

- Profit skew slider (lean profit toward one outcome) — not selected; possible future enhancement.
- Decimal odds input/display — not selected.
- One-tap copy of stakes — not selected for v1.
- Remaining bonus-balance tracking — already deferred as TRACK-01.

</deferred>

---

*Phase: 01-core-hedge-calculator*
*Context gathered: 2026-09-25*
