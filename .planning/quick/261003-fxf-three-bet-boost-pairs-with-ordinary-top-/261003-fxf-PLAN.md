---
phase: quick-261003-fxf
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/domain/hedge/pairMath.ts
  - src/domain/hedge/pairMath.oracle.ts
  - src/domain/hedge/pairMath.topUp.test.ts
  - src/domain/promos/rankPromoHedges.ts
  - src/domain/promos/pairPromos.ts
  - src/domain/promos/pairPromos.test.ts
  - src/domain/promos/pairRowDto.ts
  - src/domain/promos/pairRowDto.test.ts
  - src/domain/promos/pairSnapshot.ts
  - src/domain/promos/pairSnapshot.test.ts
  - src/domain/promos/reviewInput.ts
  - src/app/actions/mark-pair-done.ts
  - src/components/opportunities/MarkPairDoneButton.tsx
  - src/components/opportunities/PairCard.tsx
  - src/components/opportunities/PairDetails.tsx
  - src/components/promos/DonePairRow.tsx
autonomous: true
requirements: [CALC-07]

must_haves:
  truths:
    - "A boost+boost pair may carry ONE ordinary (unboosted) top-up bet on either side, at the member's best hedge book for that side, and the solver picks whichever of {2-bet, top-up on B's side, top-up on A's side} gives the highest guaranteed profit"
    - "Owner case shape (DK 50% boost cap $20 on the plus side, FD 30% boost cap $10 on the minus side, min odds -200) now yields a pair whose guaranteed profit beats the two singles, so it appears in the feed"
    - "When the best answer uses no top-up, results are byte-identical to today's 2-bet solver (existing pairMath/pairPromos tests unchanged and passing)"
    - "Pair shown only if its profit strictly beats the sum of the two singles (D-08 unchanged); the pre-solver bound never prunes a pair whose 3-bet profit would beat singles"
    - "Rounded stakes (whole or cents) leave BOTH outcomes at or above the stated guaranteed profit"
    - "PairCard and the Done tab show the third bet (book, side, odds, stake) clearly; mark-pair-done stores all three legs; old 2-leg snapshots still parse"
  artifacts:
    - path: "src/domain/hedge/pairMath.ts"
      provides: "solveBoostBoostPairWithTopUp + optional PairResult.topUp"
      exports: ["solveBoostBoostPairWithTopUp", "TopUpQuote"]
    - path: "src/domain/hedge/pairMath.topUp.test.ts"
      provides: "cent-exact 3-bet tests cross-checked by brute-force oracle"
    - path: "src/domain/promos/pairPromos.ts"
      provides: "top-up-aware pair discovery, relaxed prune + valid bound"
      contains: "solveBoostBoostPairWithTopUp"
    - path: "src/domain/promos/pairSnapshot.ts"
      provides: "optional legC in snapshot schema + DonePairDTO"
      contains: "legC"
  key_links:
    - from: "src/domain/promos/pairPromos.ts"
      to: "bestHedgeQuote (rankPromoHedges.ts)"
      via: "picks top-up book from opts.hedgeBookKeys on each side's quotes"
      pattern: "bestHedgeQuote\\("
    - from: "src/domain/promos/pairRowDto.ts"
      to: "PairResult.topUp"
      via: "toPairRowDTO maps topUp to legC"
      pattern: "legC"
    - from: "src/app/actions/mark-pair-done.ts"
      to: "isSamePairDisplay"
      via: "expectedStakeC compared against recomputed row.legC"
      pattern: "stakeC"
---

<objective>
Let a boost+boost competing-promo pair add ONE ordinary (unboosted) top-up hedge bet so the boost with the larger cap can use its full stake when the other boost's cap binds. Pick the max guaranteed profit across {no top-up, top-up on B's side, top-up on A's side}; keep the D-08 strict gate.

