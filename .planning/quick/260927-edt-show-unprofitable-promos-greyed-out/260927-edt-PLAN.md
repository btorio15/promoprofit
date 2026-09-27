---
phase: quick-260927-edt
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/domain/hedge/profitBoost.ts
  - src/domain/hedge/profitBoost.test.ts
  - src/domain/promos/rankPromoHedges.ts
  - src/domain/promos/rankPromoHedges.test.ts
  - src/domain/promos/describe.ts
  - src/domain/promos/dto.ts
  - src/app/actions/get-promos.ts
  - src/app/actions/get-promos.test.ts
  - src/components/promos/FlagMatchButton.tsx
  - src/components/promos/PromoRow.tsx
  - src/components/promos/UnprofitablePromoRow.tsx
  - src/components/promos/PromosScreen.tsx
autonomous: true
requirements: [QUICK-260927-edt]

must_haves:
  truths:
    - "An active promo with no strictly-profitable hedge (e.g. Bally Bet 10% Rams–Broncos boost, max $20, min odds +100) appears on the Promos tab as a greyed-out row AFTER all profitable rows instead of disappearing"
    - "That row reads 'No profitable hedge right now (best: −$0.65)' at cents precision — the least-negative guaranteed profit, computed exactly with the decimal.js engines and formatted to cents only at the end"
    - "An active promo for which no candidate could be evaluated at all (no odds for its scope, every side fails min odds, no allowed hedge quote) reads 'No eligible bets right now'"
    - "Greyed rows show book, promo title (boost % / boosted price / bonus amount), scope label, Auto-matched badge + flag button — and never stakes, hedge instructions, or an expand chevron"
    - "rankPromoHedges output, calculateProfitBoostHedge output, profitable-row ordering, and the no-books / no-odds / none-scraped empty states are byte-for-byte unchanged"
    - "Zero profitable rows + at least one unprofitable promo shows the greyed rows instead of the 'no-active' empty state (unless 'no-books' applies, which still wins)"
  artifacts:
    - path: "src/domain/hedge/profitBoost.ts"
      provides: "calculateProfitBoostHedgeUnfiltered (same solver, no <=0 filter); calculateProfitBoostHedge wraps it"
      contains: "calculateProfitBoostHedgeUnfiltered"
    - path: "src/domain/promos/rankPromoHedges.ts"
      provides: "findUnprofitablePromos — additive per-promo best (max) guaranteed profit or null"
      exports: ["rankPromoHedges", "findUnprofitablePromos", "UnprofitablePromo"]
    - path: "src/domain/promos/dto.ts"
      provides: "UnprofitablePromoRowDTO + unprofitableRows on the ok response"
      contains: "UnprofitablePromoRowDTO"
    - path: "src/components/promos/UnprofitablePromoRow.tsx"
      provides: "Muted, non-expandable row"
    - path: "src/components/promos/FlagMatchButton.tsx"
      provides: "Flag-back button extracted from PromoRow, shared by both row kinds"
  key_links:
    - from: "src/app/actions/get-promos.ts"
      to: "findUnprofitablePromos"
      via: "called with the same rankOpts as rankPromoHedges"
      pattern: "findUnprofitablePromos\\("
    - from: "src/components/promos/PromosScreen.tsx"
      to: "response.unprofitableRows"
      via: "rendered after response.rows"
      pattern: "unprofitableRows"
---

<objective>
Owner request: "yes, show unprofitable promos greyed out". Active promos whose best hedge is not strictly profitable currently vanish from the Promos tab (e.g. Bally Bet 10% Rams–Broncos boost, best ≈ −$0.65). Show them as muted, non-actionable rows after the profitable ones, each with an exact "best" figure or "No eligible bets right now".

Purpose: members can see that a promo exists and was evaluated (and flag a wrong auto-match), without ever being told to place a losing bet.
Output: an unfiltered boost solver entry point, an additive ranker function, a new DTO list on getPromos, and a greyed row component.

