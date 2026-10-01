---
phase: quick-261001-dhn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/db/schema.ts
  - drizzle/0011_user_promo_caps.sql
  - drizzle/meta/_journal.json
  - drizzle/meta/0011_snapshot.json
  - src/domain/promos/yourCap.ts
  - src/domain/promos/yourCap.test.ts
  - src/db/promoCaps.ts
  - src/db/promoCaps.test.ts
  - src/db/promos.ts
  - src/db/promoObservations.ts
  - src/db/promoObservations.test.ts
  - src/domain/promos/promoRowDto.ts
  - src/domain/promos/dto.ts
  - src/domain/promos/rankPromoHedges.test.ts
  - src/ingestion/promos/boundary.test.ts
  - src/app/actions/set-promo-cap.ts
  - src/app/actions/set-promo-cap.test.ts
  - src/components/promos/YourCapField.tsx
  - src/components/promos/PromoRow.tsx
  - src/components/promos/UnprofitablePromoRow.tsx
  - src/components/promos/PromosScreen.tsx
autonomous: false
requirements: [QUICK-261001-dhn]

must_haves:
  truths:
    - "A member can type their own max stake into a 'Your cap' field on a profit-boost row in the Promos tab, and the row's stakes and guaranteed profit recompute in place right after save (no confirm dialog, no full page reload)"
    - "A member can clear their cap and the row goes back to the promo's own max stake"
    - "One member's cap never changes another member's numbers, and never changes the shared group profit observations"
    - "The member's cap is used everywhere their rankings are computed: Promos tab, Opportunities feed, promo pairs, league-wide alt-spread picking, and the mark-done snapshot"
    - "Scrapes never overwrite or delete a member's cap (separate table the scraper never references)"
    - "If the new table has not been created yet, the Promos and Opportunities feeds still load (treated as no caps) and saving a cap shows a plain message instead of crashing"
    - "The server rejects: no session, a promo the member cannot see, a non-boost promo, and zero/negative/over-max/more-than-2-decimal/non-numeric values"
  artifacts:
    - path: "src/db/schema.ts"
      provides: "userPromoCaps table (user_id, promo_id, max_stake numeric(10,2), updated_at), PK (user_id, promo_id), both FKs ON DELETE cascade"
      contains: "user_promo_caps"
    - path: "drizzle/0011_user_promo_caps.sql"
      provides: "Additive migration: CREATE TABLE + FK constraints only"
      contains: "CREATE TABLE \"user_promo_caps\""
    - path: "src/domain/promos/yourCap.ts"
      provides: "SetPromoCapInputSchema, YOUR_CAP_MAX, resolveEffectiveMaxStake, applyMemberCaps, stripMemberCaps"
      exports: ["SetPromoCapInputSchema", "YOUR_CAP_MAX", "resolveEffectiveMaxStake", "applyMemberCaps", "stripMemberCaps"]
    - path: "src/db/promoCaps.ts"
      provides: "getMemberPromoCaps (degrades to empty map when table missing), getCapEditablePromo, upsertMemberPromoCap, deleteMemberPromoCap, isUndefinedTableError"
    - path: "src/app/actions/set-promo-cap.ts"
      provides: "setPromoCapAction server action"
      exports: ["setPromoCapAction"]
    - path: "src/components/promos/YourCapField.tsx"
      provides: "Inline 'Your cap' input with Save and 'Use book's cap' (clear), calls the action through safeAction"
  key_links:
    - from: "src/db/promos.ts getActivePromos"
      to: "src/db/promoCaps.ts getMemberPromoCaps"
      via: "called only when viewerUserId is defined, results applied with applyMemberCaps"
      pattern: "getMemberPromoCaps\\(viewerUserId"
    - from: "src/db/promoObservations.ts recordCurrentProfitObservations"
      to: "src/domain/promos/yourCap.ts stripMemberCaps"
      via: "group-level observations always ranked at the promo's own cap"
      pattern: "stripMemberCaps\\("
    - from: "src/components/promos/YourCapField.tsx"
      to: "src/app/actions/set-promo-cap.ts"
      via: "safeAction(() => setPromoCapAction({ promoId, maxStake }), ...) then onChanged() refetch"
      pattern: "safeAction\\(\\s*\\(\\)\\s*=>\\s*setPromoCapAction"
    - from: "src/domain/promos/promoRowDto.ts"
      to: "PromoRowDTO.yourCap / UnprofitablePromoRowDTO.yourCap"
      via: "toPromoRowDTO / toUnprofitablePromoRowDTO emit { promoCap, override } for profit_boost rows"
      pattern: "yourCap"
---