Owner-reported case (2026-10-03): DK #36 NCAAF 50% boost (member cap $20) on Baylor +154, FD #39 NCAAF 30% boost (cap $10) on Arizona State -172, min odds -200. Singles $4.33 + $0.85 = $5.18. Today's best 2-bet pair is $3.27 and is dropped by D-08. With DK $20 boosted, FD $10 boosted, plus an ordinary ASU bet of about $30.76 at about -172, profit is about $5.43 at cents precision (about $5.20 whole), which beats $5.18. These numbers are only for orientation. Tests must compute expected values with the brute-force oracle, not copy them from here.

Output: new solver + tests, top-up-aware discovery, a third leg in the DTO, snapshot, UI and mark-done.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@src/domain/hedge/pairMath.ts
@src/domain/promos/pairPromos.ts
@src/domain/promos/pairRowDto.ts
@src/domain/promos/pairSnapshot.ts

<interfaces>
From src/domain/hedge/pairMath.ts (existing; internal helpers reused):
- BoostLegInput, BonusLegInput, PairLegResult { stake, payout, oddsDecimal, priceSource: "published"|"derived"|"quote", capBound }
- PairResult { legA, legB, totalStaked, netIfAWins, netIfBWins, guaranteedProfit, roiPct }
- private: precisionOf, prepareBoost, rawPayout, inversePayout, stakeSeeds, windowAround, memoPayout, beats, capBoundOf, roiOf, clamp, dedupe, WINDOW_UNITS, LocalDecimal
- solveBoostBoostPairUnfiltered(a, b, precision), solveBoostBoostPair(a, b, precision) (prune: 1/OA + 1/OB >= 1 -> null; profit <= 0 -> null)
From src/domain/hedge/profitBoost.ts: floorCents, clean, promoPayoutRaw, kinkStake, effectiveBoostedDecimal
From src/domain/hedge/americanOdds.ts: americanToDecimal
From src/domain/promos/rankPromoHedges.ts (line ~77, currently NOT exported):
  function bestHedgeQuote(quotes: SelectionQuote[], hedgeBookKeys: ReadonlySet<string>): SelectionQuote | null
  RankOptions { ...; hedgeBookKeys: ReadonlySet<string>; precision: StakePrecision }
