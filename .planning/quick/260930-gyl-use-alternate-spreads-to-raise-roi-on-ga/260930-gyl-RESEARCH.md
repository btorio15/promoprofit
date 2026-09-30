# Quick 260930-gyl: Alternate spreads for unpinned single-game promos - Research

**Researched:** 2026-09-30
**Domain:** Promo ranking (`src/domain/promos/*`) and the spreads/totals refresh (`src/ingestion/odds/refreshExtended.ts`)
**Confidence:** HIGH. Every claim below comes from reading the code in this session (`[VERIFIED: codebase]`). No new packages. No external docs are needed beyond what 260930-gam already cited.

<user_constraints>
## User Constraints (carried from 260930-gam CONTEXT.md, still locked)

- Alt lines are fetched ONLY on the confirmed "Search spreads & totals" press (`refresh-spreads-totals.ts`). They go through the existing refresh lock, credit gate and credit meter (`triggeredByUserId`).
- At most 5 games per press, soonest commence first, deduped per event. Report how many were skipped.
- If the credit gate would be crossed, skip ONLY the alt fetch, never the main refresh.
- Exact opposite line only: promo Team A at X hedges only with Team B at -X. No middles, no approximation. The math stays exact to the cent (decimal.js).
- Spreads only. Alternate totals are out of scope.
- No migration. Alt markets live inside the `cached_extended_odds` raw_response (as built in gam).

**New owner intent (this task):** single-game-scoped promos that are NOT pinned (e.g. promo 19, FanDuel 50% boost on any wager on Steelers @ Browns, min odds -200), plus game-scoped bonus bets, should have that game's alt spreads fetched. Ranking then considers every exact-opposite alt pair next to the main-line selections and keeps the max guaranteed profit while honoring min odds, max stake, caps and eligible market types.
</user_constraints>

## Summary

The ranking engine already has almost everything this task needs. `resolveSpread` (selection.ts:80-142) already falls back to the cached `alternate_spreads` market with exact half-point matching, promo line vs. its exact negation. `evaluateCandidate` (rankPromoHedges.ts:231-249) already applies min odds to the promo-book leg, picks the best hedge among allowed hedge books, and runs the boost or bonus solver. That solver handles maxStake, the winnings cap and stake-not-returned. What's missing is two things.

1. **Enumeration:** `enumerateScopeSelections` builds spread candidates only from MAIN `spreads` points (`collectSpreadHomePoints`, selection.ts:211-226, used at :313-318). Alt points are never offered as candidates, so an unpinned promo never gets evaluated on an alt line.
2. **Targeting:** the refresh action only builds pins from `promo.pinned` spread selections (refresh-spreads-totals.ts:33-51). `selectAltSpreadTargets` (altSpreads.ts:52-85) also drops any event whose main line already covers every pin (:71). Unpinned event-scoped promos therefore never trigger a fetch. The live data has no pinned non-main spread promos, which is why gam had no visible effect.

**Primary recommendation:** add an opt-in `altSpreadBookKey` option to `enumerateScopeSelections`. When it is set, also collect half-point spread home points from that book's `alternate_spreads` outcomes. `candidatesFor` in rankPromoHedges.ts passes `promo.bookKey` for unpinned promos. Extend `selectAltSpreadTargets` with a list of "always fetch" event ids, built in the action from unpinned, event-scoped, spread-eligible promos. Leave `resolveSpread`, the evaluators, the solvers, and `rankArbs`/`rankBonusBetHedges` unchanged.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary | Rationale |
|---|---|---|---|
| Decide which events get an alt fetch | API / server action (`refresh-spreads-totals.ts`) | pure domain `altSpreads.ts` | Promos are loaded server-side for the pressing member only (T-gam-01). Selection logic stays pure. |
| Fetch and merge alt market into cache | Ingestion (`refreshExtended.ts:262-305`) | DB (`commitSpreadsTotalsRefresh`) | Unchanged from gam. |
| Offer alt lines as candidates | Pure domain (`selection.ts` enumerate) | `rankPromoHedges.candidatesFor` | Ranking is zero-I/O. |
| Min odds / max stake / caps / bonus math | Pure domain (`rankPromoHedges.evaluateCandidate` + `hedge/*` solvers) | none | Already correct. Reuse, don't touch. |

