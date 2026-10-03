# Phase 5: Group-Added Promos - Pattern Map

**Mapped:** 2026-09-29
**Files analyzed:** 24 (12 new, 12 modified)
**Analogs found:** 22 / 24 (all paths relative to repo root)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/db/schema.ts` (add `addedByUserId` + index on `promos`) | model | CRUD | same file, `dismissedByUserId` + `index(...)` block (lines ~236, ~240-243) | exact |
| `drizzle/0010_*.sql` + meta (generated) | migration | batch | `drizzle/0009_done_snapshots.sql` | exact |
| `src/domain/promos/types.ts` (add `"deleted"` to `PROMO_STATUSES`, line 17) | config | - | same file | exact |
| `src/domain/promos/scope.ts` (add `{kind:"any"}`) | utility | transform | same file (`PromoScope`, `eventInScope`) | exact |
| `src/db/promos.ts` (`getActivePromos(now, viewerUserId?)`, `any` branch in `mapActivePromoRow`) | service | CRUD | same file lines 152-311 | exact |
| `src/db/feedContext.ts`, `src/db/memberPromoState.ts`, `src/app/actions/get-promos.ts` (pass user id) | service | request-response | same files (call sites: `feedContext.ts:48`, `memberPromoState.ts:43`, `get-promos.ts:111`) | exact |
| `src/db/promoTracking.ts` (`getProfitObservationsSince(since, viewerUserId)`, `getPromoCompletions` extra cols) | service | CRUD | same file lines 162-182 | exact |
| `src/db/feedContext.ts` `loadAvailableProfit(now, ownBookKeys, userId)` | service | CRUD | same file lines 18-23 | exact |
| `src/ingestion/promos/store.ts` (expire-unseen adds `isNull(addedByUserId)`) | service | batch | same file lines 578-590 | exact |
| `src/domain/promos/addedPromoInput.ts` | utility (zod) | validation | `src/domain/promos/reviewInput.ts` (ClassifyPromoInputSchema, MoneyFieldSchema, PinnedSelectionInputSchema) | exact |
| `src/domain/promos/buildAddedPromo.ts` | utility | transform | `src/app/actions/classify-promo.ts` lines 77-115 (builds `ScrapedPromo`, `Decimal.toFixed(2)`) | role-match |
| `src/domain/promos/duplicateHint.ts` | utility | transform | `src/domain/promos/scope.ts` `eventInScope` (pure overlap test) | partial |
| `src/db/addedPromos.ts` | service | CRUD | `src/db/promoReview.ts` `applyDismissal` (341-352), `scopeColumnsFrom` (132-170) | exact |
| `src/app/actions/add-promo.ts` | controller (server action) | request-response | `src/app/actions/classify-promo.ts` | exact |
| `src/app/actions/edit-promo.ts`, `expire-promo.ts`, `delete-promo.ts` | controller | request-response | `src/app/actions/dismiss-promo.ts` | exact |
| `src/app/actions/get-add-promo-options.ts` | controller | request-response | `src/app/actions/get-promos.ts` `correctionOptionsFor` (lines 43-66) | role-match |
| `src/components/promos/AddPromoForm.tsx` | component | request-response | `src/components/promos/ClassifyQueueCard.tsx` / `ReviewPanel.tsx` + `ScopePicker.tsx` | role-match |
| `src/components/promos/ExpirePromoDialog.tsx`, `DeletePromoDialog.tsx` | component | request-response | `src/components/promos/DismissPromoDialog.tsx` | exact |
| `src/components/promos/AddedPromoActions.tsx` | component | request-response | `src/components/promos/FlagMatchButton.tsx` / `MarkUsedButton.tsx` | role-match |
| `src/components/promos/PromosScreen.tsx`, `PromoRow.tsx`, `PromoDetails.tsx`, `DonePromoRow.tsx` (button, tag, hide actions) | component | request-response | same files | exact |
| `src/domain/promos/dto.ts`, `promoRowDto.ts`, `doneSnapshot.ts` (`addedByYou`, `sourceActive`) | utility | transform | same files | exact |
| Tests: `addedPromoInput.test.ts`, `buildAddedPromo.test.ts`, `duplicateHint.test.ts`, `add-promo.test.ts`, `added-promo-actions.test.ts`, `src/db/promos.test.ts`, store regression | test | - | `src/app/actions/get-promos.test.ts` (vi.hoisted mocks) | role-match |

## Pattern Assignments

### `src/db/schema.ts` (model) - add owner column
**Analog:** `promos` table, `src/db/schema.ts` lines ~236-243.
```typescript
dismissedByUserId: integer("dismissed_by_user_id").references(() => users.id, { onDelete: "set null" }),
...
(table) => [
  index("promos_status_idx").on(table.status),
  index("promos_book_key_idx").on(table.bookKey),
],
```
Add `addedByUserId: integer("added_by_user_id").references(() => users.id, { onDelete: "cascade" })` (cascade, NOT set null - set null would make a private promo public). Add `index("promos_added_by_user_id_idx").on(table.addedByUserId)`. Then `npm run db:generate`; applying via `npm run db:migrate` is a blocking owner-OK task.

### `src/db/promos.ts` (service) - visibility choke point + `any` scope
**Analog:** itself. Existing imports already include `and, eq, gt, isNull, or, sql`.

Scope branches in `mapActivePromoRow` (lines 162-179) - add a third branch:
```typescript
if (row.scopeKind === "event") { ...scope = { kind: "event", eventId, sportKey }; scopeLabel = `${row.awayTeam} @ ${row.homeTeam}`; }
else if (row.scopeKind === "sport_window") { ... }
else { console.warn(`getActivePromos: dropping promo ${row.id}, unknown scope_kind=${row.scopeKind}`); return null; }
```
Add `else if (row.scopeKind === "any") { scope = { kind: "any" }; scopeLabel = "Any game"; }`. Note pinned check at line 183 already rejects a pin when `scope.kind !== "event"`.

WHERE clause (lines 293-302) - add visibility + `any`:
```typescript
.where(and(
  eq(promos.status, "active"),
  sql`${promos.scopeKind} is not null`,
  or(isNull(promos.expiresAt), gt(promos.expiresAt, now)),
  or(
    and(eq(promos.scopeKind, "event"), sql`${promos.eventId} is not null`, gt(promos.eventCommenceTime, now)),
    and(eq(promos.scopeKind, "sport_window"), gt(promos.windowEnd, now)),
    // NEW: and(eq(promos.scopeKind, "any"), sql`${promos.expiresAt} is not null`, gt(promos.expiresAt, now)),
  ),
  // NEW: viewerUserId === undefined ? isNull(promos.addedByUserId)
  //      : or(isNull(promos.addedByUserId), eq(promos.addedByUserId, viewerUserId)),
))
```
Also add `addedByUserId` to the select and `ActivePromo` (`addedByYou: boolean`) and to `ActivePromoRow`. Default (no viewer) must stay scraped-only.

Callers to update (verified grep): pass session user id in `src/app/actions/get-promos.ts:111`, `src/db/feedContext.ts:48`, `src/db/memberPromoState.ts:43`. Leave `src/db/promoObservations.ts:32` and `scripts/promos-check.ts:42` on default.

### `src/domain/promos/scope.ts` (utility)
**Analog:** lines 14-23.
```typescript
export const PROMO_SCOPE_KINDS = ["event", "sport_window"] as const;
export type PromoScope =
  | { kind: "event"; eventId: string; sportKey: string }
  | { kind: "sport_window"; sportKey: string; windowStart: Date; windowEnd: Date };