From src/domain/promos/selection.ts: SelectionQuote { bookKey, oddsAmerican }; ResolvedSelection has promoSideQuotes / oppositeSideQuotes, sideSelection, sidePoint, marketType
From src/domain/promos/pairPromos.ts: LegOption { selection, oddsDecimal, boost, bonus, ... }; findPairCandidates(promos, singles, opts: RankOptions & { memberBookKeys }); prune at ~271, bound at ~273-281, D-08 gate at ~297
Callers of findPairCandidates/toPairRowDTO (no change needed, they pass ctx.rankOpts which carries hedgeBookKeys): src/app/actions/get-opportunities.ts:105, src/db/memberPairState.ts:76
From src/domain/promos/reviewInput.ts: MarkPairDoneInputSchema = z.strictObject({ promoIdA, promoIdB, precision, expectedGuaranteedProfit: Money2dp, expectedStakeA: Money2dp, expectedStakeB: Money2dp })
From src/domain/promos/pairSnapshot.ts: PairRowSnapshotSchema, _pairRowShapeGuard (snapshot row must stay assignable to PairRowDTO), DonePairSnapshotSchema (version: literal 1), DonePairDTO, toDonePairDTO, buildPairSnapshot, isSamePairDisplay(expected {profit, stakeA, stakeB}, current)
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Exact 3-bet solver solveBoostBoostPairWithTopUp (pairMath.ts) + brute-force oracle tests</name>
  <files>src/domain/hedge/pairMath.ts, src/domain/hedge/pairMath.oracle.ts, src/domain/hedge/pairMath.topUp.test.ts</files>
  <behavior>
    - Owner case shape, whole AND cents: A = boost {baseOddsAmerican 154, boostPercent 50, maxStake 20, minOdds -200}, B = boost {base -172, boostPercent 30, maxStake 10, minOdds -200}, top-up on B's side at -172. Result guaranteedProfit equals the brute-force oracle optimum exactly, is greater than 5.18, and has topUp.side === "B" with topUp.leg.stake > 0.
    - Independent formula cross-check in the test (do not call solver internals): from the returned stakes, recompute payoutA = floorCents(promoPayoutRaw(sA, OA_boosted, ...)), payoutB likewise, payoutC = floorCents(sC * OC); assert netIfAWins = payoutA (+ payoutC if top-up on A) - total, netIfBWins = payoutB (+ payoutC if top-up on B) - total, guaranteedProfit = min of the two, and both >= guaranteedProfit.
    - Degenerate: when the top-up quote is null on both sides, or top-up never helps (equal caps / poor top-up odds), result deep-equals solveBoostBoostPair(a, b, precision) and has no topUp key. Run this over a seeded mulberry32 batch (like pairMath.test.ts) of random leg pairs.
    - Symmetric: swapping the roles (big-cap boost as B, top-up quote given on A's side) gives the same guaranteedProfit with topUp.side === "A".
    - Rounding: for random seeded cases at both precisions, both outcome nets >= guaranteedProfit, all stakes are multiples of the precision unit, boost stakes <= floored maxStake.
    - Oracle agreement: for random small seeded cases in whole precision (caps <= 25, top-up stake scanned 0..80), solver profit equals oracle profit (profit only, never stakes, per the existing Pitfall 1 rule). The random generator MUST include a share of cases where the top-up odds OC are better than the top-up-side boost's boosted odds OB (OC > OB), so the optimum that uses that boost at its unit minimum and puts the rest on C is exercised.
    - Cents never worse than whole: for the owner case and every seeded random case, run the solver at cents and at whole precision on the same inputs, plus a coarse whole-dollar grid scan (the oracle) on the same inputs; assert cents guaranteedProfit >= whole guaranteedProfit and cents guaranteedProfit >= oracle whole-dollar profit.
    - Null cases: either leg fails min odds -> null; no positive profit -> null.
  </behavior>
  <action>
    Add to pairMath.ts (per the quick-task description and CALC-07; existing exports and their outputs must stay unchanged, so existing pairMath.test.ts passes untouched):
    1. Export interface TopUpQuote { oddsAmerican: number }. Extend PairResult with an OPTIONAL field topUp?: { side: "A" | "B"; leg: PairLegResult }. Leave it absent on every 2-bet result so existing toEqual assertions keep passing. The top-up leg has priceSource "quote" and capBound null.
    2. Add a private solver for a top-up on B's side, solveTopUpOnB(legA, legB, oddsC, p). Leg A is a boost with payout PA(sa), leg B a boost with payout PB(sb), leg C an ordinary bet with payout PC(sc) = floorCents(sc * OC), where sc >= 0 has no cap. With total T = sa+sb+sc, profit = min(PA - T, PB + PC - T). Seeds: sa from stakeSeeds(legA); sb from stakeSeeds(legB) plus the 2-bet cross-seed inversePayout(legB, rawPayout(legA, sa)), plus sb at the unit minimum (one precision unit, never 0, because the boost must be used). The unit-minimum seed covers the case OC > OB, where the best answer uses boost B minimally and puts the rest of that side on C. Search windowAround for sa and sb (clamped [unit, max]). Do NOT anchor sc on a single seed value: for EACH (sa, sb) candidate visited in the windows, compute the balancing top-up stake sc* = max(0, ceilToUnit((PA(sa) - PB(sb)) / OC)) using the floored payouts PA/PB via memoPayout and LocalDecimal division, then score sc in {0, sc* - 1 unit, sc*, sc* + 1 unit} (dropping negatives, deduped). This keeps the balancing C stake tied to the actual sa/sb, so moving sa/sb within their windows cannot push the optimum outside the C search. Score with memoPayout and floorCents. Use beats() tie-breaks: higher profit, then lower total, then lower stake A. Keep it bounded (a fixed seed set times fixed windows times at most 4 sc values per (sa, sb), never a grid scan), matching the existing solver's style.
    3. Export solveBoostBoostPairWithTopUp(a, b, topUp: { onA: TopUpQuote | null; onB: TopUpQuote | null }, precision): PairResult | null.
       - Prepare legs with prepareBoost. Return null if either is null.
       - Candidate 1 is solveBoostBoostPairUnfiltered(a, b, precision), exactly as today.
       - Candidate 2 (onB) is solveTopUpOnB(A, B, OC_B).
       - Candidate 3 (onA) mirrors candidate 2: call solveTopUpOnB(B, A, OC_A), then swap the legs back so legA/netIfAWins still describe A, and set side "A".
       - Pick the highest guaranteedProfit. On a tie, prefer the no-top-up candidate (fewer bets), then lower totalStaked. If the winning candidate's top-up stake is 0, return candidate 1's object unchanged (C=0 reduces to today's pair).
       - Prune before solving: skip a top-up side unless 1/O_promo + 1/max(O_otherBoost, OC) < 1. Return null if no candidate has guaranteedProfit > 0.
       - totalStaked includes sc. ROI uses roiOf(profit, total).
       - Use decimal.js via LocalDecimal only, with no native number money math.
    4. In pairMath.oracle.ts, add bruteForceTopUpOnB(...). It scans whole-dollar sa in [1, maxA], sb in [1, maxB] and sc in [0, scMax], using promoPayoutRaw + floorCents in integer cents, and returns the best profit. sb starts at 1 (the whole-dollar unit minimum), matching the solver's unit-minimum seed, so the oracle and solver search the same space. Follow the existing oracle style, with no production imports beyond profitBoost. The test's random case generator draws OC both below and above OB (see the oracle-agreement bullet).
    5. Write pairMath.topUp.test.ts covering every behavior bullet. Use the vitest include pattern of existing *.test.ts. The owner case uses whole and cents precision. For cents, the oracle cross-check is the independent recompute formula plus a local +/- 2-cent neighborhood scan around the returned stakes that finds no better profit, plus the "cents never worse than whole" assertion against both the whole-precision solver and the whole-dollar oracle grid scan on the same inputs.
  </action>
  <verify>
    <automated>npx vitest run src/domain/hedge/</automated>
  </verify>
  <done>All new tests pass. The existing pairMath.test.ts passes unmodified. The owner case beats 5.18 at both precisions, and the oracle agrees with the solver.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Top-up-aware pair discovery in pairPromos.ts (book choice, relaxed prune, valid bound, D-08 gate)</name>
  <files>src/domain/promos/rankPromoHedges.ts, src/domain/promos/pairPromos.ts, src/domain/promos/pairPromos.test.ts</files>
  <behavior>
    - Owner fixture: two boost promos at draftkings/fanduel (DK 50% cap 20 on away +154, FD 30% cap 10 on home -172, min -200). Hedge books = member books, plus a third hedge book quoting home -165. Singles come from singleProfitMap(rankPromoHedges(...)). findPairCandidates returns exactly one boost_boost candidate with result.topUp.side === "B", topUp book = the best home quote among opts.hedgeBookKeys (the -165 book), and guaranteedProfit > singles sum, with gain = profit - singleSum.
    - Same fixture with no hedge-book quote on either side (hedgeBookKeys empty of quoting books) -> no candidate. This is today's behavior: 3.27 < 5.18 is dropped by D-08.
    - D-08: a fixture where the top-up pair profit is <= singles sum -> no candidate.
    - Bound safety: for every seeded random boost_boost fixture where solveBoostBoostPairWithTopUp(...) profit > singleSum, findPairCandidates includes it (the bound/prune never drops it).
    - Every existing pairPromos.test.ts case still passes unchanged.
  </behavior>
  <action>
    1. In rankPromoHedges.ts, export the existing bestHedgeQuote. This changes visibility only, not logic.
    2. In pairPromos.ts, extend PairCandidate with an OPTIONAL field topUp?: { side: "A" | "B"; selection: ResolvedSelection; bookKey: string; oddsAmerican: number } | null. It must be optional (the ?) so existing PairCandidate object literals and test fixtures that omit it still compile under tsc; consumers read it as c.topUp ?? null. selection is the A or B leg's own selection, because the top-up bets that leg's side. Set it to null for boost_bonus and for pairs without a top-up.
    3. Top-up book rule (planner's choice, matching the existing single-hedge rule): use the best quote via bestHedgeQuote over opts.hedgeBookKeys. For B's side use legB.selection.promoSideQuotes, and for A's side use legA.selection.promoSideQuotes. Any hedge book is allowed, including A's or B's own book, the same as singles hedging today. Compute this once per (legA, legB) inside the loop.
    4. Prune at ~271 for boost_boost: skip only when 1/OA + 1/OB >= 1 AND neither top-up side can help. A side can help when 1/O_promo + 1/max(O_other, OC) < 1, with OC as the decimal of that side's top-up quote.
    5. Bound at ~273-281 for boost_boost. Guaranteed profit is at most the profit if a given side's promo wins. That is at most capA*(OA-1) when the top-up sits on B's side, at most capB*(OB-1) when it sits on A's side, and the min of the two with no top-up. So use bound = max of the applicable candidates: min(...) as today, plus maxA*(OA-1) if a B-side top-up quote exists, plus maxB*(OB-1) if an A-side quote exists. Add a code comment with this one-line proof. Leave the boost_bonus bound unchanged.
    6. For boost_boost, call solveBoostBoostPairWithTopUp(boostA, legB.boost!, { onA, onB }, opts.precision). Keep the boost_bonus call as is. Keep the RangeError handling and the D-08 strict gate line exactly. Fill candidate.topUp from result.topUp?.side plus the chosen quote. isBetterCandidate, selectPairs and sortPairs stay unchanged.
    7. Add the behavior tests to pairPromos.test.ts, reusing that file's existing promo/selection fixture builders.
  </action>
  <verify>
    <automated>npx vitest run src/domain/promos/pairPromos.test.ts src/domain/hedge/ && npx tsc --noEmit</automated>
  </verify>
  <done>The owner fixture produces a top-up pair that beats singles. Existing pair tests pass unchanged. The bound-safety property test passes. tsc is clean (errors in the files Task 3 owns, such as DTO consumers, are allowed only if Task 3 fixes them in the same run before the final verify).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Third leg through DTO, snapshot (backward compatible), mark-pair-done, PairCard/PairDetails/DonePairRow</name>
  <files>src/domain/promos/pairRowDto.ts, src/domain/promos/pairRowDto.test.ts, src/domain/promos/pairSnapshot.ts, src/domain/promos/pairSnapshot.test.ts, src/domain/promos/reviewInput.ts, src/app/actions/mark-pair-done.ts, src/components/opportunities/MarkPairDoneButton.tsx, src/components/opportunities/PairCard.tsx, src/components/opportunities/PairDetails.tsx, src/components/promos/DonePairRow.tsx</files>
  <behavior>
    - toPairRowDTO on a top-up candidate sets legC = { side, bookKey, bookName, selectionLabel, oddsAmerican, stake, payout, note }. Money values are 2-dp strings. totalStaked includes the C stake. worstCase still compares netIfAWins/netIfBWins. A 2-bet candidate gives legC null.
    - buildPairSnapshot copies legC. The snapshot parses with DonePairSnapshotSchema. toDonePairDTO exposes legC.
    - An OLD stored 2-leg snapshot JSON (a literal fixture with no legC key, version 1) still parses, and toDonePairDTO gives legC null.
    - isSamePairDisplay: with a top-up, a matching stakeC gives true and a different or missing stakeC gives false. Without a top-up, an expected stakeC that is absent or "0.00" gives true (existing tests unchanged).
    - MarkPairDoneInputSchema accepts an optional expectedStakeC (Money2dp) and still rejects unknown keys.
  </behavior>
  <action>
    1. In pairRowDto.ts, add an exported PairTopUpLegDTO { side: "A" | "B"; bookKey; bookName; selectionLabel; oddsAmerican; stake; payout; note: string }. Use note = "Ordinary bet (no promo): tops up the {side's selectionLabel} side so the bigger boost can use its full cap." Add legC?: PairTopUpLegDTO | null to PairRowDTO. Build it in toPairRowDTO from c.topUp ?? null and c.result.topUp (legC is null when either is absent). The selectionLabel uses c.topUp.selection (sideSelection/sidePoint), the same as toLegDTO. The book name comes from bookNames. Leave pairTypeLabel/kind unchanged ("Boost + Boost"). Do not touch rowKey.
    2. In pairSnapshot.ts, add PairTopUpSnapshotSchema mirroring PairTopUpLegDTO. In PairRowSnapshotSchema add legC: PairTopUpSnapshotSchema.nullable().optional(). Keep version literal 1, since the optional field keeps old snapshots valid with no migration. _pairRowShapeGuard must still compile. Add legC: DonePairLegC | null to DonePairDTO with fields bookName, selectionLabel, oddsAmerican, stake, payout, side, and map it in toDonePairDTO (r.legC ?? null). buildPairSnapshot copies legC (spread a copy when present). isSamePairDisplay takes expected.stakeC?: string. It compares Decimal(expected.stakeC ?? "0") with Decimal(current.legC?.stake ?? "0").
    3. In reviewInput.ts, add expectedStakeC: Money2dp.optional() to MarkPairDoneInputSchema. mark-pair-done.ts passes stakeC: parsed.data.expectedStakeC into the expected object. MarkPairDoneButton gets an optional expectedStakeC prop and sends it. PairCard passes row.legC?.stake.
    4. UI. Use React text only (no dangerouslySetInnerHTML) and the existing formatUsd/formatAmerican and Badge styles.
       - PairCard: render a third compact line under the two LegLines when row.legC exists. Show the book name, an outline Badge "Ordinary bet", the selection label with odds, and "- stake $X".
       - PairDetails: add Step 3 for legC. Include legC.note in the notes list. In the outcome table, add a row for the top-up bet under its side so the stake and payout are visible, and keep the net columns from row.netIfAWins/netIfBWins.
       - DonePairRow: render a third LegLine-like line when pair.legC exists.
    5. Add tests to pairRowDto.test.ts and pairSnapshot.test.ts for every behavior bullet. Include the literal old-snapshot fixture.
  </action>
  <verify>
    <automated>npx vitest run && npx tsc --noEmit && npm run lint && npx next build</automated>
  </verify>
  <done>The full suite, tsc, lint and next build all pass. Top-up pairs show three bets on the card, in the details and in the Done tab. Old snapshots parse. Mark-done checks the third stake.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client -> markPairDoneAction | expectedStakeC is client-supplied |
| DB jsonb -> DonePairSnapshotSchema | stored snapshots, old and new shapes |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fxf-01 | Tampering | mark-pair-done expectedStakeC | mitigate | Strict zod schema (Money2dp, optional). It is only compared against the server recompute and never stored. The snapshot is built from the server row. |
| T-fxf-02 | Tampering | snapshot parse | mitigate | legC is optional+nullable in zod, so old rows parse and malformed legC fails safeParse as today |
| T-fxf-03 | Information disclosure | legC book/odds | accept | Same data class as the existing legs, scoped to the member's own hedge books |
</threat_model>

<verification>
npx vitest run; npx tsc --noEmit; npm run lint; npx next build. Grep check: `grep -v '^\s*//' src/domain/promos/pairPromos.ts | grep -c "D-08 strict gate"` returns 1. No migrations, no live DB writes, no Odds API calls.
</verification>

<success_criteria>
- Owner case shape yields a 3-bet pair > $5.18 (oracle-verified) and is shown
- No-top-up results identical to before; all pre-existing tests unchanged and green
- Third leg visible on PairCard, PairDetails, Done tab; recorded in snapshot; old snapshots parse
</success_criteria>

<output>
Create `.planning/quick/261003-fxf-three-bet-boost-pairs-with-ordinary-top-/261003-fxf-SUMMARY.md` when done
</output>
