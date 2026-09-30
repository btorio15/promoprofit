---
phase: quick-260930-gyl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/domain/promos/selection.ts
  - src/domain/promos/selection.test.ts
  - src/domain/promos/rankPromoHedges.ts
  - src/domain/promos/rankPromoHedges.test.ts
  - src/domain/promos/correctionOptions.test.ts
  - src/domain/promos/altSpreads.ts
  - src/domain/promos/altSpreads.test.ts
  - src/ingestion/odds/refreshExtended.ts
  - src/ingestion/odds/refreshExtended.test.ts
  - src/app/actions/refresh-spreads-totals.ts
  - src/components/arb/ArbForm.tsx
  - src/components/arb/SearchSpreadsTotalsDialog.tsx
autonomous: true
requirements: [QUICK-260930-gyl]

must_haves:
  truths:
    - "An unpinned profit boost scoped to one game (spread eligible) is ranked on the best exact-opposite alternate spread pair when that pays more than the main line, correct to the cent"
    - "An unpinned bonus bet scoped to one game is ranked on the best exact-opposite alternate spread pair when that converts better than the main line, correct to the cent"
    - "Min odds still apply to the promo-side base price at the promo's book, so a deep-favorite alt line below the floor is never picked"
    - "Sport-wide / date-window / any-game promos get NO alternate-line candidates, even when alt lines are cached for a game they cover"
    - "The market-correction dropdown (correctionOptions) lists exactly the same options as before; alt lines never appear there"
    - "On a confirmed 'Search spreads & totals' press, games that a single-game unpinned spread-eligible promo is scoped to get their alternate spreads fetched even when the main line exists (max 5, soonest first, skipped count reported, credit gate skips only the alt fetch)"
    - "Arbitrage tab and bonus-bet finder behave exactly as before"
  artifacts:
    - path: "src/domain/promos/selection.ts"
      provides: "Opt-in altSpreadBookKey enumeration of half-point alternate_spreads points"
      contains: "altSpreadBookKey"
    - path: "src/domain/promos/rankPromoHedges.ts"
      provides: "candidatesFor passes promo.bookKey as altSpreadBookKey only for unpinned event-scoped promos"
      contains: "altSpreadBookKey"
    - path: "src/domain/promos/altSpreads.ts"
      provides: "AltSpreadRequests type, buildAltSpreadRequests builder, generalized selectAltSpreadTargets"
      exports: ["AltSpreadRequests", "buildAltSpreadRequests", "selectAltSpreadTargets", "mergeAltSpreads", "samePoint", "countUnmatchedAltOutcomes", "ALT_SPREAD_EVENT_LIMIT", "ALT_SPREADS_MARKET"]
    - path: "src/ingestion/odds/refreshExtended.ts"
      provides: "altSpreads request option replaces altSpreadPins; fetch triggers on pins OR scoped event ids"
      contains: "altSpreads"
  key_links:
    - from: "src/domain/promos/rankPromoHedges.ts candidatesFor"
      to: "enumerateScopeSelections"
      via: "altSpreadBookKey: promo.bookKey when promo.scope.kind === 'event' (unpinned branch)"
      pattern: "altSpreadBookKey"
    - from: "src/app/actions/refresh-spreads-totals.ts"
      to: "buildAltSpreadRequests"
      via: "getActivePromos(now, user.userId) inside confirmed-only try block"
      pattern: "buildAltSpreadRequests"
    - from: "src/ingestion/odds/refreshExtended.ts"
      to: "selectAltSpreadTargets"
      via: "opts.altSpreads threaded through runSpreadsTotalsRefresh -> runGuardedSpreadsTotalsRefresh"
      pattern: "selectAltSpreadTargets\\("
---

<objective>
Make alternate spreads actually raise ROI on the owner's real promos: single-game, unpinned profit boosts and bonus bets (e.g. promo 19, FanDuel 50% boost on any wager on Steelers @ Browns, min odds -200). Ranking tries every exact-opposite alt pair (promo side at the promo's book at line X, hedge = other team at -X at a hedge book) alongside main-line selections and keeps the max guaranteed profit. The confirmed "Search spreads & totals" press fetches alt spreads for those games. At the same time, clean up the pinned-only wording/logic from quick 260930-gam per the cleanup table in `.planning/.continue-here.md` section "### 2".

