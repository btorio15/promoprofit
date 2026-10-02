---
phase: quick-261002-dqn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/db/promoReview.ts
  - src/db/promoReview.test.ts
  - src/app/actions/flag-promo-match.ts
  - src/app/actions/promo-review.test.ts
  - src/domain/promos/lifecycle.test.ts
  - src/db/promos.ts
  - src/db/promos.test.ts
  - src/domain/promos/dto.ts
  - src/domain/promos/promoRowDto.ts
  - src/components/promos/PromoRow.tsx
  - src/components/promos/UnprofitablePromoRow.tsx
  - src/app/actions/get-promos.test.ts
  - src/app/actions/get-opportunities.test.ts
  - src/db/memberPairState.test.ts
  - src/db/promoObservations.test.ts
autonomous: true
requirements: [quick-261002-dqn]

must_haves:
  truths:
    - "Every active scraped promo row (auto-matched OR human-confirmed/corrected/classified) shows the Flag button on the Promos tab, the Opportunities tab promo rows, and unprofitable promo rows"
    - "Member-added promos never show the Flag button and the server refuses to flag them"
    - "Flagging a human-confirmed scraped promo moves it to Needs a look (pending_review/match) with its old scope as the suggestion, out of hedge math"
    - "The 'Auto-matched' badge still shows only on auto-matched rows"
    - "A later scrape keeps a flagged (formerly human-confirmed) row in review"
  artifacts:
    - path: "src/db/promoReview.ts"
      provides: "applyFlag gated on status='active' AND added_by_user_id IS NULL (no autoMatched requirement); getActivePromoForFlag returns scraped flag"
      contains: "flagUpdateWhere"
    - path: "src/app/actions/flag-promo-match.ts"
      provides: "flag action accepts any active scraped promo, rejects member-added"
    - path: "src/domain/promos/dto.ts"
      provides: "flaggable?: boolean on PromoRowDTO and UnprofitablePromoRowDTO"
      contains: "flaggable"
  key_links:
    - from: "src/components/promos/PromoRow.tsx"
      to: "FlagMatchButton"
      via: "row.flaggable condition (independent of row.autoMatched)"
      pattern: "row\\.flaggable"
    - from: "src/db/promos.ts mapActivePromoRow"
      to: "src/domain/promos/promoRowDto.ts"
      via: "ActivePromo.scraped -> DTO flaggable"
      pattern: "flaggable: promo\\.scraped === true"
---

<objective>
Let members flag ANY active scraped promo as a wrong match, not only auto-matched ones. Today the Flag button disappears once a promo has been confirmed/corrected/classified out of review (owner report 2026-10-02), because the UI, the server action, and the DB write all require `autoMatched = true`.

Purpose: a human-confirmed match can be wrong too; members need the same safety net to pull it back into "Needs a look".
Output: server accepts flags on active scraped promos (race-safe single UPDATE kept), row DTOs carry a `flaggable` boolean, UI shows Flag on `flaggable` rows, tests cover all of it.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src/app/actions/flag-promo-match.ts
@src/db/promoReview.ts
@src/components/promos/PromoRow.tsx
@src/components/promos/UnprofitablePromoRow.tsx

<interfaces>
Current code (extracted, as of planning):

src/db/promoReview.ts (~lines 596-676):
- `export function activePromoForFlagWhere(id: number, viewerUserId: number)` = and(eq(promos.id, id), eq(promos.status, "active"), promoVisibilityCondition(viewerUserId)). KEEP unchanged (WR-05 visibility).
- `export async function getActivePromoForFlag(id, viewerUserId): Promise<{ id: number; autoMatched: boolean; guess: ScopeGuess } | null>` -- selects autoMatched + scope columns, builds guess via activeScopeGuessFromRow (works for any active scope, human or auto).
- `export async function applyFlag({ promoId, userId, guess, now }): Promise<boolean>` -- single UPDATE setting status pending_review, reviewReason match, autoMatchBlocked true, autoMatched false, bestGuess guess, flaggedByUserId, reviewedAt, all scope/pin columns null; `.where(and(eq(promos.id, promoId), eq(promos.status, "active"), eq(promos.autoMatched, true)))`.
- `isNull` must be imported from drizzle-orm if not already.

src/app/actions/flag-promo-match.ts: requireUser first -> PromoIdInputSchema -> getActivePromoForFlag(promoId, user.userId) (null -> CONFLICT "Someone else already handled this promo.") -> `if (!row.autoMatched) return { status: "conflict", message: "Only auto-matched promos can be flagged." }` -> applyFlag -> revalidatePath("/").