```
Add `"any"` and `{ kind: "any" }`; make `eventInScope` return true for it and fix `enumerateScopeSelections` exhaustiveness (typecheck will flag). `ScopeGuess` is a separate type - leave unchanged. Extend `scope.test.ts`.

### `src/db/promoTracking.ts` (service) - stop private promo leaking into others' totals
**Analog:** lines 162-182 (select from `promoProfitObservations` where `gte(denverDate, sinceDate)`). Change signature to `(sinceDate, viewerUserId)`, inner join `promos` on `promoProfitObservations.promoId = promos.id`, and add `or(isNull(promos.addedByUserId), eq(promos.addedByUserId, viewerUserId))` to the WHERE. Update `loadAvailableProfit` (`feedContext.ts:18-23`) and its two callers (`get-opportunities.ts:53`, `get-promos.ts:140`). Update mocks in `get-promos.test.ts` / `get-opportunities.test.ts`.
`getPromoCompletions` (lines 27-40 select) also gains `promoAddedByUserId: promos.addedByUserId` and `promoStatus: promos.status` for Done-row action hiding. It already INNER JOINs `promos`, which is why soft delete is mandatory (D-11).

### `src/ingestion/promos/store.ts` (service) - Pitfall 4 guard
**Analog:** lines 578-590.
```typescript
const expireStatement = db.update(promos).set({ status: "expired" }).where(and(
  eq(promos.bookKey, bookKey),
  inArray(promos.status, ["active", "pending_review"]),
  notInArray(promos.dedupeKey, allDedupeKeys),
)).returning({ id: promos.id });
```
Add `isNull(promos.addedByUserId)` to the `and(...)` (import `isNull` already present on line 16). Add a regression test.

### `src/domain/promos/addedPromoInput.ts` (zod)
**Analog:** `src/domain/promos/reviewInput.ts`.
Imports/patterns to copy:
```typescript
import { z } from "zod"; import Decimal from "decimal.js";
// PinnedSelectionInputSchema (lines 69-98) - shape+half-point rules; currently module-private: export it.
// MONEY_PATTERN/MoneyFieldSchema (152-165), BoostPercentFieldSchema (191-210), MinOddsFieldSchema (167-172) - export these too.
// EventScopeInputSchema/SportDayScopeInputSchema (100-115) - strictObject, etEndDate optional.
export const ClassifyPromoInputSchema = z.discriminatedUnion("promoType", [ClassifyProfitBoostInputSchema, ClassifyBonusBetInputSchema]); // 238-241
```
Every schema is `z.strictObject`, no `userId` field (IDOR discipline, comment at lines 7-16). Reuse (export) these private consts rather than duplicating. Add `bookKey`, `maxStake` required for boost (CR-04), `expiresAtEtDate` etc. per RESEARCH code example. For "Boosted odds" mode require `scope.kind === "event"` with pin (RESEARCH Pitfall 5).

### `src/app/actions/add-promo.ts` (server action)
**Analog:** `src/app/actions/classify-promo.ts` (full flow) and `correct-promo-match.ts` (pin resolution).
```typescript
"use server";
import Decimal from "decimal.js"; import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { getCachedEvents, getCachedExtendedEvents } from "@/db/queries";
import { resolveMemberScope } from "@/domain/promos/memberScope";
import { ScrapedPromoSchema, type ScrapedPromo } from "@/domain/promos/scraped";
import { PROMO_MARKET_TYPES } from "@/domain/promos/types";

