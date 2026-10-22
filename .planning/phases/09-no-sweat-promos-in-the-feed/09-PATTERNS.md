# Phase 9: No-Sweat Promos in the Feed - Pattern Map

**Mapped:** 2026-10-22
**Files analyzed:** 34 new/modified (grouped; the A-02 exhaustive-switch list is treated as one modification group)
**Analogs found:** 33 / 34

Inputs: 09-CONTEXT.md, 09-RESEARCH.md (read through line 381 of 571; the remainder is validation and open questions, not file structure), 09-UI-SPEC.md. Line numbers below are from this session's reads.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `drizzle/0018_*.sql` | migration | CRUD | `drizzle/0016_worthless_rockslide.sql` (user_book_caps) | exact |
| `src/db/schema.ts` (+`trackedNoSweats`, `userLowProfileSettings`) | model | CRUD | `userBookCaps` (schema.ts ~436-452), `promoCompletions` (~317-345) | exact |
| `src/db/lowProfile.ts` | service (db) | CRUD | `src/db/bookCaps.ts` | exact |
| `src/db/trackedNoSweats.ts` | service (db) | CRUD | `src/db/promoTracking.ts` + `bookCaps.ts` (missing-table degrade) | role-match |
| `src/db/promos.ts` (`getActivePromos` excludes no_sweat; add `getActiveNoSweatPromos`) | service (db) | request-response | itself, `activePromoWhere` (promos.ts ~316-330), `mapActivePromoRow` (~191) | exact |
| `src/domain/promos/types.ts` (+`no_sweat`, `GuaranteedPromoType`, `assertNever`) | model | transform | itself (types.ts:8) | exact |
| `src/domain/promos/lowProfile.ts` | utility (zod schema + defaults + warnings) | transform | `src/domain/promos/yourCap.ts` (`SetBookCapInputSchema`, `DEFAULT_MAX_STAKE`) | role-match |
| `src/domain/promos/rankNoSweat.ts` (extend options, market limit, expiry) | service (pure) | transform | itself | exact |
| `src/domain/promos/rankNoSweatFeed.ts` | service (pure) | batch/transform | `rankNoSweat.ts` + `rankPromoHedges.ts` (list-level ranker) | role-match |
| `src/domain/promos/noSweatRowDto.ts` | model (DTO) | transform | `src/domain/promos/promoRowDto.ts` | role-match |
| `src/domain/promos/noSweatSnapshot.ts` | model (zod snapshot) | transform | `src/domain/promos/doneSnapshot.ts` (`DonePromoSnapshotSchema`) | exact |
| `src/domain/hedge/conversionRate.ts` (+`rankRefundOpportunities`) | service (pure) | transform | itself (`topConversionFor`, lines 47-80) | exact |
| `src/app/actions/track-no-sweat.ts` (track/untrack/settle/complete-refund) | controller (server action) | request-response | `src/app/actions/mark-promo-used.ts` | exact |
| `src/app/actions/set-low-profile.ts` | controller | request-response | `src/app/actions/set-book-cap.ts` | exact |
| `src/app/actions/get-opportunities.ts` (merge no-sweats, tracking, cantPrice, empty-state) | controller | request-response | itself | exact |
| `src/domain/opportunities/types.ts` (`estimated`, "Est. ROI", `tracking`, `cantPrice`) | model | transform | itself | exact |
| `src/db/feedContext.ts` (additive: no-sweat promos, tracked ids, low-profile) | service (db) | request-response | itself | exact |
| `src/components/promos/NoSweatRow.tsx` | component | request-response | `src/components/promos/PromoRow.tsx` | exact |
| `src/components/promos/NoSweatDetails.tsx` | component | request-response | `src/components/promos/PromoDetails.tsx` (not read) | role-match |
| `src/components/promos/TrackButton.tsx` | component | request-response | `src/components/promos/MarkUsedButton.tsx` | exact |
| `src/components/opportunities/TrackingStrip.tsx` + `TrackedNoSweatCard.tsx` | component | request-response | `PairCard.tsx` / `PromoRow.tsx` shell + `MarkUsedButton.tsx` | role-match |
| `src/components/promos/DonePromoRow.tsx` (no-sweat variant) | component | request-response | itself | exact |
| `src/components/promos/UnprofitablePromoRow.tsx` (can't-price/negative) | component | request-response | itself | exact |
| `src/components/opportunities/OpportunitiesScreen.tsx` (strip, can't-price section) | component | request-response | itself + `OpportunitySection.tsx` | exact |
| `src/components/promos/NoSweatFields.tsx` | component | request-response | `src/components/promos/BonusBetFields.tsx` | exact |
| `src/components/promos/AddPromoForm.tsx`, `addPromoDraft.ts`, `addedPromoInput.ts`, `buildAddedPromo.ts` | component / utility | request-response | themselves (third type branch) | exact |
| `src/components/promos/QueueItemCard.tsx` / `ClassifyQueueCard.tsx` (DisagreementCard) | component | request-response | `QueueItemCard.tsx` | role-match |
| `src/components/settings/SettingsLowProfileForm.tsx` + `src/app/settings/page.tsx` | component | request-response | `SettingsBookCapsForm.tsx` + settings page | exact |
| `src/components/NoSweatRiskAdvisory.tsx` | component | static | `src/components/RiskAdvisory.tsx` | exact |
| `src/ingestion/promos/noSweat.ts` (`classifyNoSweat`) | utility (pure) | transform | `src/ingestion/promos/exclusions.ts` | exact |
| `src/ingestion/promos/exclusions.ts` (drop no_sweat return, tighten first-bet) | utility | transform | itself | exact |
| `src/ingestion/promos/books/draftkings.ts` (`buildNoSweatCandidate`) | service (scraper) | transform | `draftkings.ts` ~360-400 candidate builder | exact |
| `src/ingestion/promos/reconcile.ts`, `promoReading.ts`, `verbatimGuard.ts`, `reviewTriage.ts`, `readerPass.ts` | service (ingestion) | transform | themselves | exact |
| `scripts/audit-no-sweat.ts` | utility (script) | batch | `scripts/promos-check.ts` (named in RESEARCH, not read) | role-match |
| Settle-time totals consumers (`dashboardTotals.ts`, `profitSeries.ts`, `profitHistory.ts`, `promoObservations.ts`) | service | transform | themselves (verify untouched; add exclusions only in funnel queries) | exact |
| `src/test/fixtures/promos/` new DK no-sweat fixture | test fixture | file-I/O | existing `draftkings-promos-2026-09-28.json` | role-match |
| FD / Bally no-sweat builders | service (scraper) | transform | No analog until recon | none |

## Pattern Assignments

### `src/app/actions/track-no-sweat.ts` (controller, request-response)

**Analog:** `src/app/actions/mark-promo-used.ts` (76 lines, read fully)

**Imports + header** (lines 1-12):
```typescript
"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { MarkPromoDoneInputSchema, PromoIdInputSchema } from "@/domain/promos/reviewInput";
import { markPromoDone, unmarkPromoUsed } from "@/db/promoTracking";
import { computeMemberPromoState } from "@/db/memberPromoState";
import { buildDoneSnapshot, isSameDisplayedProfit } from "@/domain/promos/doneSnapshot";
import { formatUsd } from "@/lib/format";
```

**Core pattern** (lines 14-62): discriminated-union response type, `requireUser()` literal first statement, `safeParse` on a strict schema with no userId, server recompute, compare against the client's displayed number, `odds_changed` rejection, single write, `revalidatePath("/")`.
```typescript
export type MarkDoneResponse =
  | { status: "ok"; profitExtracted: string }
  | { status: "invalid" }
  | { status: "not_found"; message: "This promo is no longer active." }
  | { status: "odds_changed"; message: string; currentGuaranteedProfit: string | null };

export async function markPromoUsedAction(input: unknown): Promise<MarkDoneResponse> {
  const user = await requireUser();
  const parsed = MarkPromoDoneInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  const { promoId, precision, expectedGuaranteedProfit } = parsed.data;
  const now = new Date();
  const state = await computeMemberPromoState({ userId: user.userId, promoId, precision, now });
  if (state.kind === "not_active") return { status: "not_found", message: "This promo is no longer active." };
  ...
  if (!isSameDisplayedProfit(expectedGuaranteedProfit, currentGuaranteedProfit)) { ... return { status: "odds_changed", ... }; }
  ...
  await markPromoDone({ userId: user.userId, promoId, now, snapshot, profitExtracted });
  revalidatePath("/");
  return { status: "ok", profitExtracted };
}
```
**Divergences the planner must apply (A-03):** `trackNoSweatAction` recomputes via `rankNoSweat` + low-profile + ONE conversion fn (not `computeMemberPromoState`). `settleNoSweatAction` and `completeRefundNoSweatAction` must NOT call `computeMemberPromoState` (returns `not_active` after kickoff because `activePromoWhere` requires `event_commence_time > now`). They load the tracked row (user-scoped) and use its snapshot only. Enforce `now >= snapshot.game.commenceTime` server-side.

**Undo** (lines 64-76): reuse `unmarkPromoUsedAction` as is.
```typescript
export async function unmarkPromoUsedAction(input: unknown): Promise<UndoDoneResponse> {
  const user = await requireUser();
  const parsed = PromoIdInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  await unmarkPromoUsed({ userId: user.userId, promoId: parsed.data.promoId });
  revalidatePath("/");
  return { status: "ok" };
}
```

---

### `src/db/trackedNoSweats.ts` (service/db, CRUD)

**Analogs:** `src/db/promoTracking.ts` (writes) and `src/db/bookCaps.ts` (missing-table degrade).

**Idempotent insert** (promoTracking.ts:57-70). One write per action, no interactive transactions (neon-http):
```typescript
await db
  .insert(promoCompletions)
  .values({ userId, promoId, completedAt: now, snapshot, profitExtracted })
  .onConflictDoNothing({ target: [promoCompletions.userId, promoCompletions.promoId] });
```
Reuse this exact function (`markPromoDone`) for the settle-time completion row, with `completedAt: now` (settle time) and the v2 snapshot. Do not add a `state` column to `promo_completions` (RESEARCH recommends the separate `tracked_no_sweats` table).

**User-scoped read** (promoTracking.ts:~36-52): every query filters `eq(promoCompletions.userId, userId)` (T-igk-03); copy for tracked rows.

**Missing-table degrade** (bookCaps.ts:11-40):
```typescript
const TABLE = "user_book_caps";
export function isBookCapsTableMissing(err: unknown): boolean {
  return isUndefinedTableErrorFor(err, TABLE);
}
let warnedMissingTable = false;
export async function getMemberBookCaps(userId: number): Promise<Map<string, string>> {
  try { ... } catch (err) {
    if (isBookCapsTableMissing(err)) {
      if (!warnedMissingTable) { warnedMissingTable = true; console.warn("... (migration 0016 not applied yet) ..."); }
      return new Map();
    }
    throw err;
  }
}
```
Copy with TABLE = `tracked_no_sweats` / `user_low_profile_settings`; migration number 0018. `isUndefinedTableErrorFor` is in `src/db/undefinedTable.ts`.

---

### `src/db/schema.ts` additions + `drizzle/0018_*.sql` (model/migration)

**Analog:** `userBookCaps` (schema.ts ~436-452) and migration `0016`.

**Table pattern**:
```typescript
export const userBookCaps = pgTable(
  "user_book_caps",
  {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    bookKey: text("book_key").notNull().references(() => books.key),
    maxStake: numeric("max_stake", { precision: 10, scale: 2 }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.bookKey] })],
);
```
`tracked_no_sweats` copies `promoCompletions` (schema.ts ~317-345): composite PK `(userId, promoId)`, both FKs `onDelete: "cascade"`, `snapshot: jsonb("snapshot")`, plus `state text`, `trackedAt`, `outcome`, `outcomeAt`, `updatedAt`. `user_low_profile_settings`: `user_id` PK -> users cascade, booleans with defaults, `odds_cap_american integer`.

**Migration SQL shape** (0016): `CREATE TABLE ... CONSTRAINT "<t>_user_id_..._pk" PRIMARY KEY(...)`, then `--> statement-breakpoint` separated `ALTER TABLE ... ADD CONSTRAINT ... FOREIGN KEY ... ON DELETE cascade`. Generate with drizzle-kit, commit. `git fetch` first (teammate pushes migrations); latest is `0017_giant_jack_power`.

---

### `src/domain/promos/noSweatSnapshot.ts` (model, transform)

**Analog:** `src/domain/promos/doneSnapshot.ts` (lines 15-100).

Versioned zod, validated on read, never from client numbers:
```typescript
export const DonePromoSnapshotSchema = z.object({
  version: z.literal(1),
  kind: z.enum(["hedge", "no_hedge"]),
  recordedAt: z.string(),
  precision: z.enum(["whole", "cents"]),
  oddsFetchedAt: z.object({ moneyline: z.string().nullable(), spreadsTotals: z.string().nullable() }),
  promo: z.object({ id: z.number(), bookKey: z.string(), ..., promoType: z.enum(PROMO_TYPES), promoTypeLabel: z.enum(["Boost", "Bonus bet"]), ... }),
  ...
});
```
Use `version: z.literal(2)`, `kind: z.literal("no_sweat")`, all money as 2dp strings. WARNING: `promoTypeLabel: z.enum(["Boost","Bonus bet"])` and `promoType: z.enum(PROMO_TYPES)` here become wrong/wide once `no_sweat` joins `PROMO_TYPES` (A-02: doneSnapshot.ts is on the exhaustive-switch list). The Done-tab reader (`toDonePromoDTO` safeParse fallback) must discriminate on `version`/`kind` so a v2 row is not parsed as v1. Also note `_rowShapeGuard` (line 74) compile-time guard must remain valid.

---

### `src/domain/promos/types.ts` (model)

**Analog:** itself, lines 6-9:
```typescript
/** boost = profit boost, bonus = bonus bet (D-01). */
export const PROMO_TYPES = ["profit_boost", "bonus_bet"] as const;
export type PromoType = (typeof PROMO_TYPES)[number];
```
Change to add `"no_sweat"`, then add `export type GuaranteedPromoType = Exclude<PromoType, "no_sweat">` and `export function assertNever(x: never): never`. Narrow `RankablePromo.promoType` to `GuaranteedPromoType`.

**Replace this ternary** (`rankPromoHedges.ts:251-253`):
```typescript
return promo.promoType === "profit_boost"
  ? evaluateBoostCandidate(promo, selection, promoBookQuote, hedge, sameBook, opts, allowNonPositive)
  : evaluateBonusCandidate(promo, selection, promoBookQuote, hedge, sameBook, opts, allowNonPositive);
```
with a `switch (promo.promoType)` ending in `default: return assertNever(promo.promoType)`.

Also the reconcile cast `reading.kind as PromoType` (reconcile.ts ~232-244) and `reading.kind === "profit_boost" ? ... : null` / `=== "bonus_bet" ? ...` in the `preferred` object (reconcile.ts ~239-241) need an explicit no_sweat arm.

---

### `src/db/promos.ts` (`getActivePromos` / `getActiveNoSweatPromos`)

**Analog:** itself. `activePromoWhere` (lines ~316-330):
```typescript
export function activePromoWhere(now: Date, viewerUserId?: number): SQL {
  return and(
    eq(promos.status, "active"),
    sql`${promos.scopeKind} is not null`,
    or(isNull(promos.expiresAt), gt(promos.expiresAt, now)),
    or(
      and(eq(promos.scopeKind, "event"), sql`${promos.eventId} is not null`, gt(promos.eventCommenceTime, now)),
      and(eq(promos.scopeKind, "sport_window"), gt(promos.windowEnd, now)),
      ...
    ),
    promoVisibilityCondition(viewerUserId),
  ) as SQL;
}
```
Add `ne(promos.promoType, "no_sweat")` to `getActivePromos` only (not to `activePromoWhere`, which `getCapEditablePromo` etc. may share) and write `getActiveNoSweatPromos` reusing the same row mapper and `promoVisibilityCondition(viewerUserId)` (promos.ts ~300-305; secure default: no viewer means scraped only). `mapActivePromoRow` (~191) warns and drops unknown `promo_type`, so widening `PROMO_TYPES` and the SQL exclusion must land in the same plan.

---

### `src/domain/hedge/conversionRate.ts` (`rankRefundOpportunities`)

**Analog:** `topConversionFor` (lines 47-80+). Signature to refactor from:
```typescript
export function topConversionFor(args: {
  events: OddsEvent[]; now: Date; refundBookKey: string; amount: Decimal; hedgeBookKeys: ReadonlySet<string>;
}): ConversionRate | null {
  const { events, now, refundBookKey, amount, hedgeBookKeys } = args;
  const allowed = new Set([...hedgeBookKeys, refundBookKey]);
  const markets = extractTwoWayMoneylines(events, { now, windowDays: CONVERSION_WINDOW_DAYS, allowedBookKeys: allowed, sportKeys: new Set(SPORT_KEYS) });
  ...
```
Extract the body that calls `rankBonusBetHedges` into `rankRefundOpportunities({..., limit})`; `topConversionFor` calls it with `limit: 1`. `CONVERSION_WINDOW_DAYS` must stay equal to `WINDOW_DAYS` in `find-hedges.ts`. Existing Phase 8 tests (22) must stay green.

---

### `src/domain/promos/rankNoSweat.ts` (extend)

**Analog:** itself. Add optional `lowProfile` to `NoSweatRankOptions` (so existing tests stay green), `eligibleMarketTypes` to `NoSweatPromo`, `expiresAt` to `noSweatScope`.

Current shapes to extend (lines 25-47):
```typescript
export interface NoSweatPromo { id: string | number; bookKey: string; refundCap: Decimal; minOddsAmerican: number | null; scope: PromoScope; }
export interface NoSweatRankOptions { moneylineEvents: OddsEvent[]; extendedEvents: OddsEvent[]; now: Date; hedgeBookKeys: ReadonlySet<string>; precision: StakePrecision; conversionRateFor: ConversionRateFor; }
export function noSweatScope(sportKey: string | null, now: Date): PromoScope { ... windowEnd: new Date(8.64e15) ... }
```
**Odds comparison** (copy the `meetsMinOdds` pattern, lines ~121-128; never compare raw American ints):
```typescript
return americanToDecimal(quote.oddsAmerican).gte(americanToDecimal(minOddsAmerican));
```
`validatePromo` (lines ~96-118) already returns typed `invalid_promo` rather than throwing; keep it first so `makeConversionRateFor` (throws on bad amounts) never sees a bad cap.

---

### `src/domain/promos/rankNoSweatFeed.ts` (service, batch)

**Analog:** `rankNoSweat` loop + `rankPromoHedges` list-level orchestration. Return shape `{ ranked, nonPositive, cantPrice, invalid, filteredOut }`. Called ONLY from `getOpportunities` (never `computeMemberFeed`, A-01). Create one `makeConversionRateFor({ events: ctx.moneylineEvents, now })` per request and pass it to every promo.

---

### `src/app/actions/get-opportunities.ts` (merge path)

**Analog:** itself. Insertion points:
- After `feed` is computed (line ~91 `computeMemberFeed(...)`), before `respond`. Do NOT pass no-sweats into `computeMemberFeed` or `recordMemberFeedObservations`.
- Item mapping pattern (lines ~137-143) to mirror for no-sweat items:
```typescript
const items: OpportunityItem<PromoRowDTO>[] = rows.map((row) => ({
  rowKey: row.rowKey, profit: row.guaranteedProfit, pct: row.ratePct, pctLabel: row.rateLabel, commenceTime: row.commenceTime, data: row,
}));
```
- `respond` (lines ~106-117) gains `tracking` and `cantPrice` fields (NOT inside `sources`, because `pickTop(items, sort, 5)` slices every source).
- Empty-state chain (lines ~190-209): `sources.some(s => s.items.length > 0)`, `ctx.activePromos.length === 0`, and the `rankPromoHedges` re-rank must all count no-sweat rows / tracking / cantPrice (A-10).
- Early return `if (!feed) return respond("no-odds", [...])` (line ~125) must still include the new fields.

**Types analog:** `src/domain/opportunities/types.ts`. Extend:
```typescript
export interface RankKey { rowKey: string; profit: string; pct: string; pctLabel: "ROI" | "Conversion"; commenceTime: string; }
export type OpportunitySourceDTO = | { id: "promos"; items: OpportunityItem<PromoRowDTO>[] } | ...
```
Add `estimated?: boolean`, `pctLabel` gains `"Est. ROI"`, the promos source item union becomes `PromoRowDTO | NoSweatRowDTO` discriminated by `data.kind`. NOTE: `PromoRowDTO` has no `kind` today; adding a discriminant means every `data` consumer in `OpportunitiesScreen.tsx` must narrow.

**Test analog:** `src/app/actions/get-opportunities.test.ts` lines 1-50 mock `@/db/promos` with ONLY `getActivePromos` (`vi.mock("@/db/promos", () => ({ getActivePromos: mockGetActivePromos }))`) and `@/db/promoTracking` with only `getPromoCompletions`. Adding `getActiveNoSweatPromos`, `getMemberLowProfile`, tracked-row reads breaks these unless mocks are extended in the same task (RESEARCH Pitfall 8). Copy the `vi.hoisted` + `vi.mock` layout.

---

### `src/components/promos/NoSweatRow.tsx` (component)

**Analog:** `src/components/promos/PromoRow.tsx` (206 lines, read fully).

**Imports** (lines 1-15) and **shell** (lines 56-76):
```tsx
<Collapsible className={cn("group rounded-lg border border-border", row.hasPromoBook ? "bg-secondary" : "bg-secondary/40 opacity-60")}>
  <div className="relative">
    <CollapsibleTrigger aria-label={...} className="absolute inset-0 w-full rounded-lg outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" />
    <div className="pointer-events-none relative grid min-h-11 w-full grid-cols-1 items-center gap-3 p-4 text-left md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_96px_20px] md:gap-4">
```
**Badge + book column** (lines ~118-131), **hedge column** (lines ~133-165). **Estimate column to change** (lines ~167-175):
```tsx
<span className="num text-xl font-semibold text-primary md:text-right">{formatUsd(row.guaranteedProfit)}</span>
<span className="flex flex-col md:items-end">
  <span className="num text-base">{formatPct(row.ratePct)}</span>
  <span className="text-sm text-muted-foreground">{row.rateLabel}</span>
</span>
```
For no-sweat: swap `text-primary` for `text-foreground` (hard rule: estimates are never green), add `<Badge variant="outline">est.</Badge>` wrapped in `Tooltip`, caption "Est. ROI", secondary line "at 78% · worst case ...", row `aria-label` with the spoken form. Replace `MarkUsedButton` (line ~92-98) with the Track button. Keep `AddedPromoActions` block (lines ~192-203) in `CollapsibleContent` for hand-added promos (UI-SPEC section 8). Tooltip-in-pointer-events-none pattern: `TooltipTrigger render={<Badge ... className="pointer-events-auto cursor-default">}`.

---

### `src/components/promos/TrackButton.tsx` (component)

**Analog:** `src/components/promos/MarkUsedButton.tsx` (102 lines, read fully).

Copy: `"use client"`, `useTransition`, `safeAction` wrapper, `event.stopPropagation()`, inline `role="alert"` error, `odds_changed` -> set message and `props.onChanged()`:
```tsx
const call = await safeAction(() => markPromoUsedAction({ promoId, precision, expectedGuaranteedProfit }), "markPromoUsedAction");
if (!call.ok) { setErrorMessage(ACTION_FAILED_MESSAGE); return; }
const outcome = call.value;
if (outcome.status === "ok") { setErrorMessage(null); props.onChanged(); return; }
if (outcome.status === "odds_changed") { setErrorMessage(outcome.message); props.onChanged(); return; }
```
Differences: filled primary `variant="default"` `min-h-11` (not ghost `min-h-10`), `Pin` icon, `expectedEstimate` prop. The undo mode of this component can be reused unchanged for tracked/Done no-sweat rows (calls `unmarkPromoUsedAction`).

---

### `src/components/opportunities/TrackingStrip.tsx` + `TrackedNoSweatCard.tsx`

**Analog:** `PromoRow.tsx` shell (but non-collapsible, UI-SPEC section 3) and `MarkUsedButton.tsx` per-button `useTransition` + inline error. Section heading style from `OpportunitySection.tsx` (not read; planner reads). Card classes: `rounded-lg border border-border bg-secondary p-4`. Result buttons `variant="outline"` `min-h-11`; server flags `pastKickoff` (client does not decide). Correction panel uses `Input` as in `SettingsBookCapsForm.tsx` (`inputMode="decimal"`, Enter-to-save handler).

---

### `src/components/promos/NoSweatFields.tsx` and Add promo form chain

**Analog:** `src/components/promos/BonusBetFields.tsx` (115 lines).

**Props + helpers** (lines 10-27) and **$-prefixed amount input** (lines 41-60):
```tsx
interface BonusBetFieldsProps { draft: AddPromoDraft; onDraftChange: (next: AddPromoDraft) => void; options: CorrectionOptions; fieldErrors: AddPromoFieldErrors; disabled?: boolean; }
function FieldError({ id, message }: { id: string; message?: string }) { if (!message) return null; return (<p id={id} role="alert" className="text-sm text-destructive">{message}</p>); }
...
<div className="relative">
  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-base text-muted-foreground">$</span>
  <Input id="add-bonus-amount" name="bonusAmount" inputMode="decimal" autoComplete="off" className="num h-11 pl-7 text-base" value={draft.bonusAmount} onChange={...} aria-invalid={amountError ? true : undefined} aria-describedby={...} />
</div>
```
"More details (optional)" `Collapsible` with `const open = moreOpen || Boolean(oddsError) || Boolean(scopeError)` (errors in a collapsed section must never stay hidden). Reuse `ExpiryField`, `ScopePicker`. Refund cap field: validate whole cents in `addedPromoInput.ts` (`conversionRate.ts:89` throws on bad amounts). Third type branch in `AddPromoForm.tsx`, `addPromoDraft.ts`, `buildAddedPromo.ts`, `duplicateHint.ts`, `describe.ts`, `addedPromoPipeline.ts` — each is an A-02 exhaustive-switch site (not individually read; planner must read each).

---

### `src/components/settings/SettingsLowProfileForm.tsx`, `src/app/actions/set-low-profile.ts`, `src/db/lowProfile.ts`

**Analogs:** `SettingsBookCapsForm.tsx` (117 lines), `set-book-cap.ts` (60+ lines), `bookCaps.ts`.

**Form pattern** (SettingsBookCapsForm lines 22-50):
```tsx
const [isPending, startTransition] = useTransition();
function save(next) {
  startTransition(async () => {
    const call = await safeAction(() => setBookCapAction({ bookKey: book.key, maxStake: next }), "setBookCapAction");
    if (!call.ok) { setErrorMessage(ACTION_FAILED_MESSAGE); return; }
    if (call.value.status === "ok") { setErrorMessage(null); router.refresh(); return; }
    setErrorMessage(call.value.message);
  });
}
```
Server-read initial values from the settings page: `const [books, usableSaved, bookCaps] = await Promise.all([...getMemberBookCaps(user.userId)])`; add `getMemberLowProfile(user.userId)` here. New `Card className="p-6"` AFTER "Max bet per book" (settings/page.tsx ~58-66), inside `max-w-[480px]`. Toggles use the existing `Checkbox` (no Switch component exists).

**Action pattern** (set-book-cap.ts):
```typescript
"use server";
export async function setBookCapAction(input: unknown): Promise<SetBookCapResponse> {
  const user = await requireUser();
  const parsed = SetBookCapInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid", message: parsed.error.issues[0]?.message ?? "..." };
  ...
  try { await upsertMemberBookCap({ userId: user.userId, ... now: new Date() }); }
  catch (err) { if (isBookCapsTableMissing(err)) return { status: "unavailable", message: "... the database update hasn't been applied." }; throw err; }
  revalidatePath("/"); revalidatePath("/settings");
```
**Upsert** (bookCaps.ts:44-56): `.insert(...).values(...).onConflictDoUpdate({ target: [...], set: {...} })`. For low-profile the target is `userLowProfileSettings.userId`.

---

### `src/components/NoSweatRiskAdvisory.tsx`

**Analog:** `src/components/RiskAdvisory.tsx` (17 lines): `Alert` + `AlertDescription` with one shared source of copy.
```tsx
import { Alert, AlertDescription } from "@/components/ui/alert";
export function RiskAdvisory() {
  return (<Alert><AlertDescription>...</AlertDescription></Alert>);
}
```
Make a sibling with the UI-SPEC copy ("You only get one shot at this at each book..."); use `text-warning` + `TriangleAlert` for D-22 specific warnings. Never mention multiple accounts, VPNs, or location.

---

### `src/ingestion/promos/noSweat.ts` + `exclusions.ts` change (utility, transform)

**Analog:** `src/ingestion/promos/exclusions.ts` (156 lines).

**Regex style + priority-ordered `classifyExclusion`** (lines 12-20, 120-156). The no_sweat line to REMOVE (line ~128), which currently runs BEFORE the parlay/SGP checks (the A-06 bug):
```typescript
const NO_SWEAT_RE = /\bno[- ]sweat\b/i;
...
if (DEPOSIT_RE.test(combined)) return "deposit";
if (NO_SWEAT_RE.test(combined) || (category && NO_SWEAT_RE.test(category))) return "no_sweat";
if (NOT_A_PROMO_RE.test(combined)) return "not_a_promo";
```
`classifyNoSweat({title,text,category})` is called by each scraper only after `classifyExclusion` returns `null`. Tighten line 16: `/\bnew (?:customers?|users?)\b|\bfirst[- ]bet\b|\bsign[- ]up\b/i`; drop the bare `first[- ]bet`. Guard with a fixture-sweep test over the existing 12 fixture files.

**Test analog:** `exclusions.test.ts:188-197` (the FEED-02 / A-12 regression text):
```typescript
classifyExclusion({
  title: "NFL London No Sweat",
  text: "MAX REWARD: $10\n2. Opt-In and receive a No Sweat Token for the London HOU Texans vs JAX Jaguars game on 10/18\n5. If your qualifying bet loses, receive your stake back in the form of a Bonus Bet",
})  // currently toBe("no_sweat"); must be rewritten, since classifyExclusion will now return null
```
This existing test (and the neighbouring `classify("50% Profit Boost", "... No-sweat? Boosted winnings paid in cash.")` assertion at line ~196) will fail after the change and must be rewritten in the same task.

---

### `src/ingestion/promos/books/draftkings.ts` (`buildNoSweatCandidate`)

**Analog:** the existing candidate return at lines ~360-400:
```typescript
const claimRequired: ScrapedPromo["claimRequired"] = entry.isOptInPromotion === true || OPT_IN_TEXT_RE.test(text) ? "opt_in" : null;
return {
  bookKey: "draftkings", externalId: String(entry.promotionId),
  promoType: "profit_boost",           // hard-coded (A-07); no_sweat builder uses "no_sweat"
  title: truncate(title, 200), rawText: truncate(`${title}\n${text}`, 2000), sourceUrl: LIST_URL,
  sportKeyHint, scopeText, teamsText, ...(gamesText ? { gamesText } : {}), windowStart, windowEnd, expiresAt,
  eligibleMarketTypes: [...PROMO_MARKET_TYPES], pinned: null,
  boostPercent, boostedOddsAmerican: null, baseOddsAmerican: null, bonusAmount: null, maxStake, maxWinnings, winningsCapKind: WINNINGS_CAP_KIND, ...
```
Reuse `sportFromText`, `sportFromTeamPair`, game/scope parsing in the lines above (~350-366). No-sweat variant: `bonusAmount` = refund cap, `boostPercent: null`, `maxStake: null`, `maxWinnings: null`, `winningsCapKind: null`. Must bypass the `MENTIONS_BOOST_OR_BONUS_RE` / `BOOST_PERCENT_RE` gates (otherwise `not_a_promo`). Racing "Bet Back with Portnoy!" (category "No Sweat", Crown Cash) must stay skipped (regression test on `draftkings-promos-2026-09-28.json`).

---

### `src/ingestion/promos/reconcile.ts` (disagreement rule, A-05)

**Analog:** itself, lines ~225-262 (read above). Insert the no_sweat rule between the `droppedFields` check (line ~220) and the `disagrees && confidence === "high"` reader-wins branch (line ~237):
```typescript
if (reading.droppedFields.length > 0) { return { kind: "review", skip: buildReviewSkip(entry, reading, "guard_drop", {...}, fallbackSourceUrl), why: "guard_drop" }; }
// NEW: exactly one of candidate.promoType / reading.kind === "no_sweat" -> review "disagreement" regardless of confidence
const disagrees = (reading.kind as PromoType) !== candidate.promoType || moneyDiffers(...) ...
if (disagrees && reading.confidence === "high") { ...reader_preferred... }
```
Use the same `buildReviewSkip(entry, reading, "disagreement", { partial: candidate, dedupeKey: promoDedupeKey(candidate) }, fallbackSourceUrl)` return shape. Add optional structured `evidence.readings` for the side-by-side UI (D-15).

**`reviewTriage.ts`:** `CLEAR_SKIP_REASONS` (line 41-) contains `"no_sweat"`; `REVIEW_SKIP_REASONS` (line 54-58) is `unrecognized | unsupported_sport | schema_invalid`. Remove `no_sweat` from clear, add `no_sweat_cash` to review. `SKIP_REASONS` also feeds the reader prompt text, so change it together with the `PROMO_READER_PROMPT_VERSION` bump (currently `2026-10-16.2`).

---

### Queue UI: `QueueItemCard.tsx` / `ClassifyQueueCard.tsx` (DisagreementCard)

**Analog:** `QueueItemCard.tsx` lines 1-50: per-action `useTransition`, server-action imports (`confirmPromoMatch`, `correctPromoMatch`, `enterPromoCaps`), shared inline error line, `onChanged` refetch. Add a `no_sweat` third classify target to `classify-promo.ts` / `reviewInput.ts` reusing `buildClassifyDraft` (in `reviewTriage.ts`; not fully read, planner must read).

---

## Shared Patterns

### Server action contract
**Source:** `src/app/actions/mark-promo-used.ts`, `set-book-cap.ts`, `set-promo-cap.ts`
**Apply to:** every new action (`track`, `untrack`, `settle`, `complete-refund`, `set-low-profile`)
- `"use server"`; `const user = await requireUser();` is the literal first statement.
- Input is a `z.strictObject` with no `userId`; use `safeParse`, return `{ status: "invalid" }` / `{ status: "invalid"; message }`.
- Response is a discriminated union on `status`; missing-table returns `{ status: "unavailable", message }`.
- Money values are 2dp decimal strings; the server recomputes and only compares client numbers (`isSameDisplayedProfit`).
- `revalidatePath("/")` after the write (and `/settings` for settings).
- IDOR guard: unknown/other-user/expired ids return one generic `not_found` (`set-promo-cap.ts` via `getCapEditablePromo` + `promoVisibilityCondition`).

### Client action wrapper
**Source:** `MarkUsedButton.tsx`
**Apply to:** all new client buttons/forms
`safeAction(() => action(...), "actionName")` -> `if (!call.ok) setErrorMessage(ACTION_FAILED_MESSAGE)`; `useTransition` per control; inline `<p role="alert" className="text-sm text-destructive">`; `event.stopPropagation()` inside collapsible rows.

### Leak prevention (A-01, FEED-04)
**Source:** `src/db/promos.ts` `getActivePromos` + `types.ts`
**Apply to:** all plans touching ranking, recording, stats
Structural: `GuaranteedPromoType` narrowing + SQL `promo_type <> 'no_sweat'` in `getActivePromos`; `buildFunnelPromosQuery` (`profitHistory.ts:50-62`) and `buildDailyProfitHistoryQuery` get the same exclusion. Do not edit `memberFeedRecording.ts`, `morningObserve.ts`, `promoObservations.ts` beyond type fallout. Completion row is written at settle time so `dashboardTotals.ts:46-53` and `profitSeries.ts:85-87` need no change. Add invariant tests (a no-sweat in the DB changes none of dashboard/grey-line/stats outputs).

### Exhaustive promo-type switches (D-19)
**Source:** `types.ts` `assertNever`
**Apply to:** the A-02 file list (types.ts, rankPromoHedges.ts, pairPromos.ts:254, promoRowDto.ts, pairRowDto.ts, doneSnapshot.ts, reconcile.ts, reviewTriage.ts, scraped.ts, classify-promo.ts, set-promo-cap.ts, get-promos.ts, PromoRow.tsx, AddPromoForm.tsx, addPromoDraft.ts, buildAddedPromo.ts, duplicateHint.ts, describe.ts, leagueWideAltTargets.ts, altSpreads.ts, yourCap.ts, addedPromoPipeline.ts, dailyHistory.ts). Let the compiler list them after widening `PROMO_TYPES`. Note `set-promo-cap.ts:44` already has `if (promo.promoType !== "profit_boost")` (safe as is).

### Missing-table degradation
**Source:** `src/db/bookCaps.ts:11-40`, `src/db/undefinedTable.ts`
**Apply to:** `trackedNoSweats.ts`, `lowProfile.ts` (migrations are applied manually with owner OK).

### Money math
decimal.js only; compare odds through `americanToDecimal`; display via `formatUsd`, `formatAmerican`, `formatPct`, `formatKickoff` from `@/lib/format`.

### Migration workflow
`git fetch` first (teammate dico1108 pushes migrations to main), `drizzle-kit generate`, commit SQL; next index is `0018`.

### Test conventions
Vitest, `src/**/*.test.ts`, node env, `@` alias; table-driven. Mock modules via `vi.hoisted` + `vi.mock` (see `get-opportunities.test.ts:1-50`). Component view-logic tests live as pure `*View.ts` files (e.g. `dashboardTotalsView.ts` + test), so put no-sweat view logic (waiting reminder, pastKickoff) in pure helpers.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| FanDuel no-sweat builder (`books/fanduel.ts`) | scraper | transform | No FanDuel no-sweat fixture; needs live recon task first (A-07). `classifyFanduelEntry` returns `not_a_promo` without a boost/bonus token |
| Bally Bet no-sweat builder (`books/ballybet.ts`) | scraper | transform | `isQualifyingTitle` (ballybet.ts:197-205) drops "Second Chance Bet" before any detail fetch; needs recon and fixture |
| Real DK "NFL London No Sweat" fixture | test fixture | file-I/O | Only the test string at `exclusions.test.ts:191-197` exists; no JSON fixture. Build a labelled reconstruction from the racing entry's JSON shape in `draftkings-promos-2026-09-28.json` |
| `TrackedNoSweatCard` correction panel (recalculate profit from edited stakes/odds) | component | request-response | No existing "edit amounts then recompute" UI; combine `SettingsBookCapsForm` inputs with a server recompute action |

## Metadata

**Analog search scope:** `src/app/actions`, `src/db`, `src/domain/promos`, `src/domain/hedge`, `src/domain/opportunities`, `src/components/{promos,opportunities,settings}`, `src/ingestion/promos`, `drizzle/`
**Files read this session:** about 22 (several only in targeted line ranges). Not read and flagged for the planner: `PromoDetails.tsx`, `DonePromoRow.tsx`, `UnprofitablePromoRow.tsx`, `OpportunitySection.tsx`, `OpportunitiesScreen.tsx`, `promoRowDto.ts`, `pairPromos.ts`, `readerPass.ts`, `promoReading.ts`, `verbatimGuard.ts`, `reviewTriage.ts` `buildClassifyDraft`, `feedContext.ts`, `memberPromoState.ts`, scrapers for FanDuel/Bally.
**Pattern extraction date:** 2026-10-22