Hard rule: this is ADDITIVE. rankPromoHedges, calculateProfitBoostHedge, calculateBonusBetHedge, and every existing consumer keep their exact current behavior; only-strictly-profitable remains the definition of an "opportunity". All money math in decimal.js; convert to 2-dp strings only at the DTO boundary (CLAUDE.md: no native float money math).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src/domain/promos/rankPromoHedges.ts
@src/domain/hedge/profitBoost.ts
@src/domain/promos/dto.ts
@src/app/actions/get-promos.ts
@src/components/promos/PromoRow.tsx
@src/components/promos/PromosScreen.tsx

<interfaces>
From src/domain/hedge/profitBoost.ts (current):
- export function calculateProfitBoostHedge(input: ProfitBoostInput): ProfitBoostResult | null
  Returns null when (a) boostedDecimalOdds < minOdds (D-17), (b) no stake candidate, or (c) best.guaranteedProfit.lte(0). Throws RangeError on bad inputs. Its body ends with `if (best === null || best.guaranteedProfit.lte(0)) return null;` then computes roiPct (guaranteedProfit / totalStaked * 100, ROUND_DOWN 2dp) and returns the result object.

From src/domain/hedge/bonusBet.ts:
- export function calculateBonusBetHedge(input): BonusBetHedgeResult  — never returns null; guaranteedProfit may be <= 0 (the ranker's evaluateBonusCandidate is what drops <= 0).

From src/domain/promos/rankPromoHedges.ts (current, internal helpers):
- RankablePromo, PromoOpportunity<P>, RankOptions { moneylineEvents, extendedEvents, hedgeBookKeys, precision, now } (RankOptions is NOT exported today)
- bestHedgeQuote, getPinnedCandidates, passesBaseMinOdds, evaluateBoostCandidate, evaluateBonusCandidate, evaluateCandidate, evaluatePromo (D-18 maxStake-null boost -> null; candidates = pinned ? getPinnedCandidates : enumerateScopeSelections(...))
- export function rankPromoHedges<P extends RankablePromo>(promos: P[], opts: RankOptions): PromoOpportunity<P>[]

From src/db/promos.ts:
- export interface ActivePromo extends RankablePromo { finePrintNote; claimHint; scopeLabel: string; autoMatched: boolean; attribution: {...}[] }

From src/domain/promos/describe.ts:
- function formatBoostPercent(value: string): string  (PRIVATE today: "10.00" -> "10%", "12.50" -> "12.50%")

From src/lib/format.ts:
- formatUsd(value: string): string  ("-0.65" -> "-$0.65" with ASCII hyphen), formatAmerican(odds: number) (uses U+2212 minus)

From src/domain/promos/dto.ts:
- GetPromosResponse = { status: "ok"; scrapeStatus; emptyVariant: PromosEmptyVariant | null; rows: PromoRowDTO[]; queue; correctionOptions } | { status: "invalid" }

From src/components/promos/PromoRow.tsx:
- flag-back: useTransition + flagPromoMatch({ promoId }) from "@/app/actions/flag-promo-match"; outcome.status === "ok" -> onChanged(); else show outcome.message (or "Couldn't flag this promo.") in a role="alert" text-destructive <p>. Button: variant="ghost" size="icon", className "pointer-events-auto h-10 w-10", aria-label "Flag this match as wrong", Flag icon size-4, wrapped in Tooltip "Flag this match as wrong — sends it back for review.", onClick calls event.stopPropagation() first.
</interfaces>

Worked example (hand-verified, use as the negative-profit fixture): event home "Denver Broncos", away "Los Angeles Rams". Promo book ballybet quotes Broncos +107, Rams −135; hedge book betmgm quotes Broncos +105, Rams −125. Promo: profit_boost, bookKey ballybet, event scope on that event, pinned null, eligibleMarketTypes ["moneyline"], boostPercent "10.00", maxStake "20.00", minOddsAmerican 100, winningsCap null. hedgeBookKeys = {betmgm}.
- Rams side at ballybet (−135) fails base min odds +100 -> not evaluated.
- Broncos side: boosted decimal 1 + 1.07 × 1.10 = 2.177; stake 20 -> payout 43.54; hedge Rams −125 (1.8).
  - precision "cents": hedge 24.19 -> payout 43.54, total 44.19 -> guaranteed −0.65 (best). candidatesEvaluated 1.
  - precision "whole": hedge 24 -> payout 43.20, total 44 -> min(−0.46, −0.80) = −0.80 (best).
- rankPromoHedges returns [] for this fixture (unchanged behavior).
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Unfiltered boost solver + additive findUnprofitablePromos ranker</name>
  <files>src/domain/hedge/profitBoost.ts, src/domain/hedge/profitBoost.test.ts, src/domain/promos/rankPromoHedges.ts, src/domain/promos/rankPromoHedges.test.ts</files>
  <read_first>
    - src/domain/hedge/profitBoost.ts (full; the D-17 doc comment and the tail of calculateProfitBoostHedge)
    - src/domain/promos/rankPromoHedges.ts (full)
    - src/domain/promos/rankPromoHedges.test.ts lines 1-110 (fixture helpers moneylineEvent, eventScope, defaultPromo) and the "no allowed opposite quote" test near line 615
  </read_first>
  <behavior>
    - profitBoost: calculateProfitBoostHedgeUnfiltered on the worked example inputs (base +107, boostPercent 10, hedge −125, maxStake 20, minOdds +100, cents) returns guaranteedProfit exactly "-0.65" (Decimal.equals), and calculateProfitBoostHedge on the same inputs still returns null.
    - profitBoost: calculateProfitBoostHedgeUnfiltered still returns null when boosted odds are below minOdds (D-17 eligibility is not a profit filter).
    - ranker: worked example, cents -> rankPromoHedges returns []; findUnprofitablePromos returns one entry { promo.id, bestGuaranteedProfit equals Decimal("-0.65"), candidatesEvaluated 1 }.
    - ranker: worked example, whole -> bestGuaranteedProfit equals Decimal("-0.80").
    - ranker: promo with no evaluable candidate (events list empty, OR hedgeBookKeys containing no book that quotes the opposite side) -> entry with bestGuaranteedProfit null, candidatesEvaluated 0.
    - ranker: a promo that IS profitable (reuse an existing profitable fixture) is excluded from findUnprofitablePromos; mixed input of [profitable, negative, null] returns only [negative, null] in that order (profit desc, nulls last, then promo id asc).
    - ranker: boost with maxStake null (D-18) -> entry with bestGuaranteedProfit null.
  </behavior>
  <action>
    profitBoost.ts: rename the current body of calculateProfitBoostHedge into a new exported function calculateProfitBoostHedgeUnfiltered(input: ProfitBoostInput): ProfitBoostResult | null whose final guard is only `best === null` -> null (keep the D-17 min-odds null, keep every RangeError, keep roiPct computation — it is well-defined for non-positive profit since totalStaked > 0). Re-implement calculateProfitBoostHedge as: call the unfiltered function; return null if the result is null or result.guaranteedProfit.lte(0); otherwise return it unchanged. Update the module doc comment: D-17's "not shown" rule is enforced by calculateProfitBoostHedge; the Unfiltered variant exists only to report "best available" figures for display, never stakes. Add the two profitBoost behavior tests. Do NOT touch bonusBet.ts.

    rankPromoHedges.ts: export the RankOptions interface (rename-free, just add export). Thread a private flag allowNonPositive: boolean (default false) through evaluateCandidate -> evaluateBoostCandidate / evaluateBonusCandidate: when true, the boost path calls calculateProfitBoostHedgeUnfiltered instead of calculateProfitBoostHedge, and the bonus path skips its `bonus.guaranteedProfit.lte(0)` drop. Every other filter (base min odds via passesBaseMinOdds, bestHedgeQuote over hedgeBookKeys, unpinned-without-promo-book-quote skip, D-03 pinned-only published price, D-18 maxStake-null, RangeError -> warn + skip) stays identical in both modes. Extract the candidate list construction from evaluatePromo into a small helper candidatesFor(promo, opts) used by both paths (pure refactor). rankPromoHedges/evaluatePromo must keep passing allowNonPositive=false so their output is unchanged.

    Add and export interface UnprofitablePromo<P extends RankablePromo = RankablePromo> { promo: P; bestGuaranteedProfit: Decimal | null; candidatesEvaluated: number } and export function findUnprofitablePromos<P extends RankablePromo>(promos: P[], opts: RankOptions): UnprofitablePromo<P>[]. Implementation: compute the set of promo ids present in rankPromoHedges(promos, opts); for every promo NOT in that set, if it is a profit_boost with maxStake null -> { bestGuaranteedProfit: null, candidatesEvaluated: 0 }; otherwise evaluate every candidate from candidatesFor with allowNonPositive=true, count evaluated (non-null) candidates, and keep the maximum guaranteedProfit via Decimal comparedTo (null if none evaluated). Sort: bestGuaranteedProfit desc with nulls last, then promo.id asc. Doc comment: purely informational — callers must never derive stakes or instructions from it; opportunities remain strictly-profitable only.

    Add the ranker behavior tests to rankPromoHedges.test.ts in a new describe("findUnprofitablePromos") block using the worked-example fixture (build the event with the existing moneylineEvent helper: homeTeam "Denver Broncos" prices ballybet +107 / betmgm +105, awayTeam "Los Angeles Rams" prices ballybet −135 / betmgm −125, commenceTime inside scope, now = NOW). Assert Decimal values with .equals / toFixed(2), never with native floats. Existing tests must pass unmodified.
  </action>
  <verify>
    <automated>npx vitest run src/domain/hedge/profitBoost.test.ts src/domain/promos/rankPromoHedges.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>New tests pass, including exact −0.65 (cents) and −0.80 (whole) and the null case; all pre-existing profitBoost/rankPromoHedges tests pass without edits; calculateProfitBoostHedge and rankPromoHedges behavior unchanged; typecheck clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: UnprofitablePromoRowDTO + getPromos wiring and empty-state interaction</name>
  <files>src/domain/promos/describe.ts, src/domain/promos/dto.ts, src/app/actions/get-promos.ts, src/app/actions/get-promos.test.ts</files>
  <read_first>
    - src/app/actions/get-promos.ts (full)
    - src/app/actions/get-promos.test.ts lines 1-130 (mocks, moneylineEvent, activeBoostPromo, activeBonusPromo) and 405-470 (no-books / no-active tests)
    - src/domain/promos/describe.ts lines 1-55
    - src/lib/format.ts lines 15-40
  </read_first>
  <behavior>
    - One profitable + one negative promo -> rows has the profitable row only (unchanged mapping), unprofitableRows has one entry, emptyVariant null.
    - Only the worked-example negative promo (ballybet book, betmgm hedge; mockGetBonusBooks includes ballybet "Bally Bet" and betmgm "BetMGM"; user/hedge books include betmgm; precision "cents") -> emptyVariant null, rows [], unprofitableRows[0] = { rowKey "unprofitable-promo-{id}", bookName "Bally Bet", title "10% profit boost", scopeLabel from the fixture, bestGuaranteedProfit "-0.65", note "No profitable hedge right now (best: −$0.65)" (U+2212), autoMatched true }.
    - Existing test "returns 'no-active' when no rows exist at any usable book" is UPDATED (spec change requested by owner): now emptyVariant null, rows [], unprofitableRows has one entry with bestGuaranteedProfit null and note "No eligible bets right now".
    - 'no-active' still returned when there are zero active promos (existing test keeps passing; assert unprofitableRows []).
    - 'no-books' test unchanged in its expectations, plus unprofitableRows [] (no-books still wins).
    - 'no-odds' path returns unprofitableRows [].
    - Bonus-bet title "$25.00 bonus bet"; pinned boost with boostedOddsAmerican 150 title "Boosted to +150".
  </behavior>
  <action>
    describe.ts: export the existing formatBoostPercent helper (no behavior change).

    dto.ts: add exported interface UnprofitablePromoRowDTO with fields: rowKey (string, "unprofitable-promo-{promoId}"), promoId (number), promoType (PromoType), promoTypeLabel ("Boost" | "Bonus bet"), bookKey, bookName, title (string), scopeLabel (string), autoMatched (boolean), bestGuaranteedProfit (string | null — fixed 2-dp, e.g. "-0.65"; null when nothing could be evaluated), note (string — display-ready). Doc comment: never carries stakes, hedge book, or selection — by design, so the UI cannot render "place this bet" guidance. Add unprofitableRows: UnprofitablePromoRowDTO[] to the "ok" branch of GetPromosResponse (after rows).

    get-promos.ts: import findUnprofitablePromos. Add a toUnprofitablePromoRowDTO(entry: UnprofitablePromo<ActivePromo>, bookNames) mapper. Title: profit_boost with boostedOddsAmerican !== null -> "Boosted to " + formatAmerican(boostedOddsAmerican); other profit_boost -> formatBoostPercent(boostPercent ?? "0.00") + " profit boost"; bonus_bet -> formatUsd(bonusAmount ?? "0.00") + " bonus bet". bestGuaranteedProfit = entry.bestGuaranteedProfit?.toFixed(2) ?? null (Decimal toFixed — engines already produce cent-exact values; no Number conversion). Note: null -> "No eligible bets right now"; otherwise "No profitable hedge right now (best: X)" where X is, for a negative value, "−" (U+2212) + formatUsd of the absolute 2-dp string (e.g. "−$0.65"), else formatUsd of the value (e.g. "$0.00"). Build the sign with Decimal.isNegative()/abs(), not string slicing of floats.

    Flow changes (keep everything else identical): every existing return in the "ok" shape gains unprofitableRows: [] (none-scraped/no-active zero-promos branch, no-odds branch). After rankPromoHedges, compute unprofitable = findUnprofitablePromos(activePromos, rankOpts) (same rankOpts — member's own hedge books). In the opportunities.length === 0 branch: compute emptyVariant exactly as today (the no-books re-rank logic untouched); then, if emptyVariant === "no-active" and unprofitable.length > 0, return { emptyVariant: null, rows: [], unprofitableRows: mapped } instead; otherwise return the empty variant with unprofitableRows []. In the success branch, return rows unchanged plus unprofitableRows: mapped (already ordered by the ranker; profitable rows come first because they are a separate list rendered first).

    Tests: add the behavior cases above to get-promos.test.ts (extend mockGetBonusBooks per-test with ballybet/betmgm names rather than changing the global default); update the one existing no-active test as described with a comment citing quick-260927-edt. No network, no Odds API — all via existing mocks.
  </action>
  <verify>
    <automated>npx vitest run src/app/actions/get-promos.test.ts src/domain/promos && npx tsc --noEmit</automated>
  </verify>
  <done>getPromos returns unprofitableRows on every ok response; worked example yields note "No profitable hedge right now (best: −$0.65)"; empty-state interaction matches the behavior list; all other get-promos tests pass unchanged; typecheck clean.</done>
</task>

<task type="auto">
  <name>Task 3: Greyed-out UnprofitablePromoRow + shared FlagMatchButton + screen wiring</name>
  <files>src/components/promos/FlagMatchButton.tsx, src/components/promos/PromoRow.tsx, src/components/promos/UnprofitablePromoRow.tsx, src/components/promos/PromosScreen.tsx</files>
  <read_first>
    - src/components/promos/PromoRow.tsx (full)
    - src/components/promos/PromosScreen.tsx (full)
    - .planning/phases/03-promo-scraping-review/03-UI-SPEC.md "Promo row" section (around line 90-110) for badge/flag conventions
  </read_first>
  <action>
    FlagMatchButton.tsx ("use client"): extract PromoRow's flag-back logic verbatim into a component taking { promoId: number; onChanged: () => void } that renders the Tooltip-wrapped ghost icon Button (same classes, aria-label, tooltip copy, stopPropagation, useTransition pending-disable) plus the role="alert" error <p> when flagging fails. Return a fragment so it can sit inline in PromoRow's badge line; if the error <p> placement inside the inline span is awkward, expose the message via a small render structure (e.g. wrap in an inline-flex span with the alert below) — keep PromoRow's visual output equivalent. PromoRow.tsx: replace its inline flag logic with FlagMatchButton (next to the Auto-matched badge, only when row.autoMatched); remove now-unused imports. No other PromoRow changes.

    UnprofitablePromoRow.tsx ("use client"): props { row: UnprofitablePromoRowDTO; onChanged: () => void }. A plain div (NOT Collapsible, no trigger, no chevron, not focusable as a whole) with classes "rounded-lg border border-border bg-secondary/40 p-4 opacity-60" and aria-label "{bookName} {title} — {note}". Content, stacked: first line — Badge variant="outline" {promoTypeLabel}, text-base {title}, text-sm text-muted-foreground {bookName}; when row.autoMatched: Badge "Auto-matched" + FlagMatchButton (the flag button must remain clickable — wrap it so it is NOT affected by pointer-events-none; opacity inheritance is fine). Second line: text-sm text-muted-foreground "Promo: {scopeLabel}". Third line: text-sm text-muted-foreground {note}. Render NO stake, payout, hedge book, profit column, ROI, or "place" wording — only the fields in the DTO listed here.

    PromosScreen.tsx: in the list branch, change the condition from rows.length > 0 to (rows.length > 0 || unprofitableRows.length > 0). Render RiskAdvisory and profitable PromoRows exactly as now, then after them (same flex-col gap-2 list) map response.unprofitableRows to UnprofitablePromoRow keyed by rowKey with onChanged={runGetPromos}. Empty-state branch stays first and unchanged.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx eslint src/components/promos && npx vitest run</automated>
  </verify>
  <done>Typecheck, lint, and the full vitest suite pass; UnprofitablePromoRow renders after profitable rows, is muted and non-expandable, contains no stake/hedge fields, and keeps a working flag button on auto-matched promos; PromoRow behavior unchanged apart from using the shared FlagMatchButton.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| server action -> client | getPromos returns promo data to a logged-in member |
| client -> flagPromoMatch | existing action, already session-gated and validated |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-q-edt-01 | Tampering (money correctness) | findUnprofitablePromos / UnprofitablePromoRowDTO | mitigate | DTO has no stake/hedge fields, so a losing bet can never be presented as instructions; opportunities list stays strictly-profitable (existing rankPromoHedges tests unmodified) |
| T-q-edt-02 | Information disclosure | getPromos unprofitableRows | accept | Same promo fields members already see on profitable rows; requireUser() remains the first statement |
| T-q-edt-03 | Elevation of privilege | FlagMatchButton | accept | Reuses existing flagPromoMatch action unchanged (session-gated, id validated server-side) |
</threat_model>

<verification>
- npx vitest run (full suite green; pre-existing rankPromoHedges/profitBoost/bonusBet tests unmodified)
- npx tsc --noEmit
- npx eslint src/components/promos src/domain/promos src/domain/hedge src/app/actions
- grep -v '^\s*//' src/components/promos/UnprofitablePromoRow.tsx | grep -c -E 'Stake|hedgeStake|guaranteedProfit|Collapsible' returns 0
</verification>

<success_criteria>
- Worked-example Bally Bet boost shows as a greyed row: "No profitable hedge right now (best: −$0.65)" at cents
- Promos with nothing evaluable show "No eligible bets right now"
- Greyed rows appear after all profitable rows, are non-expandable, show no stakes, and keep the flag button when auto-matched
- rankPromoHedges and calculateProfitBoostHedge outputs unchanged; no-books/no-odds/none-scraped unchanged; no-active only when there are no active promos at all (or none unprofitable)
</success_criteria>

<output>
Create `.planning/quick/260927-edt-show-unprofitable-promos-greyed-out/260927-edt-SUMMARY.md` when done
</output>