<objective>
Add a per-member "Your cap" max-stake override for profit boosts. A member types their own account's max stake on a Promos-tab boost row; it saves immediately and that member's stakes and guaranteed profit recompute everywhere their rankings are computed. Other members and the shared group profit observations are never affected. Scrapes never touch it. Storage is a new additive table. The migration file is generated but applied to live Neon only by the owner, at the final blocking checkpoint.

Purpose: the owner's DraftKings account allows $20 on promo #20 while the public page says $25. Today the only fix is a shared DB edit, which would also change everyone else's numbers.
Output: the user_promo_caps table and migration 0011, the effective-cap domain helpers, a cap-aware getActivePromos, setPromoCapAction, the YourCapField UI, and tests.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/quick/261001-dhn-per-member-max-stake-cap-override-for-pr/261001-dhn-CONTEXT.md
@.planning/phases/05-group-added-promos/05-SECURITY.md

<design_notes>
How maxStake flows today (verified by reading the code):
- `getActivePromos(now, viewerUserId?)` in src/db/promos.ts is the single source of `ActivePromo.maxStake` (from `promos.max_stake` through `mapActivePromoRow`).
- Every member-scoped ranking calls it WITH the session user id: get-promos.ts:114 (Promos tab), feedContext.ts:72 `loadMemberFeedContext` (Opportunities feed, plus pairs through memberPairState.ts, which reads ctx.feedPromos), memberPromoState.ts:43 (mark-done recompute and snapshot `terms.maxStake`), refresh-spreads-totals.ts:51 (league-wide alt-spread picking), get-add-promo-options.ts:40 (duplicate hints only, which never read maxStake).
- `rankPromoHedges` (rankPromoHedges.ts:149/173) and `pairPromos` (pairPromos.ts:119/128) read `promo.maxStake` directly. `capNoteFor` in promoRowDto.ts renders it.
- `recordCurrentProfitObservations` (src/db/promoObservations.ts) writes GROUP-level rows keyed (promo_id, denver_date) with a GREATEST upsert. get-promos.ts passes it the VIEWER's activePromos. If a member's cap leaked in there, a higher cap would raise the shared number every member sees. It must always rank at the promo's own cap.