export async function classifyPromo(input: unknown): Promise<PromoReviewResponse> {
  const user = await requireUser();                       // literal first statement
  const parsed = ClassifyPromoInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
  ...
  const [{ events: moneylineEvents }, { events: extendedEvents }] = await Promise.all([getCachedEvents(), getCachedExtendedEvents()]);
  const scopeResult = resolveMemberScope(
    data.scope.kind === "event" ? { kind: "event", eventId: data.scope.eventId }
      : { kind: "sport_day", sportKey, etDate, ...(etEndDate !== undefined ? { etEndDate } : {}) },
    { moneyline: moneylineEvents, extended: extendedEvents }, now);
  if (scopeResult.status === "stale") return { status: "stale", message: scopeResult.message };
  if (scopeResult.status === "invalid") return { status: "invalid" };
  const boostPercent = new Decimal(data.boostPercent).toFixed(2);
  const validated = ScrapedPromoSchema.safeParse(completed); if (!validated.success) return { status: "invalid" };
```
Pin resolution (`correct-promo-match.ts` lines 83-101):
```typescript
const sel: PromoSelection = { eventId: event.id, marketType, line, side };
const resolved = marketType === "moneyline"
  ? (resolveSelection(moneylineEvents, sel) ?? resolveSelection(extendedEvents, sel))
  : resolveSelection(extendedEvents, sel);
if (!resolved) return SELECTION_INVALID;
```
Extras: verify `bookKey` is in `getUserBookKeys(user.userId)` (D-08); insert via `src/db/addedPromos.ts` with `addedByUserId: user.userId`, `status:"active"`, `autoMatched:false`, `dedupeKey: \`added:${crypto.randomUUID()}\``, `sourceUrl:"user-added"`, `rawText:""`; end with `revalidatePath("/")`. Reuse `PromoReviewResponse` from `./confirm-promo-match` for the `{status: "ok"|"invalid"|"stale"|"conflict"}` shape.

### `src/db/addedPromos.ts` (service) + `edit/expire/delete-promo.ts`
**Analog:** `applyDismissal` in `src/db/promoReview.ts` 341-352 and `src/app/actions/dismiss-promo.ts`.
```typescript
const rows = await db.update(promos)
  .set({ status: "dismissed", dismissedByUserId: userId, reviewedAt: now })
  .where(and(eq(promos.id, promoId), eq(promos.status, "pending_review")))
  .returning({ id: promos.id });
return rows.length === 1;
```
Action wrapper (dismiss-promo.ts 19-34):
```typescript
const user = await requireUser();
const parsed = PromoIdInputSchema.safeParse(input);
if (!parsed.success) return { status: "invalid" };
const ok = await applyDismissal({ promoId: parsed.data.promoId, userId: user.userId, now: new Date() });
if (!ok) return CONFLICT;
revalidatePath("/"); return { status: "ok" };
```
Apply with WHERE `and(eq(id), eq(addedByUserId, userId), eq(status,"active"))`; expire sets `status:"expired"`; delete sets `status:"deleted"` (never `db.delete`) and also deletes that promo's `promoProfitObservations`. Use a "not found" message (not "someone else") to avoid leaking existence. Reuse `PromoIdInputSchema` (reviewInput.ts 17-19). Export/copy `scopeColumnsFrom` (promoReview.ts 132-170, currently module-private) for the insert/edit scope columns; extend for `any` (scopeKind "any", all other scope columns null). neon-http has no interactive transactions: use single statements or `db.batch`.

### `src/app/actions/get-add-promo-options.ts`
**Analog:** `get-promos.ts` `correctionOptionsFor` lines 43-66.
```typescript
const [{ events: moneylineEvents }, { events: extendedEvents }] = await Promise.all([getCachedEvents(), getCachedExtendedEvents()]);
return listCorrectionOptions({ moneyline: moneylineEvents, extended: extendedEvents }, { now });
```
Precede with `requireUser()`; also return the user's usable books (`getUsableUserBooks` in `src/db/queries.ts`, or `getUserBookKeys` + `COLORADO_BOOKS` labels as in `get-promos.ts` imports). Zero Odds API credits.

### UI: `AddPromoForm.tsx`
**Analog:** `ScopePicker.tsx` (props at lines 69-76) plus `ClassifyQueueCard.tsx`/`ReviewPanel.tsx` for the field/error idiom (read these when implementing; they hold the classify boost/bonus field layout).
```tsx
<ScopePicker idPrefix="add" draft={draft} onDraftChange={setDraft} options={options} disabled={isPending} />
```
Draft state/payload builders live in `src/domain/promos/scopeDraft.ts`; reuse them for the scope payload. Use `useTransition` + server-action call, same as dialog below. Follow 05-UI-SPEC for copy/layout.

### UI: `ExpirePromoDialog.tsx` / `DeletePromoDialog.tsx`
**Analog:** `src/components/promos/DismissPromoDialog.tsx` (copy nearly verbatim).
```tsx
const [isPending, startTransition] = useTransition();
function confirmDismiss() { startTransition(async () => { const outcome = await dismissPromo({ promoId }); onOutcome(outcome); }); }
<AlertDialog open={open} onOpenChange={(next) => { if (!next && !isPending) onCancel(); }}>
  <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>..</AlertDialogTitle><AlertDialogDescription>..</AlertDialogDescription></AlertDialogHeader>
  <AlertDialogFooter>
    <AlertDialogCancel variant="ghost" onClick={onCancel}>Cancel</AlertDialogCancel>
    <AlertDialogAction variant="destructive" onClick={confirmDismiss} disabled={isPending}>{isPending ? "Dismissing…" : "Dismiss"}</AlertDialogAction>
```
Imports from `@/components/ui/alert-dialog`. Keep the `eslint-disable-next-line react/no-unescaped-entities` comment where copy has apostrophes.

### `PromosScreen.tsx`
**Analog:** itself. Props `onPromosChanged`, `promosVersion`, `recomputeKey`, view `"active" | "done" | "review"` (lines 26-49). Put the Add promo button at the top of the Active tab; after add/edit/expire/delete call `onPromosChanged()` so Opportunities refetches too.

### Tests
**Analog:** `src/app/actions/get-promos.test.ts` lines 1-60: `vi.hoisted` mock fns + `vi.mock("@/lib/session", ...)`, `vi.mock("@/db/promos", ...)`, then import the action after mocks. Update existing mocks (`getProfitObservationsSince`, `getActivePromos` args) for the changed signatures.

## Shared Patterns

### Auth / IDOR
**Source:** `src/app/actions/dismiss-promo.ts`, `classify-promo.ts`. **Apply to:** every new action. `requireUser()` literal first statement; strict zod with no user id; acting user only from session; ownership in the SQL WHERE with row-count check.

### Server-side scope validation
**Source:** `src/domain/promos/memberScope.ts` `resolveMemberScope` (returns `ok | stale | invalid`). **Apply to:** add-promo, edit-promo. Never trust client bounds.

### Money
**Source:** `classify-promo.ts` lines 77-82 (`new Decimal(x).toFixed(2)`), `reviewInput.ts` MoneyFieldSchema. **Apply to:** input schema, buildAddedPromo. No float math.

### Synthetic `parsed` payload
**Source:** `classify-promo.ts` 94-115 + `ScrapedPromoSchema.safeParse` (`src/domain/promos/scraped.ts`). **Apply to:** buildAddedPromo. `mapActivePromoRow` re-validates `parsed` and silently drops invalid rows, so validate before insert.

### Response shape
**Source:** `PromoReviewResponse` in `src/app/actions/confirm-promo-match.ts`. **Apply to:** all four actions.

## No Analog Found

| File | Role | Reason |
|---|---|---|
| `src/domain/promos/duplicateHint.ts` | utility | No existing draft-vs-promo overlap comparison; use `eventInScope` in `scope.ts` for event/window overlap logic and RESEARCH Pitfall 9 |
| Soft delete (`status='deleted'`) and observation cleanup | service | No existing soft-delete; nearest is `applyDismissal` status flip. Add `"deleted"` to `PROMO_STATUSES` and grep `Record<PromoStatus, ...>` (`lifecycle.ts`, `store.ts`) for exhaustiveness |

## Metadata

**Analog search scope:** `src/db`, `src/app/actions`, `src/domain/promos`, `src/components/promos`, `src/ingestion/promos`, `scripts`
**Files scanned:** ~15 read in full or in targeted ranges (ClassifyQueueCard, ReviewPanel, FlagMatchButton, MarkUsedButton, scopeDraft.ts not read; open them at implementation time)
**Pattern extraction date:** 2026-09-29