## 1. How an unpinned single-game promo is ranked today

Call chain: `rankPromoHedges` (rankPromoHedges.ts:335) -> `evaluatePromo` (:296) -> `candidatesFor` (:286-294) -> `enumerateScopeSelections(events, promo.scope, { now, eligibleMarketTypes })` (selection.ts:271-341).

- **Scope filter:** each event in the moneyline ∪ extended caches must be strictly in the future (:290) and pass `eventInScope` (:292-299). For `scope.kind === "event"` that means exactly one game.
- **Markets enumerated** (gated by `promo.eligibleMarketTypes`, :276):
  - moneyline: home/away if any book has a 2-way h2h (:303-309)
  - spread: for each MAIN `spreads` home point P (half-point, 2-way, away = -P), candidates `{home, P}` and `{away, -P}` (:313-318)
  - total: each MAIN totals point, over/under (:319-324)
  - Alt spreads are **not** enumerated.
- **Resolution:** each candidate goes through `resolveSelection` -> `resolveSpread` (:80-142). The main loop collects books whose main line equals the point. The alt loop (:112-121) then fills in books without a main quote at that point from `alternate_spreads`, using `samePoint` (doubled-half-point equality, altSpreads.ts:28-36). So an alt-line candidate resolves correctly **already**; nothing proposes it.
- **Evaluation** (`evaluateCandidate`, rankPromoHedges.ts:231-249):
  - `promoBookQuote` = the quote from `promo.bookKey` on the promo side (:237).
  - `passesBaseMinOdds` compares that base price against `minOddsAmerican` in decimal (:130-138, :239), so min odds already applies to the promo-side leg.
  - `bestHedgeQuote` picks the highest decimal among `opts.hedgeBookKeys` on the opposite side, with an alphabetical tie-break (:74-90, :241). `sameBook` is flagged (:244).
  - Boost path (:140-199): requires maxStake (:149) and, when unpinned, a live promo-book quote (:155). It calls `calculateProfitBoostHedge` with boostPercent, maxStake, winningsCap and minOdds.
  - Bonus path (:201-229): `calculateBonusBetHedge` (stake-not-returned). Positive profit only (:219).
- **Best choice:** `isBetterCandidate` (:261-283) orders by profit desc, then roi/conversion desc, commence, eventId, market, line asc, side. It is deterministic, and alt candidates fit into it without change.