Chosen design (one choke point, so no caller can forget):
1. When `viewerUserId` is defined, `getActivePromos` loads that viewer's caps (`getMemberPromoCaps(viewerUserId)`, run in parallel with the main query) and returns `applyMemberCaps(mapped, caps)`. For profit_boost promos with an override, `maxStake` becomes the override. Every promo also carries `promoMaxStake` (the promo's own cap) and `capOverride` (the override or null). Without a viewer, nothing is applied. As a result Promos, Opportunities, pairs, alt-spread picking and mark-done snapshots all pick up the member's cap with no change to those callers. All existing tests that `vi.mock("@/db/promos")` stay unaffected.
2. `recordCurrentProfitObservations` calls `stripMemberCaps(activePromos)` before ranking. This restores `maxStake = promoMaxStake` wherever `promoMaxStake !== undefined`, so observations stay group-level. The member's own "profit available today/week/month" summary therefore stays on the promo's own cap, as it is built from shared observations. The live feed total (`totalProfit`, summed from rows) does reflect the member's cap.
3. Degrade-safe: `getMemberPromoCaps` catches ONLY the Postgres "undefined_table" error (SQLSTATE `42P01`, checked on the error and on its `.cause` chain, since drizzle 0.45 wraps driver errors in a `cause`, with a fallback message match on `relation "user_promo_caps" does not exist`). In that case it logs `console.warn` once and returns an empty Map. Any other error is rethrown, like every other feed query. The write path maps the same error to a `{ status: "unavailable" }` response.
4. Added promos (Claude's discretion, kept simple): the same inline field works on the member's own added boosts too. It is the same table and code path, with no routing to the edit form. The edit form still edits the promo's own cap via getOwnActiveAddedPromo, which is untouched.
5. Bound (Claude's discretion): YOUR_CAP_MAX = "10000.00". Valid input is a string matching the existing `MONEY_PATTERN` (/^\d{1,6}(\.\d{1,2})?$/, exported from src/domain/promos/reviewInput.ts), compared with decimal.js only: > 0 and <= 10000. It is stored normalized with `new Decimal(v).toFixed(2)`. Lower OR higher than the promo's cap are both allowed (CONTEXT decision).
6. Known, accepted behavior: the override is keyed to promo id. A scrape that re-upserts the same dedupe_key keeps the id, so the override survives. If the book materially changes the promo and the scraper files it as a new row, the member re-enters their cap.
</design_notes>

<interfaces>
From src/db/promos.ts (existing; extend ActivePromo with two OPTIONAL fields so existing test fixtures still type-check):
- `export interface ActivePromo extends RankablePromo { finePrintNote; claimHint; scopeLabel; autoMatched; attribution; addedByYou: boolean }`. ADD `promoMaxStake?: string | null; capOverride?: string | null;`
- `export function promoVisibilityCondition(viewerUserId?: number): SQL`
- `export function activePromoWhere(now: Date, viewerUserId?: number): SQL`
- `export async function getActivePromos(now: Date, viewerUserId?: number): Promise<ActivePromo[]>`

From src/domain/promos/rankPromoHedges.ts:
- `export interface RankablePromo { id; bookKey; promoType: PromoType; scope; pinned; eligibleMarketTypes; boostPercent: string|null; boostedOddsAmerican; baseOddsAmerican; bonusAmount; maxStake: string | null; winningsCap; minOddsAmerican }`
- `export function rankPromoHedges<P extends RankablePromo>(promos: P[], opts: RankOptions): PromoOpportunity<P>[]`

From src/domain/hedge/profitBoost.ts (the project's own boost solver, used to compute expected test values):
- `export function calculateProfitBoostHedge(input: ProfitBoostInput): ProfitBoostResult | null`. Input is `{ boostedOddsAmerican, baseOddsAmerican, boostPercent: Decimal|null, hedgeOddsAmerican: number, maxStake: Decimal, winningsCap, minOddsAmerican, precision }`. The result has `guaranteedProfit`, `promoStake`, `hedgeStake`, `capBound`.

From src/domain/promos/promoRowDto.ts:
- `export interface PresentablePromo extends RankablePromo { ...; addedByYou?: boolean; attribution }`. ADD the same two optional fields.
- `export function capNoteFor(promo, capBound: "max_stake" | "max_winnings", bookNames): string | null`

From src/lib/safeAction.ts:
- `export const ACTION_FAILED_MESSAGE`
- `export async function safeAction<T>(call: () => Promise<T>, label: string): Promise<{ ok: true; value: T } | { ok: false }>`

From src/lib/session.ts: `requireUser()` returns `{ userId, email, displayName }` and redirects (throws) when logged out.

Schema pattern to mirror: `promoCompletions` in src/db/schema.ts (composite PK, both FKs `onDelete: "cascade"`). Migration style to mirror: drizzle/0010_added_promos.sql (additive only).
Action pattern to mirror: src/app/actions/mark-promo-used.ts (requireUser first, strict schema with no userId, revalidatePath("/")).
Client pattern to mirror: src/components/promos/MarkUsedButton.tsx (useTransition, safeAction, stopPropagation, inline role="alert" error, pointer-events-auto, min-h-10 tap target).
Refetch pattern: PromosScreen.tsx `handleChanged()` calls runGetPromos() and onPromosChanged(), which refreshes Promos in place and tells AppShell to refetch Opportunities. No page reload.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Storage, effective-cap helpers, cap-aware getActivePromos, group-safe observations, row DTO cap info</name>
  <files>src/db/schema.ts, drizzle/0011_user_promo_caps.sql (+ drizzle/meta/_journal.json, drizzle/meta/0011_snapshot.json generated), src/domain/promos/yourCap.ts, src/domain/promos/yourCap.test.ts, src/db/promoCaps.ts, src/db/promoCaps.test.ts, src/db/promos.ts, src/db/promoObservations.ts, src/db/promoObservations.test.ts, src/domain/promos/promoRowDto.ts, src/domain/promos/dto.ts, src/domain/promos/rankPromoHedges.test.ts, src/ingestion/promos/boundary.test.ts</files>
  <read_first>src/db/schema.ts (promoCompletions block ~lines 300-330), drizzle/0010_added_promos.sql, src/db/promos.ts, src/db/promos.test.ts (compile-toSQL test pattern with vi.mock("./client")), src/db/promoObservations.ts, src/domain/promos/promoRowDto.ts, src/domain/promos/dto.ts (PromoRowDTO, UnprofitablePromoRowDTO), src/domain/promos/rankPromoHedges.test.ts (existing boost fixtures and odds-event builders, reuse them), src/domain/hedge/profitBoost.ts lines 35-75, src/domain/promos/reviewInput.ts lines 150-160 (MONEY_PATTERN), src/ingestion/promos/boundary.test.ts</read_first>
  <behavior>
    - resolveEffectiveMaxStake("25.00", null) returns "25.00". resolveEffectiveMaxStake("25.00", "20.00") returns "20.00". An override higher than the promo cap ("30.00") returns "30.00". resolveEffectiveMaxStake(null, null) returns null.
    - applyMemberCaps on [boost id 20 cap "25.00", boost id 21 cap "50.00", bonus_bet id 22] with caps Map{20 to "20.00", 22 to "5.00"}: id 20 has maxStake "20.00", promoMaxStake "25.00", capOverride "20.00". id 21 is unchanged with promoMaxStake "50.00" and capOverride null. The bonus bet is untouched, so a cap row on a non-boost is ignored. The input array is not mutated.
    - Cleared override: applyMemberCaps with an empty Map returns maxStake equal to promoMaxStake for every boost.
    - Per-member: the same promo list with member A's map gives "20.00" and with member B's empty map gives "25.00".
    - stripMemberCaps(applyMemberCaps(list, caps)) restores maxStake to the promo's own cap. Promos without promoMaxStake (undefined) pass through unchanged.
    - SetPromoCapInputSchema accepts {promoId: 20, maxStake: "20"}, {promoId: 20, maxStake: "20.5"}, {promoId: 20, maxStake: "10000.00"} and {promoId: 20, maxStake: null}. It rejects: maxStake "0", "0.00", "-5", "20.555", "1e3", "abc", "", " 20", "10000.01", the number 20, a missing maxStake key, an extra key (userId), promoId 0, promoId "20", and promoId 1.5.
    - Ranking to the cent (rankPromoHedges.test.ts): a boost with promo cap "25.00" plus applyMemberCaps override "20.00", ranked against an existing fixture event. Its opportunity's boost.guaranteedProfit, promoStake and hedgeStake each equal (Decimal .equals) calculateProfitBoostHedge called with the same odds, boost, winningsCap, minOdds, precision and maxStake new Decimal("20"). They also differ from the "25" result. Use a fixture/boost where the stake cap binds (capBound "max_stake").
    - capNoteFor with capOverride "20.00", promoMaxStake "25.00", capBound "max_stake" returns a note naming "your $20.00 max stake" and the book's $25.00. Without an override the note text is unchanged from today.
    - toPromoRowDTO / toUnprofitablePromoRowDTO for a profit_boost with promoMaxStake set emit yourCap = { promoCap: "25.00", override: "20.00" } (or override null). For bonus_bet rows yourCap is undefined.
    - getMemberPromoCaps: with getDb mocked so the query rejects with an error carrying code "42P01" (directly, or as `.cause` of a wrapper error), it resolves to an empty Map. With a different error (e.g. "fetch failed") it rejects. When the mocked rows are [{promoId: 20, maxStake: "20.00"}] it returns Map{20 to "20.00"}. The compiled caps select (buildMemberCapsQuery(db, 7).toSQL()) filters on "user_id" = $ with 7 in params.
    - Observations stay group-level (promoObservations.test.ts, mocking ./queries, ./promoTracking and ./promos): given a boost whose maxStake was overridden to "20.00" (promoMaxStake "25.00"), recordCurrentProfitObservations records maxGuaranteedProfit equal to the solver result at maxStake 25, not 20.
    - Scraper boundary (boundary.test.ts, new it-block): no file under src/ingestion or scripts/ contains "userPromoCaps", "user_promo_caps" or an import of "@/db/promoCaps". Walk with the existing walkFiles helper, add the scripts/ root, and skip *.test.ts files.
  </behavior>
  <action>
    1. Schema (per CONTEXT "Storage"): in src/db/schema.ts, after promoCompletions, add `export const userPromoCaps = pgTable("user_promo_caps", {...})` with: userId integer "user_id" notNull referencing users.id onDelete cascade; promoId integer "promo_id" notNull referencing promos.id onDelete cascade; maxStake numeric "max_stake" precision 10 scale 2 notNull; updatedAt timestamp "updated_at" withTimezone notNull. Use a composite primaryKey on (userId, promoId). Add a doc comment in the style of promoCompletions: per-member, scraper never writes it, separate table so scrapes can't overwrite it.
    2. Run `npx drizzle-kit generate --name user_promo_caps`. It must produce exactly one new file, drizzle/0011_user_promo_caps.sql, plus the meta journal and snapshot updates, containing only CREATE TABLE and ADD CONSTRAINT ... FOREIGN KEY statements. Do NOT run drizzle-kit migrate, push, or `npm run db:migrate`, and do not touch the live DB in any way (CONTEXT: applying is a blocking human checkpoint).
    3. src/domain/promos/yourCap.ts (pure, decimal.js only, no src/db imports):
       - `YOUR_CAP_MAX = "10000.00"`.
       - `SetPromoCapInputSchema = z.strictObject({ promoId: z.number().int().positive(), maxStake: <money>.nullable() })`. The money schema is z.string().max(12) plus a regex on MONEY_PATTERN imported from ./reviewInput, then a refine skipped when the regex failed (same guard as reviewInput's MoneyFieldSchema) requiring `new Decimal(v).gt(0) && new Decimal(v).lte(YOUR_CAP_MAX)`, with the message "Enter an amount between $0.01 and $10,000." Export the inferred type.
       - `resolveEffectiveMaxStake(promoCap, override)` returns override ?? promoCap.
       - `applyMemberCaps<P extends RankablePromo>(promos, caps: ReadonlyMap<number, string>)` returns new objects with promoMaxStake: p.maxStake and capOverride: (profit_boost && caps.has(id)) ? caps.get(id) : null, and maxStake set to the effective value. Return type is `Array<P & { promoMaxStake: string | null; capOverride: string | null }>`.
       - `stripMemberCaps<P extends RankablePromo & { promoMaxStake?: string | null }>(promos)` sets maxStake back to promoMaxStake when it is not undefined.
    4. src/db/promoCaps.ts (uses getDb from ./client and userPromoCaps from ./schema):
       - `isUndefinedTableError(err)` walks err and err.cause, up to 5 levels, for code === "42P01", or a message matching /relation "user_promo_caps" does not exist/.
       - Export a `buildMemberCapsQuery(db, userId)` builder that selects promoId and maxStake from userPromoCaps where userId equals the argument (kept testable via toSQL).
       - `getMemberPromoCaps(userId): Promise<Map<number, string>>` awaits that query. In catch: if isUndefinedTableError, console.warn("getMemberPromoCaps: user_promo_caps table not found (migration 0011 not applied yet); treating as no caps") and return an empty Map; otherwise rethrow.
       - Task 2 adds the write functions to this same file.
    5. src/db/promos.ts: add the optional `promoMaxStake?` / `capOverride?` fields to ActivePromo. In getActivePromos, when viewerUserId !== undefined, run the existing rows query and getMemberPromoCaps(viewerUserId) in Promise.all. After mapping, return applyMemberCaps(activePromos, caps). Without a viewer, return as today. Leave mapActivePromoRow's output unchanged (do not add the fields there) so existing promos.test.ts expectations hold. Update the getActivePromos doc comment: the viewer's own caps are applied here so every member-scoped caller gets them, and the observations path strips them.
    6. src/db/promoObservations.ts: rank `stripMemberCaps(activePromos)` instead of activePromos, with a comment explaining that group-level observations must never reflect one member's cap.
    7. promoRowDto.ts / dto.ts:
       - Add the two optional fields to PresentablePromo.
       - In capNoteFor, when capBound is "max_stake" and promo.capOverride is non-null, return `Capped at your ${formatUsd(capOverride)} max stake (${bookName}'s page says ${formatUsd(promoMaxStake)}) — a smaller stake keeps guaranteed profit equal on both sides.`
       - Add an optional `yourCap?: { promoCap: string; override: string | null }` to PromoRowDTO and UnprofitablePromoRowDTO, with a doc comment: Promos-tab-only edit data; optional because frozen Done snapshots lack it. Set it in both mappers only when promoType is "profit_boost" and promo.promoMaxStake is a non-null string.
       - Do NOT add it to doneSnapshot's SnapshotRowSchema. The existing `_rowShapeGuard` still compiles because the field is optional.
    8. Write the tests listed in <behavior> into the files named in <files>, following the existing vi.mock("./client") and compile-toSQL patterns. No live DB and no Odds API calls.
  </action>
  <verify>
    <automated>cd "/Users/bentorio/Desktop/Personal Projects/promoprofit" && npx vitest run src/domain/promos/yourCap.test.ts src/db/promoCaps.test.ts src/db/promoObservations.test.ts src/domain/promos/rankPromoHedges.test.ts src/ingestion/promos/boundary.test.ts src/db/promos.test.ts && npx tsc --noEmit && ls drizzle/*.sql | wc -l | grep -q 12 && grep -c 'CREATE TABLE "user_promo_caps"' drizzle/0011_user_promo_caps.sql && ! grep -Eiq 'DROP|ALTER COLUMN|RENAME' drizzle/0011_user_promo_caps.sql</automated>
  </verify>
  <done>
    - user_promo_caps exists in the schema, and drizzle/0011_user_promo_caps.sql is the only new migration (additive: no DROP, ALTER COLUMN or RENAME).
    - getActivePromos applies only the viewer's caps and degrades to no caps when the table is missing.
    - Observations rank at the promo's own cap.
    - Boost row DTOs carry yourCap.
    - All listed tests pass and tsc reports 0 errors.
    - The live DB has not been touched.
  </done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: setPromoCapAction (secure write path) and the inline "Your cap" field on Promos rows</name>
  <files>src/db/promoCaps.ts, src/app/actions/set-promo-cap.ts, src/app/actions/set-promo-cap.test.ts, src/components/promos/YourCapField.tsx, src/components/promos/PromoRow.tsx, src/components/promos/UnprofitablePromoRow.tsx, src/components/promos/PromosScreen.tsx</files>
  <read_first>src/app/actions/mark-promo-used.ts, src/app/actions/mark-promo-used.test.ts (session/db mock pattern), src/components/promos/MarkUsedButton.tsx, src/components/promos/PromoRow.tsx, src/components/promos/UnprofitablePromoRow.tsx, src/components/promos/PromosScreen.tsx lines 280-360 (where PromoRow/UnprofitablePromoRow are rendered with onChanged={handleChanged}), src/lib/safeAction.ts</read_first>
  <behavior>
    - No session: with requireUser mocked to reject (redirect), setPromoCapAction rejects, and none of getCapEditablePromo / upsertMemberPromoCap / deleteMemberPromoCap is called.
    - Invalid input returns { status: "invalid", message } with no DB call. This covers maxStake "0", "-5", "20.555", "abc", "10000.01", the number 20, an extra userId key, a missing promoId, and a non-object (null, "x").
    - A promo the member cannot see (getCapEditablePromo resolves null, e.g. another member's added promo, an expired or pending promo, or an unknown id) returns { status: "not_found", message: "This promo is no longer available." }. No write happens.
    - A non-boost promo (getCapEditablePromo resolves { id, promoType: "bonus_bet" }) returns { status: "invalid", message: "Only profit boosts have a max stake." }. No write happens.
    - Valid "20" calls upsertMemberPromoCap({ userId: <session id>, promoId: 20, maxStake: "20.00", now }) and returns { status: "ok" }. The user id comes only from the session.
    - Valid null calls deleteMemberPromoCap({ userId: <session id>, promoId: 20 }) and returns { status: "ok" }.
    - Table missing: upsert rejects with an error whose code is "42P01", and the action returns { status: "unavailable", message: "Your cap can't be saved yet — the database update hasn't been applied." }. Any other DB error is rethrown, so the client's safeAction shows ACTION_FAILED_MESSAGE.
    - getCapEditablePromo's compiled query (exported builder, toSQL) includes the visibility condition ("added_by_user_id" is null OR = $viewer) and the promo id.
  </behavior>
  <action>
    1. In src/db/promoCaps.ts, add these (all via getDb, no raw string SQL):
       - `buildCapEditablePromoQuery(db, promoId, userId, now)`: selects id and promoType from promos where `and(eq(promos.id, promoId), activePromoWhere(now, userId))`, limit 1. This mirrors T-5-visibility: one rule, reused from src/db/promos.ts.
       - `getCapEditablePromo(promoId, userId, now)`: returns the row or null.
       - `upsertMemberPromoCap({ userId, promoId, maxStake, now })`: insert into userPromoCaps, onConflictDoUpdate with target [userId, promoId], set maxStake and updatedAt.
       - `deleteMemberPromoCap({ userId, promoId })`: delete where both userId and promoId match. It is idempotent: no row is fine.
       - These are the ONLY write paths into the table.
    2. Create src/app/actions/set-promo-cap.ts with "use server". Export the type `SetPromoCapResponse = { status: "ok" } | { status: "invalid"; message: string } | { status: "not_found"; message: string } | { status: "unavailable"; message: string }`. Export `async function setPromoCapAction(input: unknown)`. Order of operations:
       - `const user = await requireUser()` as the literal first statement.
       - SetPromoCapInputSchema.safeParse. On failure return invalid, with the first issue message or "Enter an amount between $0.01 and $10,000."
       - `now = new Date()`; getCapEditablePromo(promoId, user.userId, now). If null, return not_found. If promoType !== "profit_boost", return invalid "Only profit boosts have a max stake."
       - Inside try: if maxStake === null, deleteMemberPromoCap. Otherwise upsertMemberPromoCap with `new Decimal(maxStake).toFixed(2)`.
       - In catch: if isUndefinedTableError, return unavailable; otherwise rethrow.
       - revalidatePath("/") and return ok (same as mark-promo-used.ts).
       - Doc comment: the IDOR/visibility guard, per CONTEXT "Security". No userId is ever read from input.
    3. Create src/components/promos/YourCapField.tsx ("use client"):
       - Props: { promoId: number; promoCap: string; override: string | null; onChanged: () => void }.
       - Render a small labeled inline control. Use a <label> "Your cap" and a text input with inputMode="decimal", aria-label "Your max stake for this boost", placeholder formatUsd(promoCap) without the dollar sign or the raw promoCap, and initial value override ?? "". Add a "Save" ghost Button size="sm" min-h-10. When override !== null, also show a "Use book's cap" ghost button that saves null. Show a muted hint: "Book's cap: {formatUsd(promoCap)}" when no override, "Using your cap (book says {formatUsd(promoCap)})" when an override is set.
       - Enter in the input submits the same as Save.
       - Saving: useTransition, then `safeAction(() => setPromoCapAction({ promoId, maxStake }), "setPromoCapAction")`. Send an empty or whitespace-only value as null. Send any other value trimmed as a string. Do no number parsing on the client.
       - Results: !ok shows ACTION_FAILED_MESSAGE. ok + status "ok" clears the error and calls onChanged(). That is the existing in-place refetch of Promos plus Opportunities, with no confirm dialog and no page reload, per CONTEXT "Saves instantly". Any other status shows its message inline (role="alert", text-destructive, same as MarkUsedButton).
       - Disable the inputs while pending. Sync the local input to a new `override` prop after refetch: key the component on override in the parent, or use an effect.
       - The wrapper is `pointer-events-auto` and stops propagation of click, pointerdown and keydown, so typing or tapping never toggles the row's Collapsible (the PromoRow content layer is pointer-events-none over an overlay trigger).
    4. In PromoRow.tsx, add an optional prop `capEditable?: boolean`. When `capEditable && row.yourCap`, render `<YourCapField key={row.yourCap.override ?? "none"} promoId={row.promoId} promoCap={row.yourCap.promoCap} override={row.yourCap.override} onChanged={onChanged} />` in the first column, below the "Promo: {scopeLabel}" line. In UnprofitablePromoRow.tsx, add the same prop and render the field under its title line, so a member can still change or clear a cap when the row turns unprofitable. In PromosScreen.tsx, pass `capEditable` to both active-feed PromoRow and UnprofitablePromoRow renders. Do NOT pass it in OpportunitiesScreen: the field lives on the Promos tab only (CONTEXT "Inline field on the Promos tab"), while Opportunities still shows the recomputed numbers.
    5. Write src/app/actions/set-promo-cap.test.ts covering <behavior>. Mock @/lib/session, @/db/promoCaps (keep the real isUndefinedTableError via vi.importActual, or re-export it) and next/cache. Include the getCapEditablePromo compile-SQL test in src/db/promoCaps.test.ts.
  </action>
  <verify>
    <automated>cd "/Users/bentorio/Desktop/Personal Projects/promoprofit" && npx vitest run src/app/actions/set-promo-cap.test.ts src/db/promoCaps.test.ts && npx vitest run && npx tsc --noEmit && npm run lint && grep -Eq 'safeAction\(\s*\(\)\s*=>\s*setPromoCapAction' src/components/promos/YourCapField.tsx && grep -v '^\s*//' src/app/actions/set-promo-cap.ts | grep -q 'await requireUser()'</automated>
  </verify>
  <done>
    - setPromoCapAction rejects every case listed in <behavior> without writing, and it saves or clears only the session member's row.
    - Promos-tab boost rows (profitable and greyed) show the Your cap field. Saving or clearing recomputes the row and Opportunities in place.
    - The full vitest suite passes, tsc reports 0 errors, and lint is clean.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Owner applies migration 0011 to live Neon, then confirms Your cap works</name>
  <files>none (owner-run step; executor modifies no files here)</files>
  <action>STOP and present this checkpoint to the owner. Do NOT run npm run db:migrate, drizzle-kit migrate, drizzle-kit push, or any other live-DB write. Only the owner applies migration 0011, after they explicitly say OK.</action>
  <verify><human-check>Owner confirms migration 0011 is applied and steps 3-6 below pass (or explicitly defers applying it)</human-check></verify>
  <done>Owner typed "approved" (migration applied, Your cap verified), or "not applying yet" (recorded as pending in SUMMARY/STATE)</done>
  <what-built>
    - Per-member "Your cap" for profit boosts: the table, migration drizzle/0011_user_promo_caps.sql (generated, NOT applied), the cap-aware feeds, setPromoCapAction, and the inline field on Promos rows.
    - Before the migration is applied, the site still loads: feeds behave as if no caps exist, and saving shows "Your cap can't be saved yet — the database update hasn't been applied."
    - The executor must STOP here. It must never run `npm run db:migrate`, `drizzle-kit migrate` or `drizzle-kit push`, and must not write to the live DB in any other way.
  </what-built>
  <how-to-verify>
    1. Review drizzle/0011_user_promo_caps.sql. It should contain only CREATE TABLE "user_promo_caps" and two FOREIGN KEY constraints (users, promos, ON DELETE cascade). It changes no existing table.
    2. If you approve, run it yourself: `npm run db:migrate`.
    3. Run `npm run dev`, log in, and open Promos. On the DraftKings College Football 50% boost (promo #20, once confirmed in "Needs a look"), type 20 in "Your cap" and press Enter. The row's stake should drop to $20 and its profit should update right away, with no dialog and no page reload. The expanded note should read "Capped at your $20.00 max stake (DraftKings's page says $25.00)".
    4. Open Opportunities. The same promo should show the $20-based numbers.
    5. Log in as a second member (or ask a friend). Their row for the same promo should still use $25.
    6. Back as the owner, press "Use book's cap". The row should return to $25.
  </how-to-verify>
  <resume-signal>Type "approved" once the migration is applied and the steps pass. Otherwise type "not applying yet" or describe what went wrong.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Browser to setPromoCapAction | Member-supplied promoId and maxStake. Untrusted. |
| Member to member | A cap belongs to one member and must never change another member's feed, totals, or the shared observations |
| Scraper job to promos / user_promo_caps | Scrapes rewrite promos.max_stake but must never touch member caps |
| App to live Neon | Migration 0011 changes the schema; applying it is owner-only |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-dhn-01 | Spoofing / EoP | setPromoCapAction | mitigate | `await requireUser()` is the literal first statement. The owner of the row is always user.userId, and SetPromoCapInputSchema is a strictObject with no userId field (extra keys rejected). |
| T-dhn-02 | Info disclosure / Tampering (IDOR) | getCapEditablePromo | mitigate | WHERE id = promoId AND activePromoWhere(now, userId), which reuses promoVisibilityCondition. Another member's added promo, or an inactive or unknown id, gets one generic not_found message. |
| T-dhn-03 | Tampering | maxStake input | mitigate | String-only, MONEY_PATTERN, max 12 chars, decimal.js checks > 0 and <= 10000, stored as toFixed(2). No parseFloat or Number(), and nothing is parsed on the client. Non-boost promos are rejected. |
| T-dhn-04 | Tampering / Info disclosure | cross-member leakage | mitigate | Caps are read only by getMemberPromoCaps(viewerUserId), filtered on user_id. getActivePromos without a viewer applies nothing, and recordCurrentProfitObservations ranks stripMemberCaps(...), so shared observations use the promo's own cap. Covered by tests. |
| T-dhn-05 | Tampering | scraper write path | mitigate | Separate table. The boundary test asserts that no file under src/ingestion or scripts/ references userPromoCaps, user_promo_caps or @/db/promoCaps. |
| T-dhn-06 | DoS (availability) | deploy before migration | mitigate | getMemberPromoCaps returns an empty Map only on SQLSTATE 42P01, and the action returns "unavailable". Other errors still surface as they do today. |
| T-dhn-07 | Tampering | migration 0011 on live Neon | mitigate | Additive only (grep gate: no DROP, ALTER COLUMN or RENAME). Applied only by the owner at the blocking Task 3 checkpoint, and the executor never runs migrate. |
| T-dhn-08 | Repudiation | mark-done snapshot | accept | The snapshot's terms.maxStake records the member's effective cap at mark-done time. That is the cap they actually bet under, which is correct for their own Done history. |
| T-dhn-09 | DoS | row spam | accept | At most one row per (user, promo) because of the composite PK. The visible active promo set is small and bounded. |
</threat_model>

<verification>
- `npx vitest run` (targeted, then full suite) passes.
- `npx tsc --noEmit` reports 0 errors.
- `npm run lint` is clean.
- Exactly one new migration exists, drizzle/0011_user_promo_caps.sql, and it is additive (no DROP, ALTER COLUMN or RENAME).
- `grep -rn "getActivePromos(" src --include=*.ts | grep -v test` shows that every member-scoped caller still passes the session user id.
- `grep -rEn "userPromoCaps|user_promo_caps" src/ingestion scripts` returns nothing outside test files.
- No db:migrate, drizzle-kit migrate or push was run, and no Odds API call was made.
</verification>

<success_criteria>
- A member's own cap drives their Promos, Opportunities, pairs, alt-spread picking and mark-done numbers to the cent. Another member's numbers and the shared observations stay on the promo's own cap.
- The cap saves and clears inline without a confirm dialog or a page reload.
- Scrapes cannot affect caps.
- The site keeps working before the migration is applied.
- The owner has reviewed and applied migration 0011 (or explicitly deferred it) at the Task 3 checkpoint.
</success_criteria>

<output>
Create `.planning/quick/261001-dhn-per-member-max-stake-cap-override-for-pr/261001-dhn-SUMMARY.md` when done
</output>
