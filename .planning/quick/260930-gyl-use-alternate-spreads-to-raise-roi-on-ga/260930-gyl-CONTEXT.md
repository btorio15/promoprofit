# Quick Task 260930-gyl: Use alternate spreads to raise ROI on game-scoped promos - Context

**Gathered:** 2026-09-30
**Status:** Ready for planning

<domain>
## Task Boundary

For active promos (profit boosts and bonus bets) that are scoped to ONE game, are NOT pinned to a specific market, and whose eligible markets include spread, fetch that game's `alternate_spreads` on the confirmed "Search spreads & totals" press and let `rankPromoHedges` also try every exact-opposite alternate pair (promo side at the promo's book at line X, hedge = other team at −X at a hedge book) alongside main-line selections, picking the max guaranteed profit while honoring min odds / max stake / caps / eligible markets.

Also clean up the pinned-only code from quick task 260930-gam (which misread "pinned promo games" as "promos pinned to one spread line"). See the cleanup table in `.planning/.continue-here.md` ("### 2. Clean up 260930-gam code").

Arbitrage tab and bonus-bet finder behavior: UNCHANGED.

</domain>

<decisions>
## Implementation Decisions (locked)

### Which promos get alt candidates (owner, 2026-09-30 — decision A1)
- ONLY promos scoped to a single game (`scope.kind === "event"`), unpinned, eligible markets include spread.
- Sport-wide / date-window promos ("boost on any NFL game today") do NOT get alt candidates, even if alt lines happen to be cached for a game they cover.
- Real line-pinned promos keep the existing `resolveSpread` alt fallback from 260930-gam.

### Carried from 260930-gam (owner, still apply)
- Fetch ONLY on the confirmed "Search spreads & totals" press. Not on morning scrape, page view, or schedule.
- Max 5 games per press, soonest commence first; report skipped count in the outcome/banner.
- Credit gate (CREDIT_BLOCK_THRESHOLD 20) skips the alt fetch only, never the main refresh.
- Exact opposite line only; whole-number lines skipped (push risk). Guaranteed profit exact to the cent (decimal.js).
- Spreads only — no alternate totals.
- No DB migration expected. If one turns out to be needed, generating it is fine but APPLYING it to live Neon requires the owner's explicit OK (human checkpoint).

### Claude's Discretion
- Exact naming of the renamed target types/options (per cleanup table).
- Banner / dialog copy wording, within "games with a promo" / "up to 5 promo games" meaning.

</decisions>

<canonical_refs>
## Canonical References

- `.planning/quick/260930-gyl-use-alternate-spreads-to-raise-roi-on-ga/260930-gyl-RESEARCH.md` — exact code locations, the opt-in `altSpreadBookKey` approach, pitfalls.
- `.planning/.continue-here.md` — cleanup table (section "### 2") listing 260930-gam pinned-only code to generalize/reword, and what to KEEP.
- `.planning/quick/260930-gam-add-alternate-spread-lines-for-pinned-pr/260930-gam-SUMMARY.md` — what 260930-gam built.

</canonical_refs>