**Other consumers of `enumerateScopeSelections` / `candidatesFor`:**
- `correctionOptions.ts:227` (the correction dropdown's market list) must NOT gain dozens of alt lines, so the new behavior has to be opt-in.
- `pairPromos.ts:178` (`legOptionsFor` via `candidatesFor`, plus `flipSelection` for unpinned) will pick up alt candidates automatically. That is acceptable: pairs key on `marketKeyOf` (pairPromos.ts:71-80), which is line-specific, so a pair only forms when both promo books quote the same alt line.
- `findUnprofitablePromos` (:389), `memberPromoState.ts:75-80`, `memberPairState.ts:75`, `promoObservations.ts:43`, `get-promos.ts:210-227` and `get-opportunities.ts:80,162` all go through `rankPromoHedges`/`candidatesFor` and benefit automatically.

**Arbitrage tab and bonus-bet finder are isolated:** `rankArbs.ts:153` and `rankBonusBetHedges.ts:118` iterate markets built by `hedge/marketFilter.ts:54` (`"h2h"`) and `hedge/spreadsTotalsFilter.ts:60,81` (`"spreads"`/`"totals"` by exact key). They never read `alternate_spreads`, and they don't call `enumerateScopeSelections`. No change is needed there.

### Where to add alt candidates (recommended)

In `selection.ts`:
- Add `collectAltSpreadHomePoints(event, bookKey)`. It reads that one bookmaker's `alternate_spreads` market and, for each outcome with `isHalfPoint(point)`, adds `point` if `name === home_team`, or `-point` if `name === away_team`. Ignore any other name. Dedupe with a `Set<number>` (half-points are exact in binary), or key by `Math.round(p*2)`.
- Extend the `enumerateScopeSelections` opts with `altSpreadBookKey?: string`. In the `spread` branch (:313-318), union the main points with the alt points when the option is set. Then push the same `{home, P}` / `{away, -P}` candidates. `resolveSpread` does the rest.
- Default `undefined`, so `correctionOptions.ts:227` is unchanged.

In `rankPromoHedges.ts:286-294`: pass `altSpreadBookKey: promo.bookKey` in the unpinned branch.

- **Why only the promo book's alt points:** an unpinned candidate with no promo-book quote is discarded anyway (boost :155, bonus :210). Collecting the union across all books would only add dead candidates.
- **Why this doesn't change unscoped or multi-game promos:** alt markets exist in the cache only for the ≤5 events fetched on the latest press. A sport_window/any promo that covers one of those events would also see alt candidates for that game. That is harmless and correct, but if the owner wants it strictly single-game, add `&& promo.scope.kind === "event"` to the `candidatesFor` condition. **Recommend adding that guard to match the stated intent exactly.** [ASSUMED owner preference, A1]

## 2. Target selection change

**Today:** `refresh-spreads-totals.ts:33-51` loads `getActivePromos(new Date(), user.userId)` (db/promos.ts:284) only when `confirmed`, and keeps only `promo.pinned` spread selections as `AltSpreadPin { eventId, line, side }`. `refreshExtended.ts:265-272` calls `selectAltSpreadTargets(pins, pendingWrites.flatMap(w => w.extendedEvents), now)`.

**Fields that identify a single-game unpinned promo** (from `ActivePromo extends RankablePromo`, db/promos.ts:73):
- `promo.scope.kind === "event"` gives `promo.scope.eventId` and `promo.scope.sportKey` (mapped at db/promos.ts:165-171)
- `promo.pinned === null`
- `promo.eligibleMarketTypes.includes("spread")` (FanDuel derives this from the text, `fanduel.ts:369`; other books use all three types)
- `promo.promoType` is `"profit_boost" | "bonus_bet"` (types.ts:8), and both qualify
- Optional pre-filter: skip `profit_boost` with `maxStake === null`, because the ranker would drop it anyway (rankPromoHedges.ts:297, D-18). This saves a credit.

**Recommended change** (smallest diff that keeps gam tests valid):
- `selectAltSpreadTargets(pins, extendedEvents, now, scopedEventIds: readonly string[] = [])`. Scoped ids are always candidates (no `mainLineCovers` skip, altSpreads.ts:71), but they still require the event to be present in this press's extended events and strictly in the future (:68-70).
- Merge scoped ids and pins into one per-event map, then apply the existing sort (commence asc, eventId) and the `ALT_SPREAD_EVENT_LIMIT = 5` cap. `skippedOverLimit` counts both kinds.
- Thread `altSpreadEventIds` through `runSpreadsTotalsRefresh` / `runGuardedSpreadsTotalsRefresh` opts (refreshExtended.ts:126-131, :155-160). Change the guard at :266 from `pins.length > 0` to `pins.length > 0 || scopedIds.length > 0`.
- The credit gate (:274-278), the fetch loop, `mergeAltSpreads` and the `altLines` outcome stay as they are.
- In the action, build the ids inside the same `try` as the pins. On a load failure, both lists fall back to empty.
- Update the ArbForm banner and dialog copy only if the wording says "pinned". Check `ArbForm.tsx` / `SearchSpreadsTotalsDialog.tsx` text.

## 3. Performance and combinatorics

- The Odds API `alternate_spreads` for NFL typically has roughly 15-30 points per team per book [ASSUMED, A2]. With promo-book-only collection that is about 30-60 home points, so about 60-120 spread candidates per game on top of the ~2 main-spread and ~4 other candidates.
- Each `resolveSpread` scans about 9 books × (main 2 + alt up to ~60 outcomes) with `.find`, so roughly 120 × 9 × 60 ≈ 65k cheap comparisons per promo per ranking.
- Each surviving candidate runs one decimal.js solve (under ~120 per promo). Min odds prunes the heavily favored lines first (:239), before the solver runs.
- `get-promos.ts` ranks about 3-4 times per request (rankPromoHedges ×2 plus `findUnprofitablePromos`, which re-ranks and re-enumerates). Pairs add `legOptionsFor` with flips.
- Only ≤5 events per press carry alt markets and only event-scoped promos on them expand, so the total is well under a few ms of CPU. **Ranking cost does not matter; no caching or indexing is needed.** If desired, precompute a `Map<eventId, OddsEvent>` once, since `resolveSelection` does `events.find` per candidate (:196). This is optional.

## Common Pitfalls

1. **Whole-number alt lines (push risk):** alt ladders include -3, -7 and so on. Filter them with `isHalfPoint` when collecting. `resolveSpread` also rejects them (:81), but collecting them wastes work and muddies tests.
2. **Min odds must apply to the promo-side base price at the promo book:** this is already true (`passesBaseMinOdds(promo, promoBookQuote)`, :239). Don't compute min odds on the boosted price or the hedge leg. Promo 19's -200 floor will eliminate the deep favorite lines. Add a test for that.
3. **Exact opposite via doubled half-points:** use `samePoint` / `Math.round(p*2)` for any new point comparisons. Never use raw `===` on derived values like `-(-6.5)` after arithmetic. `resolveSpread`'s alt loop already matches the hedge at `-sel.line` (:118).
4. **Promo side at the promo's own book only:** unpinned evaluation already requires `promoBookQuote` from `promo.bookKey` (:237, :155, :210). Collecting points only from `promo.bookKey`'s alt market keeps this aligned. Don't let a candidate whose only promo-side quote is from another book win.
5. **Hedge books:** `bestHedgeQuote` filters to `opts.hedgeBookKeys` (the member's usable regulated books, as today). `mergeAltSpreads` already restricts alt books to the refresh's `bookKeys` (altSpreads.ts:92-114). No new rule is needed. The same-book hedge behaviour (`sameBook`) is unchanged.
6. **Main quote shadows the alt quote at the same point:** `resolveSpread` skips alt for books in `mainQuoted` (:113). That is correct and avoids double quotes. Don't "fix" it.
7. **Later press replaces cached alt lines:** `commitSpreadsTotalsRefresh` rewrites the per-sport rows. Alt markets survive only for the events fetched on the latest press, and targets depend on the *pressing member's* visible promos (including their personal hand-added ones). Another member's press can drop your game's alt lines. The feed then silently falls back to main lines, which is correct but lower ROI. This is already documented in the gam SUMMARY. Keep it and consider a one-line note in the banner.
8. **Unmatched outcome names (gam A2):** alt outcomes whose `name` is neither `home_team` nor `away_team` are ignored by both the collector and `resolveSpread`. `countUnmatchedAltOutcomes` already surfaces this in `altLines.unmatchedOutcomes`. The new collector must ignore them too, never guess.
9. **Correction dropdown bloat:** don't make alt enumeration the default in `enumerateScopeSelections`, because `correctionOptions.ts:227` would list every alt line.
10. **Tie-break line ordering:** `isBetterCandidate` compares `line` numerically (:278-280). With many alt lines at equal profit, the lowest line wins deterministically. Fine, but tests that assert "the main line is chosen" may now pick an alt line with higher profit. Update those fixture expectations deliberately, not blindly.
11. **Credit estimate:** the gate uses `targets.length * ceil(bookKeys/10)` (:274). Adding scoped targets raises typical spend to up to 5 credits per press. The dialog's "up to 5 more credits" copy remains accurate.

## Code Examples

```typescript
// selection.ts -- new helper (pattern mirrors collectSpreadHomePoints :211-226)
function collectAltSpreadHomePoints(event: OddsEvent, bookKey: string): number[] {
  const book = event.bookmakers.find((b) => b.key === bookKey);
  const alt = book?.markets.find((m) => m.key === ALT_SPREADS_MARKET);
  if (!alt) return [];
  const points = new Set<number>();
  for (const o of alt.outcomes) {
    if (!isHalfPoint(o.point)) continue;
    if (o.name === event.home_team) points.add(o.point);
    else if (o.name === event.away_team) points.add(-o.point);
  }
  return [...points];
}
// in enumerateScopeSelections spread branch:
// const homePoints = new Set(collectSpreadHomePoints(extEvent));
// if (opts.altSpreadBookKey) for (const p of collectAltSpreadHomePoints(extEvent, opts.altSpreadBookKey)) homePoints.add(p);
```

```typescript
// refresh-spreads-totals.ts -- inside the existing confirmed try-block
if (!promo.pinned && promo.scope.kind === "event" && promo.eligibleMarketTypes.includes("spread")
    && !(promo.promoType === "profit_boost" && promo.maxStake === null)) {
  altSpreadEventIds.push(promo.scope.eventId);
}
```

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | The owner wants alt candidates only for `scope.kind === "event"` promos, even if a sport-window promo covers a fetched game | §1 | Low: at worst a sport-window promo shows a slightly better alt-line pick |
| A2 | NFL alt ladders have ~15-30 points per team per book | §3 | Low: the cost stays negligible even at 3× that |
| A3 | Alt outcome names equal the event's home/away names (inherited gam A2) | Pitfalls 8 | Medium: alt candidates silently absent. This is surfaced by `unmatchedOutcomes`. |

## Open Questions

1. Should a pinned promo on the main line also get alt candidates? No. A pin is a fixed selection (`getPinnedCandidates`). Keep as is.
2. UI: should the feed label an alt-line pick (e.g. "alt line")? Optional. The selection's `line` already displays correctly. Leave it to the planner's discretion.

## Validation Architecture

| Property | Value |
|---|---|
| Framework | Vitest (existing, 93 files / 1400 tests after gam) |
| Quick run | `npx vitest run src/domain/promos/selection.test.ts src/domain/promos/altSpreads.test.ts src/domain/promos/rankPromoHedges.test.ts src/ingestion/odds/refreshExtended.test.ts` |
| Full suite | `npx vitest run` plus `npx tsc --noEmit` (known `LayoutProps` artifact in layout.tsx) |

Tests to add (no Wave 0 gaps; the files exist):
- **selection.test.ts:** with `altSpreadBookKey`, alt half-points appear as candidates, whole numbers and unmatched names are skipped, and there is no change without the option. Also cover correctionOptions parity (no option means no alt).
- **rankPromoHedges.test.ts:** an unpinned event-scoped boost picks the alt line when it gives more profit (exact cents). Also: min odds -200 excludes a deep-favorite alt line; the hedge is the exact opposite at a hedge book only; a bonus bet on an alt line with stake-not-returned exact cents; a sport_window promo is unaffected when the A1 guard is applied.
- **altSpreads.test.ts:** scoped ids are always targeted even when the main line "covers", they are deduped with pins, sorted soonest first, capped at 5 with the skipped count, and past or absent events are excluded.
- **refreshExtended.test.ts:** scoped ids alone trigger the alt fetch; the credit gate skips only the alt fetch.
- Action test (if present): only unpinned + event + spread-eligible promos contribute ids, and only when `confirmed`.

## Security Domain

No new input surface. Event ids come from server-loaded promos for `requireUser()`'s member, never from client input (keep T-gam-01). Zod validation of the per-event response is already in `fetchEventOdds`. There are no new secrets and no URL/key leakage paths.

## Sources

- Codebase (read this session): `src/domain/promos/rankPromoHedges.ts`, `selection.ts`, `altSpreads.ts`, `pairPromos.ts:71-97,163-182`, `correctionOptions.ts:210-232`, `scope.ts`, `types.ts:8`, `src/db/promos.ts:73,160-205,284-333`, `src/app/actions/refresh-spreads-totals.ts`, `src/ingestion/odds/refreshExtended.ts:120-354`, `src/domain/hedge/{marketFilter,spreadsTotalsFilter,rankArbs,rankBonusBetHedges}.ts` (market-key usage)
- 260930-gam CONTEXT / SUMMARY (locked decisions, what was built)

**Valid until:** until selection.ts or refreshExtended.ts change materially.