Purpose: 260930-gam only helped promos pinned to a non-main spread line (zero exist live). The owner's goal is higher ROI on general game-scoped promos.
Output: opt-in alt enumeration in selection.ts, A1 guard in rankPromoHedges.candidatesFor, generalized alt-target selection + request builder, renamed refresh option, reworded banner/dialog copy, tests to the cent.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/quick/260930-gyl-use-alternate-spreads-to-raise-roi-on-ga/260930-gyl-CONTEXT.md
@.planning/quick/260930-gyl-use-alternate-spreads-to-raise-roi-on-ga/260930-gyl-RESEARCH.md
@.planning/quick/260930-gam-add-alternate-spread-lines-for-pinned-pr/260930-gam-SUMMARY.md
@src/domain/promos/selection.ts
@src/domain/promos/altSpreads.ts
@src/domain/promos/rankPromoHedges.ts
@src/ingestion/odds/refreshExtended.ts
@src/app/actions/refresh-spreads-totals.ts

<locked_decisions>
- A1 (owner, 2026-09-30): alt candidates ONLY for promos with `scope.kind === "event"`, `pinned === null`, `eligibleMarketTypes` includes "spread". Sport-window / any promos get none even if alt lines are cached for a covered game.
- Real line-pinned promos keep the existing `resolveSpread` alt fallback (selection.ts ~80-142) unchanged.
- Fetch ONLY on the confirmed "Search spreads & totals" press. Max 5 games per press (ALT_SPREAD_EVENT_LIMIT), soonest commence first, skipped count reported. Credit gate (CREDIT_BLOCK_THRESHOLD 20) skips only the alt fetch.
- Exact opposite line only; whole-number lines skipped (push risk). decimal.js only for money math. Spreads only (no alternate totals).
- No DB migration. No live-DB writes. schema.ts untouched.
- `enumerateScopeSelections` alt behavior is OPT-IN (default off) so `correctionOptions.ts` output is unchanged.
- Arb tab (`rankArbs.ts`) and bonus-bet finder (`rankBonusBetHedges.ts`) untouched.
- KEEP from 260930-gam: `fetchEventOdds`, `mergeAltSpreads`, `samePoint`, `countUnmatchedAltOutcomes`, `ALT_SPREAD_EVENT_LIMIT`, credit gate, `altLines` outcome shape `{fetched, skippedOverLimit, skippedForCredits, failed, unmatchedOutcomes}`, the ArbForm "info" banner kind, the `resolveSpread` alt fallback.
</locked_decisions>

<interfaces>
From src/domain/promos/selection.ts (current):
- imports: `isHalfPoint` from "@/domain/hedge/spreadsTotalsFilter"; `ALT_SPREADS_MARKET, samePoint` from "./altSpreads"
- `function collectSpreadHomePoints(event: OddsEvent): number[]` (main `spreads` only, ~line 211)
- `export function enumerateScopeSelections(events: { moneyline: OddsEvent[]; extended: OddsEvent[] }, scope: PromoScope, opts: { now: Date; eligibleMarketTypes: readonly PromoMarketType[] }): ResolvedSelection[]` — spread branch loops `collectSpreadHomePoints(extEvent)` pushing `{eventId, marketType:"spread", line: homePoint, side:"home"}` and `{..., line: -homePoint, side:"away"}`, then `resolveSelection` for each.