src/db/promos.ts:
- `interface ActivePromo extends RankablePromo { ...; autoMatched: boolean; attribution; addedByYou: boolean; promoMaxStake?; capOverride? }`
- `export function mapActivePromoRow(row: ActivePromoRow, viewerUserId?: number): ActivePromo | null` -- row has `addedByUserId: number | null`; returns `addedByYou: viewerUserId !== undefined && row.addedByUserId === viewerUserId`.
- getActivePromos only returns status='active' rows (activePromoWhere).

src/domain/promos/promoRowDto.ts:
- `interface PresentablePromo extends RankablePromo { ...; autoMatched: boolean; addedByYou?: boolean; ... }`
- `toPromoRowDTO` (~line 57) sets `autoMatched: promo.autoMatched, addedByYou: promo.addedByYou === true`.
- `toUnprofitablePromoRowDTO` (~line 192) sets the same two fields.

src/domain/promos/dto.ts: PromoRowDTO (autoMatched: boolean; addedByYou?: boolean -- optional because frozen Done snapshots lack it), UnprofitablePromoRowDTO (autoMatched: boolean; addedByYou: boolean; yourCap optional because Done snapshots lack it).

src/domain/promos/lifecycle.ts: `decideScrapedWrite(existing: ExistingPromoState | null, parsed, match, now)`; ExistingPromoState { status, reviewReason, autoMatchBlocked, humanScope, humanPinned, promoType, maxStake, bonusAmount, unparsedCapFields, capsEnteredByMember }. Branch `pending_review` + `reviewReason "match"` + `autoMatchBlocked` -> stays pending_review/match (touch if capsEnteredByMember). Existing test at lifecycle.test.ts ~line 249 uses `baseExisting({...})`, `baseParsed()`, `MATCHED_RESULT`, `NOW`.