From src/domain/promos/rankPromoHedges.ts:
- `export interface RankablePromo { id; bookKey: string; promoType: PromoType; scope: PromoScope; pinned: PromoSelection | null; eligibleMarketTypes: readonly PromoMarketType[]; boostPercent: string|null; boostedOddsAmerican; baseOddsAmerican; bonusAmount: string|null; maxStake: string|null; winningsCap; minOddsAmerican: number|null }`
- `export interface RankOptions { moneylineEvents; extendedEvents; now; hedgeBookKeys: ReadonlySet<string>; precision: StakePrecision; ... }`
- `export function candidatesFor(promo: RankablePromo, opts: RankOptions): ResolvedSelection[]` (~line 286): pinned -> getPinnedCandidates, else enumerateScopeSelections(..., promo.scope, { now: opts.now, eligibleMarketTypes: promo.eligibleMarketTypes }).
- Unpinned boost/bonus candidates without a promo-book quote are already dropped; min odds via `passesBaseMinOdds(promo, promoBookQuote)` on the promo-book base price.

From src/domain/promos/scope.ts:
- `export type PromoScope = { kind: "event"; eventId: string; sportKey: string } | { kind: "sport_window"; sportKey: string; windowStart: Date; windowEnd: Date } | { kind: "any" }`

From src/domain/promos/altSpreads.ts (current):
- `export interface AltSpreadPin { eventId: string; line: number; side: "home" | "away" }`
- `export interface AltSpreadTarget { sportKey: string; eventId: string; commenceTime: string }`
- `export function selectAltSpreadTargets(pins: AltSpreadPin[], extendedEvents: OddsEvent[], now: Date): { targets: AltSpreadTarget[]; skippedOverLimit: number }` — drops non-half-point pins, unknown/started events, and events where `mainLineCovers` every pin; sorts commence asc then eventId; caps at 5.

From src/ingestion/odds/refreshExtended.ts:
- `runSpreadsTotalsRefresh(opts: { confirmed: boolean; now?: Date; triggeredByUserId?: number | null; altSpreadPins?: AltSpreadPin[] })` and `runGuardedSpreadsTotalsRefresh` with the same opts (~lines 126-160). Alt block (~line 262): `const pins = opts.altSpreadPins ?? []; if (pins.length > 0) { selectAltSpreadTargets(pins, pendingWrites.flatMap(w => w.extendedEvents), now) ... }`. Header doc on `AltLinesOutcome` (~line 60) says "for pinned promo games".

From src/app/actions/refresh-spreads-totals.ts: builds `altSpreadPins` from `promo.pinned` only inside `if (parsed.data.confirmed) { try { getActivePromos(new Date(), user.userId) ... } catch { [] } }`, passes `altSpreadPins` to `runSpreadsTotalsRefresh`.
</interfaces>

<fixture_numbers>
Hand-checked with the project's own solvers (`calculateProfitBoostHedge`, `calculateBonusBetHedge`, precision "cents"). Game: Pittsburgh Steelers (away) @ Cleveland Browns (home), commence in the future. Promo book `fanduel`, hedge book `draftkings`, hedgeBookKeys = {fanduel, draftkings}.

Main `spreads` (both books): Browns -2.5 -110 / Steelers +2.5 -110.
FanDuel `alternate_spreads` (promo side quotes):
- Browns -6.5 +200 (winner) — DK alt has Steelers +6.5 -230 (exact opposite)
- Steelers -3.5 +150 — DK alt has Browns +3.5 -170
- Steelers +7.5 -250 (deep favorite) — DK alt has Browns -7.5 +400
- Browns -5.5 +180 — DK has NO Steelers +5.5 anywhere (middle decoy, must never be picked; exact opposite only)
- Browns -3 +120 (whole number, must be skipped)
- one outcome named "Pittsburgh" (unmatched name, must be ignored)

Boost: 50%, maxStake 25, no cap.
| Pair | Boost hedge / profit | Bonus $50 hedge / profit |
|---|---|---|
| main Browns -2.5 (-110) vs Steelers +2.5 (-110) | 30.95 / 3.13 | 23.81 / 21.64 |
| alt Browns -6.5 (+200) vs Steelers +6.5 (-230) | 69.69 / 5.30 | 69.69 / 30.30 |
| alt Steelers -3.5 (+150) vs Browns +3.5 (-170) | 51.16 / 5.09 | 47.22 / 27.77 |
| alt Steelers +7.5 (-250) vs Browns -7.5 (+400) | 8.00 / 7.00 | 4.00 / 16.00 |

Hand check of the winner: +200 -> decimal 3.0, boosted 50% of profit -> 4.0; $25 stake pays $100; hedge 100 / (1 + 100/230) = 69.69 (cents); profit = min(100 - 25 - 69.69, 69.69 x 1.434782... - 94.69) = 5.30. Bonus: 100 winnings (stake not returned), hedge 69.69, profit 30.30.
So: with minOddsAmerican -200 the boost winner is Browns -6.5 alt (5.30); with minOddsAmerican null it is Steelers +7.5 alt (7.00) — proves min odds gates the alt deep favorite. Bonus winner (minOdds null) is Browns -6.5 alt (30.30), beating the main line's 21.64.
If any number differs when the executor re-derives it, STOP and re-derive by hand; do not edit expectations to match output.
</fixture_numbers>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Opt-in alt-spread candidates for unpinned single-game promos (ranking)</name>
  <files>src/domain/promos/selection.ts, src/domain/promos/selection.test.ts, src/domain/promos/rankPromoHedges.ts, src/domain/promos/rankPromoHedges.test.ts, src/domain/promos/correctionOptions.test.ts</files>
  <behavior>
    - selection: with `altSpreadBookKey: "fanduel"`, enumerateScopeSelections returns spread candidates for every half-point FanDuel alt point (home name -> point, away name -> negated point), deduped with main points; the whole-number -3 and the unmatched "Pittsburgh" outcome add nothing; without the option the result equals today's (main points only).
    - selection: alt points from a book other than altSpreadBookKey are NOT added as candidates.
    - rank (boost): unpinned event-scoped FanDuel 50% boost, maxStake "25", minOddsAmerican -200 -> chosen selection spread Browns (home) -6.5, hedge draftkings Steelers +6.5 at -230, hedgeStake "69.69", guaranteedProfit "5.30" (> main-line 3.13).
    - rank (min odds): same promo with minOddsAmerican null -> chosen Steelers (away) +7.5 alt, hedge Browns -7.5 +400, hedgeStake "8.00", profit "7.00"; with -200 the +7.5 line is never chosen.
    - rank (bonus): unpinned event-scoped FanDuel $50 bonus bet -> Browns -6.5 alt, hedgeStake "69.69", guaranteedProfit "30.30" (> main 21.64).
    - rank (exact opposite): Browns -5.5 (+180) is never the chosen selection because no book quotes Steelers +5.5.
    - rank (A1): the same boost with scope `{kind:"sport_window", ...}` covering the game (and a `{kind:"any"}` bonus) is chosen on the MAIN line -2.5 (boost profit 3.13 / bonus 21.64) even though alt lines are cached.
    - correctionOptions: for an event whose extended cache includes alternate_spreads, the market options list contains only main-line spread options (same list as without the alt market).
  </behavior>
  <action>
In selection.ts add a private `collectAltSpreadHomePoints(event: OddsEvent, bookKey: string): number[]` next to `collectSpreadHomePoints`: read only that bookmaker's `ALT_SPREADS_MARKET` market; for each outcome skip unless `isHalfPoint(o.point)`; name === home_team adds point, name === away_team adds -point, any other name ignored (never guessed); dedupe via a Map keyed by `Math.round(p * 2)` (doubled half-point, per research pitfall 3). Extend the `enumerateScopeSelections` opts type with optional `altSpreadBookKey?: string` (default undefined = today's behavior, so correctionOptions.ts is unaffected — do NOT edit correctionOptions.ts). In the spread branch, union main home points with alt home points (same doubled-half-point key) when the option is set, then push the same home/away candidate pair; `resolveSpread` already resolves alt lines with the exact-opposite rule — leave `resolveSpread` and its alt fallback untouched (it serves real pins). Update the enumerateScopeSelections doc comment to state the opt-in and why (correction dropdown).