Existing tests:
- src/app/actions/promo-review.test.ts ~940-1055: flagPromoMatch describe block; mocks `mockGetActivePromoForFlag.mockResolvedValue({ id: 5, autoMatched: true, guess })`; includes test "returns conflict when the active promo was human-confirmed (autoMatched false)" -- this test is now WRONG and must be rewritten.
- src/db/promoReview.test.ts: compiles `activePromoForFlagWhere(5, 7)` through a drizzle neon-http db with `.toSQL()` and asserts SQL substrings/params. Use the same technique for the new update WHERE.
- src/db/promos.test.ts ~111: `describe("mapActivePromoRow")` with `makeRow(overrides)` (addedByUserId: null default).
- ActivePromo fixtures (need the new required field): get-promos.test.ts (`activeBoostPromo`, `activeBonusPromo`), get-opportunities.test.ts, memberPairState.test.ts, promoObservations.test.ts.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Server -- flag any active scraped promo (action + applyFlag WHERE) and confirm scraper keeps it in review</name>
  <files>src/db/promoReview.ts, src/db/promoReview.test.ts, src/app/actions/flag-promo-match.ts, src/app/actions/promo-review.test.ts, src/domain/promos/lifecycle.test.ts</files>
  <behavior>
    - flagPromoMatch with getActivePromoForFlag resolving `{ id: 5, scraped: true, guess }` (a human-confirmed scraped promo -- no autoMatched field at all) returns `{ status: "ok" }`, calls applyFlag with `{ promoId: 5, userId: 7, guess, now: any Date }`, revalidates "/".
    - flagPromoMatch with `{ id: 5, scraped: false, guess }` (member-added, viewer's own) returns `{ status: "conflict", message: "Only scraped promos can be flagged." }` and never calls applyFlag.
    - flagPromoMatch with getActivePromoForFlag resolving null (not active / not visible) returns the existing "Someone else already handled this promo." conflict, applyFlag not called (existing test, keep).
    - applyFlag returning false still yields the CONFLICT response (existing test, update fixture shape).
    - New exported `flagUpdateWhere(promoId)` compiled via `.toSQL()` contains `"id" = $`, `"status" = $`, `"added_by_user_id" is null`, and does NOT contain `"auto_matched"`; params include 5 and "active".
    - decideScrapedWrite on an existing row `{ status: "pending_review", reviewReason: "match", autoMatchBlocked: true, humanScope: <a non-null event ScopeGuess> }` with MATCHED_RESULT returns `{ kind: "refresh", status: "pending_review", reviewReason: "match", unparsedCapFields: [] }` (flagged formerly-confirmed row stays in review); and with `capsEnteredByMember: true` returns `{ kind: "touch" }`.
  </behavior>
  <action>
    In src/db/promoReview.ts:
    - Add and export `flagUpdateWhere(promoId: number)` returning `and(eq(promos.id, promoId), eq(promos.status, "active"), isNull(promos.addedByUserId))` (import `isNull` from drizzle-orm if missing). Use it as applyFlag's `.where(...)`, replacing the `eq(promos.autoMatched, true)` condition. Keep everything in applyFlag's `.set({...})` exactly as is (status pending_review, reviewReason match, autoMatchBlocked true, autoMatched false, bestGuess = guess, flaggedByUserId, reviewedAt, all scope/pin columns nulled) -- the single conditional UPDATE remains the race guard: a concurrent flag/confirm/dismiss/expire still affects at most one caller because only an active row matches, and a member-added row can never match.
    - getActivePromoForFlag: replace the `autoMatched` select field and return field with `scraped: boolean`, derived from selecting `addedByUserId: promos.addedByUserId` and returning `scraped: row.addedByUserId === null`. Return type becomes `{ id: number; scraped: boolean; guess: ScopeGuess } | null`. Keep `activePromoForFlagWhere` unchanged (promoVisibilityCondition: a member can only flag what they can see). Guess still comes from activeScopeGuessFromRow, which already handles human-set scopes, so the flagged row lands in "Needs a look" with its old match as the suggestion.
    - Update the JSDoc on getActivePromoForFlag / applyFlag to say "active scraped promo (auto-matched or human-confirmed/corrected/classified)" and "status = 'active' AND added_by_user_id IS NULL" instead of auto_matched = true.

    In src/app/actions/flag-promo-match.ts: replace the `!row.autoMatched` guard with `if (!row.scraped) return { status: "conflict", message: "Only scraped promos can be flagged." };` (member-added promos have Edit/Expire/Delete instead). requireUser() stays the literal first statement. Update the doc comment (T-03-10-02 now reads status='active' AND added_by_user_id IS NULL).

    Tests:
    - src/app/actions/promo-review.test.ts flagPromoMatch block: change every `{ id: 5, autoMatched: true, guess }` mock to `{ id: 5, scraped: true, guess }`. Replace the "returns conflict when the active promo was human-confirmed (autoMatched false)" test with (a) "flags an active human-confirmed scraped promo" (ok + applyFlag called) and (b) "returns conflict for a member-added promo" (scraped: false -> "Only scraped promos can be flagged.", applyFlag not called). Keep the null and applyFlag-false tests.
    - src/db/promoReview.test.ts: add a `describe("flagUpdateWhere")` using the same drizzle neon-http `.toSQL()` technique (e.g. `db.update(promos).set({ status: "pending_review" }).where(flagUpdateWhere(5)).toSQL()` or a select with the where) asserting the substrings listed in behavior, and `expect(sql).not.toContain('"auto_matched"')`.
    - src/domain/promos/lifecycle.test.ts in `describe("decideScrapedWrite")`: add the two cases from behavior (flagged formerly human-confirmed row with non-null humanScope stays pending_review/match; with capsEnteredByMember true -> touch). No lifecycle.ts change is expected; if a test fails, stop and report rather than changing scraper logic.
  </action>
  <verify>
    <automated>npx vitest run src/app/actions/promo-review.test.ts src/db/promoReview.test.ts src/domain/promos/lifecycle.test.ts</automated>
  </verify>
  <done>Action flags human-confirmed scraped promos, rejects member-added with "Only scraped promos can be flagged.", rejects non-active via existing conflict; applyFlag WHERE is status active + added_by_user_id IS NULL with no auto_matched condition; scraper test proves a flagged human-confirmed row stays in review; the three test files pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Row DTO `flaggable` + show Flag on every flaggable row</name>
  <files>src/db/promos.ts, src/db/promos.test.ts, src/domain/promos/dto.ts, src/domain/promos/promoRowDto.ts, src/components/promos/PromoRow.tsx, src/components/promos/UnprofitablePromoRow.tsx, src/app/actions/get-promos.test.ts, src/app/actions/get-opportunities.test.ts, src/db/memberPairState.test.ts, src/db/promoObservations.test.ts</files>
  <behavior>
    - mapActivePromoRow(makeRow({ addedByUserId: null }), 7).scraped === true; mapActivePromoRow(makeRow({ addedByUserId: 7 }), 7).scraped === false; mapActivePromoRow(makeRow({ addedByUserId: 9 }), undefined).scraped === false.
    - getPromos with activeBoostPromo({ scraped: true, autoMatched: false }) (human-confirmed scraped) -> rows[0].flaggable === true and rows[0].autoMatched === false.
    - getPromos with activeBoostPromo({ scraped: false, addedByYou: true }) -> rows[0].flaggable === false.
    - Same two assertions for unprofitableRows[0].flaggable (use the existing fixture pattern that produces an unprofitable row, as in the existing addedByYou test near get-promos.test.ts line 381-395).
  </behavior>
  <action>
    - src/db/promos.ts: add `scraped: boolean` to ActivePromo with a doc comment ("True when the promo came from the scraper (added_by_user_id IS NULL) -- the only promos a member may flag; quick-261002-dqn"). In mapActivePromoRow return `scraped: row.addedByUserId === null`. Every ActivePromo is already active (activePromoWhere), so scraped alone means "active scraped".
    - src/domain/promos/promoRowDto.ts: add `scraped?: boolean` to PresentablePromo. In both toPromoRowDTO and toUnprofitablePromoRowDTO add `flaggable: promo.scraped === true` next to autoMatched. Leave `autoMatched: promo.autoMatched` untouched (badge still needs it).
    - src/domain/promos/dto.ts: add `flaggable?: boolean` to PromoRowDTO and UnprofitablePromoRowDTO with a doc comment: "quick-261002-dqn: true for active scraped promos (auto-matched or human-confirmed) -- drives the Flag button independently of autoMatched. Optional because frozen Done snapshots lack it (absent = not flaggable)." Do not touch src/domain/promos/doneSnapshot.ts (snapshots are not active, so no Flag there).
    - src/components/promos/PromoRow.tsx and UnprofitablePromoRow.tsx: split the current `{row.autoMatched ? (<>Badge + FlagMatchButton</>) : null}` into `{row.autoMatched ? <Badge variant="outline">Auto-matched</Badge> : null}` and `{row.flaggable ? <FlagMatchButton promoId={row.promoId} onChanged={onChanged} /> : null}`, preserving element order (badge, then flag, then MarkUsedButton). Update the PromoRow comment near line 42 that says the flag button appears "only on autoMatched rows" to say "on flaggable (active scraped) rows".
    - Fixtures: add `scraped: true` to the ActivePromo fixture builders in get-promos.test.ts (activeBoostPromo, activeBonusPromo), get-opportunities.test.ts, memberPairState.test.ts, promoObservations.test.ts (run `npx tsc --noEmit` to find every place the new required field is missing; set `scraped: false` wherever a fixture also sets addedByYou: true). Add the tests from behavior to src/db/promos.test.ts (`describe("mapActivePromoRow")`) and src/app/actions/get-promos.test.ts.
  </action>
  <verify>
    <automated>npx vitest run && npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>PromoRowDTO/UnprofitablePromoRowDTO carry flaggable (true for scraped, false for member-added); PromoRow and UnprofitablePromoRow render FlagMatchButton on row.flaggable and the Auto-matched badge only on row.autoMatched; full vitest suite, tsc and lint pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> flagPromoMatch server action | untrusted promoId from any logged-in member |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-dqn-01 | Spoofing | flagPromoMatch | mitigate | requireUser() remains the literal first statement; strict PromoIdInputSchema (no userId field) unchanged |
| T-dqn-02 | Information disclosure | getActivePromoForFlag | mitigate | activePromoForFlagWhere (promoVisibilityCondition) unchanged, so another member's added promo looks like an unknown id |
| T-dqn-03 | Tampering | applyFlag | mitigate | single conditional UPDATE gated on status='active' AND added_by_user_id IS NULL (flagUpdateWhere) -- member-added rows can never be flagged even if the action guard were bypassed; concurrent writers affect at most one caller |
| T-dqn-04 | Tampering | scraper re-activation | mitigate | autoMatchBlocked=true kept in applyFlag; lifecycle test proves decideScrapedWrite keeps a flagged formerly-confirmed row in pending_review/match |
| T-dqn-05 | Denial of service | any member flags confirmed promos | accept | private small group; flagging is reversible via Confirm in "Needs a look" and records flaggedByUserId |
</threat_model>

<verification>
- `npx vitest run` passes (whole suite)
- `npx tsc --noEmit` clean
- `npm run lint` clean
- `grep -n "eq(promos.autoMatched, true)" src/db/promoReview.ts` returns nothing
- `grep -n "Only auto-matched promos" src` returns nothing
- No migrations created, no live-DB writes
</verification>

<success_criteria>
- A human-confirmed/corrected/classified active scraped promo shows Flag and can be flagged back into "Needs a look" with its old scope as the suggestion
- Member-added promos never show Flag and the server refuses them
- Auto-matched badge unchanged
</success_criteria>

<output>
Create `.planning/quick/261002-dqn-allow-flagging-any-active-scraped-promo/261002-dqn-SUMMARY.md` when done
</output>