In rankPromoHedges.ts `candidatesFor`, unpinned branch: pass `altSpreadBookKey: promo.scope.kind === "event" ? promo.bookKey : undefined` (per locked decision A1; only the promo's own book because unpinned candidates without a promo-book quote are discarded anyway). Update the one-line doc comment accordingly. Do not change evaluateCandidate, bestHedgeQuote, passesBaseMinOdds, solvers, isBetterCandidate, rankArbs or rankBonusBetHedges.

Tests: write the behavior tests first (RED), using the fixture in `<fixture_numbers>` built with the existing test helpers/style in each file (rankPromoHedges.test.ts already has a gam alternate_spreads fixture near line 124 to copy patterns from; use `precision: "cents"` and compare with `.toFixed(2)` strings). Existing tests that asserted a main-line pick must be updated only if the new pick is a genuinely higher-profit exact-opposite alt pair; note any such change in the SUMMARY (research pitfall 10). pairPromos gains alt candidates through candidatesFor automatically (line-specific pairing); do not change pairPromos.ts, but if a pairPromos test changes, re-derive the expected pair by hand before updating.
  </action>
  <verify>
    <automated>npx vitest run src/domain/promos/selection.test.ts src/domain/promos/rankPromoHedges.test.ts src/domain/promos/correctionOptions.test.ts src/domain/promos/pairPromos.test.ts</automated>
  </verify>
  <done>All behavior tests pass with the exact cent strings above; enumerateScopeSelections without altSpreadBookKey returns the same results as before; correctionOptions test proves no alt lines leak; candidatesFor passes altSpreadBookKey only for unpinned event-scoped promos.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Fetch alt spreads for single-game promo games; generalize 260930-gam pin-only targeting</name>
  <files>src/domain/promos/altSpreads.ts, src/domain/promos/altSpreads.test.ts, src/ingestion/odds/refreshExtended.ts, src/ingestion/odds/refreshExtended.test.ts, src/app/actions/refresh-spreads-totals.ts</files>
  <behavior>
    - buildAltSpreadRequests: unpinned + scope.kind "event" + eligible spread profit boost (maxStake set) -> its eventId in scopedEventIds; same for an unpinned event-scoped bonus bet; unpinned boost with maxStake null -> excluded; sport_window and any scopes -> excluded (A1); moneyline/total-only eligible -> excluded; duplicate event ids deduped; pinned spread selection with half-point line and home/away side -> AltSpreadPin (existing behavior); pinned moneyline -> nothing.
    - selectAltSpreadTargets: a scoped event id is targeted even when the main line equals every line (no mainLineCovers skip); a pin whose line the main line covers is still skipped unless the same event is also scoped; an event both scoped and pinned appears once; sorted by commence asc then eventId; capped at 5 with skippedOverLimit counting both kinds; started or absent events excluded; existing pin cases keep passing.
    - runSpreadsTotalsRefresh: scoped event ids alone (no pins) trigger the per-event alternate_spreads fetch and merge; confirmed:false fetches nothing; credit gate below threshold sets altLines.skippedForCredits and the main refresh still commits; empty requests fetch nothing.
  </behavior>
  <action>
In altSpreads.ts (cleanup table rows for altSpreads.ts:5-7 and :52): reword the header doc to "Alternate-spread helpers for promo games (quick 260930-gam, generalized in 260930-gyl)" describing both single-game promo games and line-pinned promos. Keep `AltSpreadPin`, `AltSpreadTarget`, `samePoint`, `mergeAltSpreads`, `countUnmatchedAltOutcomes`, `ALT_SPREAD_EVENT_LIMIT`, `ALT_SPREADS_MARKET` unchanged. Add `export interface AltSpreadRequests { pins: AltSpreadPin[]; scopedEventIds: string[] }` and `export const NO_ALT_SPREAD_REQUESTS` (empty pins and ids). Add pure `export function buildAltSpreadRequests(promos: readonly AltSpreadPromoInput[]): AltSpreadRequests` where `AltSpreadPromoInput` is a local structural interface `{ promoType: PromoType; scope: PromoScope; pinned: PromoSelection | null; eligibleMarketTypes: readonly PromoMarketType[]; maxStake: string | null }` using type-only imports from "./types" and "./scope" (do NOT import from rankPromoHedges.ts to avoid a cycle; ActivePromo satisfies it structurally). Rules: pinned spread with numeric line and side home/away -> pin (moved verbatim from the action); else if pinned is null, scope.kind === "event", eligibleMarketTypes includes "spread", and not (promoType "profit_boost" with maxStake null, D-18) -> add scope.eventId (deduped, insertion order). Change `selectAltSpreadTargets(requests: AltSpreadRequests, extendedEvents, now)`: build per-event entries from scoped ids (flag `scoped`) and half-point pins; an event is a candidate if present, strictly future, and (scoped OR not every pin covered by mainLineCovers); keep the existing sort, the 5 cap, and skippedOverLimit.

In refreshExtended.ts (cleanup row :61,130,159,265): replace the `altSpreadPins?: AltSpreadPin[]` option on both runSpreadsTotalsRefresh and runGuardedSpreadsTotalsRefresh with `altSpreads?: AltSpreadRequests`; in the alt block use `const requests = opts.altSpreads ?? NO_ALT_SPREAD_REQUESTS` and guard `requests.pins.length > 0 || requests.scopedEventIds.length > 0`, then call `selectAltSpreadTargets(requests, ...)`. Reword the `AltLinesOutcome` doc and the in-block comment from "pinned promo games" to "games with a promo (single-game promos and line-pinned promos)". Keep the cost estimate, credit gate, sequential per-fetch try/catch, refreshCost/quota accounting, mergeAltSpreads, unmatchedOutcomes and the altLines shape exactly as they are.

In refresh-spreads-totals.ts (cleanup row :38-45): replace the inline pin loop with `altSpreads = buildAltSpreadRequests(await getActivePromos(new Date(), user.userId))` inside the same confirmed-only try block; on catch fall back to `NO_ALT_SPREAD_REQUESTS`; pass `altSpreads` to runSpreadsTotalsRefresh. Keep requireUser first, keep the T-gam-01 comment (ids come from server-loaded promos only, never client input) reworded for both kinds. Update altSpreads.test.ts and refreshExtended.test.ts (the 6 `altSpreadPins` call sites and `pinsFor` helper) to the new request shape and add the behavior tests above; keep all existing gam assertions (cap, credit gate, failure isolation, unmatchedOutcomes) passing.
  </action>
  <verify>
    <automated>npx vitest run src/domain/promos/altSpreads.test.ts src/ingestion/odds/refreshExtended.test.ts src/app/actions/refresh-spreads-totals.test.ts && test "$(grep -rn 'altSpreadPins' src | wc -l | tr -d ' ')" = "0"</automated>
  </verify>
  <done>Scoped single-game promo games trigger the alt fetch on a confirmed press without the main-line-covers skip; pins still work; no `altSpreadPins` identifier remains in src; altLines outcome shape unchanged; all listed tests pass.</done>
</task>

<task type="auto">
  <name>Task 3: Reword pinned-only UI copy and run full gates</name>
  <files>src/components/arb/ArbForm.tsx, src/components/arb/SearchSpreadsTotalsDialog.tsx</files>
  <action>
Per the cleanup table: in ArbForm.tsx (~lines 136, 140, 144) replace "pinned game(s)" wording with "game(s) with a promo" — e.g. "Alternate lines were fetched for N game(s) with a promo; M more were skipped (limit is 5 per search).", "Alternate lines for promo games were skipped to save credits — your balance is low.", "Alternate lines couldn't be loaded for N game(s) with a promo." Keep the singular/plural handling, the unmatched-names note, and the "info" banner kind. In SearchSpreadsTotalsDialog.tsx line ~58 replace the sentence with " Alternate spreads for up to 5 promo games use up to 5 more credits." (Claude's discretion on exact wording within that meaning, per CONTEXT). If any test asserts the old strings, update it to the new copy. Then run the full gates: full vitest suite, `npx tsc --noEmit` (the known `LayoutProps` artifact in src/app/layout.tsx is pre-existing and acceptable; no new errors), `npm run lint`. Confirm `git diff --stat` shows no change to src/db/schema.ts, drizzle migrations, rankArbs.ts, rankBonusBetHedges.ts, correctionOptions.ts, or pairPromos.ts. Do NOT run db:migrate or touch the live DB.

Note for the orchestrator (not the executor, STATE is updated at quick-task step 7): the STATE.md quick-table row for 260930-gam should be marked "Superseded by 260930-gyl" when this task completes (cleanup table last row).
  </action>
  <verify>
    <automated>test "$(grep -v '^\s*//' src/components/arb/ArbForm.tsx src/components/arb/SearchSpreadsTotalsDialog.tsx | grep -ci 'pinned')" = "0" && npx vitest run && npx tsc --noEmit 2>&1 | grep -v LayoutProps | grep -c "error TS" | grep -qx 0 && npm run lint && test -z "$(git diff --name-only -- src/db/schema.ts drizzle src/domain/hedge/rankArbs.ts src/domain/hedge/rankBonusBetHedges.ts src/domain/promos/correctionOptions.ts src/domain/promos/pairPromos.ts)"</automated>
  </verify>
  <done>No "pinned" wording remains in the arb banner/dialog; full suite, tsc (apart from the known LayoutProps artifact) and lint pass; no schema, migration, arb, bonus-finder, correctionOptions or pairPromos source changes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client -> refreshSpreadsTotals server action | Only `{confirmed: boolean}` crosses; alt targets are derived server-side from the member's own promos |
| server -> The Odds API | Credit-spending per-event calls |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gyl-01 | Tampering | refresh-spreads-totals.ts | mitigate | Event ids come only from `getActivePromos(now, user.userId)` via buildAltSpreadRequests; no client-supplied ids (keeps T-gam-01); requireUser stays first statement |
| T-gyl-02 | Denial of Service (credit exhaustion) | refreshExtended alt block | mitigate | ALT_SPREAD_EVENT_LIMIT 5 cap, CREDIT_BLOCK_THRESHOLD gate, confirmed-press only, refresh lock unchanged |
| T-gyl-03 | Information disclosure | fetchEventOdds errors | accept | Unchanged from gam: errors never include URL or key |
| T-gyl-04 | Tampering (wrong money) | selection/rank alt candidates | mitigate | Exact-opposite half-point matching via doubled points, promo-book-only promo side, decimal.js solvers, cent-exact tests |
</threat_model>

<verification>
- Targeted: `npx vitest run src/domain/promos/selection.test.ts src/domain/promos/rankPromoHedges.test.ts src/domain/promos/correctionOptions.test.ts src/domain/promos/altSpreads.test.ts src/ingestion/odds/refreshExtended.test.ts`
- Full: `npx vitest run`, `npx tsc --noEmit` (only the known LayoutProps artifact), `npm run lint`
- `grep -rn altSpreadPins src` returns nothing; `grep -n altSpreadBookKey src/domain/promos/rankPromoHedges.ts` shows the event-scope guard.
</verification>

<success_criteria>
- Unpinned single-game boost picks Browns -6.5 alt: hedge $69.69, profit $5.30 (main line $3.13); bonus bet picks it at $30.30 (main $21.64); min odds -200 blocks the -250 deep-favorite alt; sport-window/any promos stay on main lines; correctionOptions output unchanged.
- Confirmed press fetches alt spreads for single-game promo games (max 5, soonest first, skipped count, credit gate only on alt fetch).
- Cleanup table covered: action, altSpreads header + targeting, refreshExtended naming/docs, resolveSpread fallback kept, ArbForm + dialog copy, tests updated; STATE row flagged for orchestrator.
- No migrations, no live-DB writes; arb tab and bonus-bet finder unchanged.
</success_criteria>

<output>
Create `.planning/quick/260930-gyl-use-alternate-spreads-to-raise-roi-on-ga/260930-gyl-SUMMARY.md` when done (note any existing test expectation that changed because an alt line now correctly wins, and the reminder that owner should press "Search spreads & totals" once to confirm alt outcome names match team names).
</output>
