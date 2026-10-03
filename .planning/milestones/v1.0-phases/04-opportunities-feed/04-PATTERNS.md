# Phase 4: Opportunities Feed - Pattern Map

**Mapped:** 2026-09-29
**Files analyzed:** 32 (new/modified)
**Analogs found:** 30 / 32 (2 partial: pair solver math, exact-matching DP have no code analog; use RESEARCH.md)

All paths relative to `/Users/bentorio/Desktop/Personal Projects/promoprofit`.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/domain/hedge/pairMath.ts` | utility (solver) | transform | `src/domain/hedge/profitBoost.ts` | role-match (new formula) |
| `src/domain/hedge/pairMath.test.ts` | test | transform | `src/domain/hedge/profitBoost.test.ts` | exact |
| `src/domain/promos/pairPromos.ts` | service (pure domain) | transform/batch | `src/domain/promos/rankPromoHedges.ts` | role-match |
| `src/domain/promos/pairPromos.test.ts` | test | transform | `src/domain/promos/rankPromoHedges` tests / `rankArbs.test.ts` | role-match |
| `src/domain/promos/pairRowDto.ts` | utility (DTO mapper) | transform | `src/domain/promos/promoRowDto.ts` | exact |
| `src/domain/promos/pairSnapshot.ts` | model (zod snapshot) | transform | `src/domain/promos/doneSnapshot.ts` | exact |
| `src/domain/opportunities/types.ts`, `pick.ts` (+test) | utility | transform | `src/domain/promos/profitTotals.ts` (pure, Decimal, no I/O) | partial |
| `src/domain/promos/profitTotals.ts` (add `sumPortfolioProfit`) | utility | transform | same file `sumOwnBookProfit` | exact |
| `src/domain/arb/build.ts` (extract `buildArbMarkets`, `toArbResultDTO`) | utility | transform | `src/app/actions/find-arbs.ts` lines 29-92 (move) | exact (extraction) |
| `src/domain/promos/rankPromoHedges.ts` (export `candidatesFor`, `passesBaseMinOdds`) | modify | - | itself | - |
| `src/db/memberPairState.ts` | service (db read/compute) | request-response | `src/db/memberPromoState.ts` | exact |
| `src/db/promoTracking.ts` (add `markPairDone`, `unmarkPairDone`) | service (db write) | CRUD | same file `markPromoDone`/`unmarkPromoUsed` | exact |
| `src/db/feedContext.ts` (shared read steps) | service | request-response | `src/app/actions/get-promos.ts` lines 124-208 (extract) | role-match |
| `src/app/actions/get-opportunities.ts` | server action | request-response | `src/app/actions/get-promos.ts` + `find-arbs.ts` | exact |
| `src/app/actions/mark-pair-done.ts` | server action | CRUD | `src/app/actions/mark-promo-used.ts` | exact |
| `src/app/actions/get-opportunities.test.ts`, `mark-pair-done.test.ts` | test | request-response | `get-promos.test.ts`, `mark-promo-used.test.ts` | exact |
| `src/domain/promos/reviewInput.ts` (add `MarkPairDoneInputSchema`) | model (zod) | - | same file `MarkPromoDoneInputSchema` | exact |
| `src/lib/persistentState.ts` (add `STORAGE_KEYS.sortMode`) + `src/lib/sortPreference.ts` | utility | file-I/O (localStorage) | same file | exact |
| `src/components/AppShell.tsx` (4 tabs, default, promosVersion, sort, review count) | component | event-driven | itself | - |
| `src/components/opportunities/OpportunitiesScreen.tsx` | component | request-response | `src/components/promos/PromosScreen.tsx` | exact |
| `src/components/opportunities/OpportunitySection.tsx` | component | transform | `PromosScreen` list block + `ScrapeStatusPanel` card | partial |
| `src/components/opportunities/PairCard.tsx` / `PairDetails.tsx` | component | request-response | `src/components/promos/PromoRow.tsx` / `PromoDetails.tsx` | exact |
| `src/components/opportunities/SortSwitch.tsx` | component | event-driven | `src/components/ui/toggle-group.tsx` + `usePersistentString` (ArbForm precision toggle) | role-match |
| `src/components/promos/MarkPairDoneButton.tsx` (or mode in MarkUsedButton) | component | CRUD | `src/components/promos/MarkUsedButton.tsx` | exact |
| `src/components/promos/DonePairRow.tsx` | component | request-response | `src/components/promos/DonePromoRow.tsx` | exact |
| `src/components/promos/ReviewPanel.tsx` | component | request-response | `PromosScreen.tsx` lines 98-117 (move) | exact |
| `src/components/promos/PromosScreen.tsx` (Active/Done/Review, sort, no ProfitSummary) | modify | - | itself (nested Tabs already at 119-131) | - |
| `src/components/tools/ToolsScreen.tsx` | component | - | `PromosScreen` nested `Tabs` | role-match |
| Best promos rows / Best arbs rows | component | - | reuse `PromoRow.tsx`, `ArbRow.tsx` verbatim | reuse |

## Pattern Assignments

### `src/domain/hedge/pairMath.ts` (utility, transform)

**Analog:** `src/domain/hedge/profitBoost.ts`. Copy conventions; the two-leg formula itself is from RESEARCH.md Pattern 1 (no code analog).

**Imports + decimal discipline** (lines 1-3, 68-98):
```typescript
import Decimal from "decimal.js";
import { americanToDecimal } from "./americanOdds";
import type { StakePrecision } from "./arbMath";

const LocalDecimal = Decimal.clone({ precision: 40 });
function clean(value: Decimal): Decimal { return value.toDecimalPlaces(20, Decimal.ROUND_HALF_UP); }
function floorCents(value: Decimal): Decimal { return clean(value).toDecimalPlaces(2, Decimal.ROUND_DOWN); }
function dedupe(values: Decimal[]): Decimal[] { /* lines 88-92 */ }
function clamp(value: Decimal, min: Decimal, max: Decimal): Decimal { /* 94-98 */ }
```
`clean`, `floorCents`, `dedupe`, `clamp`, `promoPayoutRaw` (176-200) and `kinkStake` (203-216) are module-private today. Export them (or copy with the same comment) rather than re-deriving. Reuse `effectiveBoostedDecimal` (line 110, exported), `WinningsCap`/`WinningsCapKind` types (35-40), `decimalToAmericanDisplay` (149).

**Core loop pattern** (lines 292-334): enumerate candidate stakes, cross-seed the other leg, floor payouts, tie-break by higher profit then lower `totalStaked` then lower second stake:
```typescript
const isBetter =
  best === null ||
  guaranteedProfit.gt(best.guaranteedProfit) ||
  (guaranteedProfit.equals(best.guaranteedProfit) && totalStaked.lt(best.totalStaked)) ||
  (guaranteedProfit.equals(best.guaranteedProfit) && totalStaked.equals(best.totalStaked) && hedgeStake.lt(best.hedgeStake));
```
**Validation/errors** (lines 229-259, 263-269): `RangeError` for bad maxStake/cap; min-odds gate returns `null` (`boostedDecimalOdds.lt(minDecimalOdds)`).
**ROI** (344-347): `profit.dividedBy(totalStaked).times(100).toDecimalPlaces(2, Decimal.ROUND_DOWN)`. For boost+bonus, denominator is boost stake only (D-24).
**Display filter** (372-378): wrapper returns `null` when `guaranteedProfit.lte(0)`. Mirror as Unfiltered + filtered pair.
**Bonus leg** win payout: `floorCents(B*(Oy-1))`, see `src/domain/hedge/bonusBet.ts` `calculateBonusBetHedge` (line 58) for the stake-not-returned convention.

### `src/domain/hedge/pairMath.test.ts` (test)

**Analog:** `src/domain/hedge/profitBoost.test.ts` (fixture-table style at ~line 227 `it(fixture.name, ...)`; `describe("calculateProfitBoostHedge validation")` for RangeError cases). Table-drive V1-V12 from RESEARCH.md; add seeded-PRNG (no `Math.random`) oracle property test comparing PROFIT only (Pitfall 1). Vitest node env, `include: ["src/**/*.test.ts"]`.

---

### `src/domain/promos/pairPromos.ts` (service, pure domain)

**Analog:** `src/domain/promos/rankPromoHedges.ts` (pure, zero I/O, generic over `P extends RankablePromo`).

**Imports** (lines 1-14): same block; add `pairMath` solvers.
**Reuse (must export first):** `candidatesFor(promo, opts)` (line 286-294) and `passesBaseMinOdds(promo, quote)` (130-138). `evaluateBoostCandidate` (140-199) is the template for leg-option rules: unpinned needs live own-book quote; published boosted odds honored only when pinned:
```typescript
const promoBookQuote = selection.promoSideQuotes.find((q) => q.bookKey === promo.bookKey) ?? null;
const baseOddsAmerican = promoBookQuote?.oddsAmerican ?? (isPinned ? promo.baseOddsAmerican : null);
const boostedOddsAmerican = isPinned ? promo.boostedOddsAmerican : null;
```
Convert promo strings with `new Decimal(promo.maxStake)`; winningsCap `{ kind, amount: new Decimal(...) }` (lines 160-163).
**RangeError guard** (178-184): `catch (err) { if (err instanceof RangeError) { console.warn(...); return null; } throw err; }`.
**Deterministic tie-break** (`isBetterCandidate`, 261-283): profit desc, ratio desc, commence asc, eventId, `MARKET_ORDER`/`SIDE_ORDER` maps (70-71). Copy `MARKET_ORDER`/`SIDE_ORDER`; extend tie-break with lower promo ids.
**Sort/return shape** (`rankPromoHedges`, 335-354): ends with stable sort by profit desc, commence asc, id asc.
**Single-profit lookup for D-08:** build `Map<promoId, Decimal>` from `rankPromoHedges(...)` output (`guaranteedProfitOfOpportunity`, line 325). Missing = `new Decimal(0)`.
**Market key + opposite side:** no existing helper; spread key = HOME team signed point (`side==="home" ? line : -line`); see `ResolvedSelection` (`src/domain/promos/selection.ts` lines 21-37) fields `marketType, line, side, sidePoint, oppositePoint`. Same-book exclusion mirrors `findBestArbPair` in `src/domain/hedge/rankArbs.ts` (line 53).
**No analog:** exact matching bitmask DP (D-10) and the greedy fallback; follow RESEARCH.md Pattern 3.

### `src/domain/promos/pairRowDto.ts` (DTO mapper)

**Analog:** `src/domain/promos/promoRowDto.ts` (pure, no `src/db` imports).
**Imports** (1-7):
```typescript
import Decimal from "decimal.js";
import { marketBadgeLabel, selectionLabel } from "@/domain/arb/labels";
import { formatAmerican, formatUsd } from "@/lib/format";
import { getSportLabel } from "@/config/sports";
```
**Mapping pattern** (43-139): `.toFixed(2)` on every Decimal, `bookNames.get(k) ?? k`, `rowKey` prefix (`pair-${idA}-${idB}`), `worstCase: netA !== netB`, `hasPromoBook`. Cap notes: reuse `capNoteFor` (24-36; export it) for boost legs; bonus note copy from UI-SPEC. Include `rateLabel: "ROI"`, `separateProfitA/B`, `gain` (pair - a - b via Decimal). Reuse `promoTitle` (142).

### `src/domain/promos/pairSnapshot.ts` (model)

**Analog:** `src/domain/promos/doneSnapshot.ts`.
**Schema style** (16-93): `z.object`, `version: z.literal(1)`, `precision: z.enum(["whole","cents"])`, `oddsFetchedAt: z.object({ moneyline: z.string().nullable(), spreadsTotals: z.string().nullable() })`. Add `kind: z.literal("pair")` (+ `"pair_member"` schema `{version:1, kind:"pair_member", pairedWithPromoId}`).
**Read-side fallback** (`toDonePromoDTO`, 237-274): try `DonePairSnapshotSchema.safeParse` FIRST, then the single schema, then `legacy("Saved details unavailable", c.profitExtracted)`. `pair_member` rows must be filtered out of the Done list (and out of the count shown in the Done tab label).
**Build** (`buildDoneSnapshot`, 114-183): returns `{ snapshot, profitExtracted: new Decimal(x).toFixed(2) }`. `sumProfitExtracted` (277-279) needs NO change (member row stores `"0.00"`).
**Concurrency check** (282-285): reuse `isSameDisplayedProfit`; add stake comparison (D-23) with `new Decimal(a).equals(b)`.
**Compile-time guard trick** (line 65): `export const _rowShapeGuard = (r: SnapshotRow): PromoRowDTO => r;` mirror for the pair DTO.

### `src/domain/promos/profitTotals.ts` (add `sumPortfolioProfit`)

**Analog:** same file, `sumOwnBookProfit` (lines 24-32):
```typescript
export function sumOwnBookProfit(rows: OwnBookProfitRow[], usedPromoIds: ReadonlySet<number>): string {
  let total = new Decimal(0);
  for (const row of rows) {
    if (!row.hasPromoBook) continue;
    if (usedPromoIds.has(row.promoId)) continue;
    total = total.plus(new Decimal(row.guaranteedProfit));
  }
  return total.toFixed(2);
}
```
Add `sumPortfolioProfit(singles, pairs)` = singles not in any chosen pair + each pair once. Extend `profitTotals.test.ts` (table style, e.g. "sums exactly with decimal.js (0.10 + 0.20 = 0.30)"). Do NOT touch `summarizeAvailableProfit` (D-22).

### `src/domain/arb/build.ts` (extraction)

**Analog/source:** `src/app/actions/find-arbs.ts` lines 29-92 (`toLegDTO`, `toArbResultDTO`, `buildMarkets`, `WINDOW_DAYS = 7`). Move verbatim to a non-`"use server"` module (a server-actions file may only export async functions; same reason `promoRowDto.ts` was extracted, see its header comment). `find-arbs.ts` then imports from it; keep `find-arbs.test.ts` green. Imports to carry: `extractTwoWayMoneylines` (`@/domain/hedge/marketFilter`), `extractTwoWaySpreadsAndTotals` (`spreadsTotalsFilter`), `rankArbs, moneylineToArbMarket` (`rankArbs.ts`), `marketBadgeLabel, selectionLabel`, `getSportLabel`.

### `src/db/memberPairState.ts`

**Analog:** `src/db/memberPromoState.ts` (whole file, 88 lines). Copy structure:
```typescript
const activePromos = await getActivePromos(now);
const promo = activePromos.find((p) => p.id === promoId);
if (!promo) return { kind: "not_active" };
const userBookSet = new Set(await getUserBookKeys(userId));
const [hedgeBookKeys, bonusBooks, { events: moneylineEvents, fetchedAt: moneylineFetchedAt }, { events: extendedEvents, fetchedAt: spreadsTotalsFetchedAt }] =
  await Promise.all([getHedgeBookKeys(userBookSet), getBonusBooks(), getCachedEvents(), getCachedExtendedEvents()]);
const bookNames = new Map(bonusBooks.map((b) => [b.key, b.displayName]));
const rankOpts = { moneylineEvents, extendedEvents, hedgeBookKeys: new Set(hedgeBookKeys), precision, now };
```
Return discriminated union (`not_active | pair`), take both promos, `findPairCandidates([A, B])`, pick best market for exactly that pair. Both promos must also not be in the member's completions (pre-check; do NOT use onConflictDoNothing). Terms built as `DonePromoTerms` (lines 60-72). Add parity test (feed pair == recompute) like the one referenced in `get-promos.test.ts`.

### `src/db/promoTracking.ts` (add `markPairDone` / `unmarkPairDone`)

**Analog:** same file lines 47-69. Single multi-row insert (neon-http has no interactive transactions; see `recordProfitObservations` lines 82-104 for a multi-row `.values(entries.map(...))` example):
```typescript
await db.insert(promoCompletions).values([
  { userId, promoId: idA, completedAt: now, snapshot: pairSnapshot, profitExtracted },
  { userId, promoId: idB, completedAt: now, snapshot: memberSnapshot, profitExtracted: "0.00" },
]); // NO .onConflictDoNothing() (would silently drop half the pair)
```
Undo: read the row's snapshot for the partner id, then one `db.delete(promoCompletions).where(and(eq(promoCompletions.userId, userId), inArray(promoCompletions.promoId, [a, b])))` (import `inArray` from `drizzle-orm`; existing import line 1 has `and, desc, eq, gte, sql`). Filter by `userId` always (T-igk-03).

### `src/app/actions/get-opportunities.ts`

**Analog:** `src/app/actions/get-promos.ts` (composition) + `find-arbs.ts` (arb branch). Header/first statement (get-promos 96-104):
```typescript
"use server";
export async function getPromos(input: unknown): Promise<GetPromosResponse> {
  const user = await requireUser();          // literal first statement
  const parsed = PromosInputSchema.safeParse(input);
  if (!parsed.success) return { status: "invalid" };
```
Reuse verbatim: `Promise.all([getActivePromos(now), getPromoCompletions(user.userId), getUserBookKeys(user.userId)])` (125-130); `doneIds`/`feedPromos = activePromos.filter(p => !doneIds.has(p.id))` (136-138); `hedgeBookKeys/bonusBooks/getCachedEvents/getCachedExtendedEvents` Promise.all (175-181); no-odds check `oddsFetchedAt === null && extendedOddsFetchedAt === null` (185); `rankOpts` (202-208); `rows = opportunities.map(o => toPromoRowDTO(o, bookNames, userBookSet))` (270-272); totals via sumOwnBookProfit -> swap for `sumPortfolioProfit` (276-279); `loadAvailableProfit` (40-45, extract to shared helper, do not export from a "use server" file). Filter promos: `rows.filter(r => r.hasPromoBook)` (D-16).
Arb branch (find-arbs 105-131): `ArbInputSchema` validated input, `buildArbMarkets(..., allowedBookKeys = new Set(hedgeBookKeys))`, `rankArbs(markets, { totalStake: new Decimal("100"), precision })`; fixed $100 stake (D-21), both legs filtered to `userBookSet` (D-18). Never import the odds-fetch client (find-arbs header comment).
Zod input: `z.strictObject({ precision: z.enum(["whole","cents"]) })`, no userId.
**Note:** unlike get-promos, do not call `recordCurrentProfitObservations` from here (keep getPromos response shape stable; observations remain owned by getPromos, or extract if the profit summary must still refresh them).

### `src/app/actions/mark-pair-done.ts`

**Analog:** `src/app/actions/mark-promo-used.ts` (whole file). Copy exact structure: response union types (18-24), `requireUser()` first, strict schema `safeParse` -> `{status:"invalid"}`, `computeMemberPairState` -> `not_active` => `not_found`, compare profit (43-51) AND both stakes (D-23) -> `odds_changed` with message, build snapshot, one `markPairDone`, `revalidatePath("/")`, `unmarkPairDoneAction` mirroring lines 64-76:
```typescript
const currentGuaranteedProfit = state.kind === "hedge" ? state.row.guaranteedProfit : null;
if (!isSameDisplayedProfit(expectedGuaranteedProfit, currentGuaranteedProfit)) { /* odds_changed */ }
```
UI-SPEC odds-changed copy replaces the server message on the client; keep the server `message` field for parity.
**Input schema** (add to `src/domain/promos/reviewInput.ts` next to `MarkPromoDoneInputSchema`, lines 30-37):
```typescript
z.strictObject({
  promoIdA: z.number().int().positive(), promoIdB: z.number().int().positive(),
  precision: z.enum(["whole", "cents"]),
  expectedGuaranteedProfit: z.string().regex(/^-?\d+\.\d{2}$/),
  expectedStakeA: ..., expectedStakeB: ...,
}).refine(v => v.promoIdA !== v.promoIdB)
```

### Tests: `get-opportunities.test.ts`, `mark-pair-done.test.ts`

**Analogs:** `src/app/actions/get-promos.test.ts` (lines 1-50: `vi.hoisted` mock functions + `vi.mock("@/lib/session"| "@/db/promos" | "@/db/queries" | ...)`) and `mark-promo-used.test.ts` (lines 1-23):
```typescript
const { mockRequireUser, mockMarkPromoDone, ... } = vi.hoisted(() => ({ mockRequireUser: vi.fn(), ... }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/promoTracking", () => ({ markPromoDone: ..., unmarkPromoUsed: ... }));
```
Fixture rows: `hedgeRow`/`terms` objects at lines 25-73. Assert requireUser is called first, invalid input, no write on odds change, both rows written in one call.

### `src/lib/persistentState.ts` + `src/lib/sortPreference.ts`

**Analog:** same file. Add key at line 14-19:
```typescript
export const STORAGE_KEYS = { ..., arbPrecision: "promoprofit.arb.precision", sortMode: "promoprofit.opportunities.sort" } as const;
```
Consumers use `usePersistentString(STORAGE_KEYS.sortMode, "profit")` (usage: `PromosScreen.tsx` line 35; `ArbForm.tsx` 53-57). Pure parse helper (`parseSortMode(v): "profit"|"roi"`, invalid -> "profit") in a `.ts` file for vitest (node env, no component tests). Because the hook registry syncs all instances via `notify(key)`, both SortSwitches stay in sync without lifted state.

### `src/components/AppShell.tsx` (modify)

**Analog:** itself. Change lines 22, 38, 59-63, 65-88:
```typescript
type ActiveTab = "opportunities" | "arbitrage" | "promos" | "tools";
const [activeTab, setActiveTab] = useState<ActiveTab>("opportunities");
// add: promosVersion counter (bumpPromos), reviewCount, and onNavigate={(tab) => setActiveTab(tab)} passed to OpportunitiesScreen
<TabsTrigger value="opportunities">Opportunities</TabsTrigger> ...
<TabsContent value="opportunities" keepMounted> ... </TabsContent>
```
Keep `TabsList variant="line"` and `keepMounted` on every content. `showExtendedAge={activeTab === "arbitrage"}` unchanged. Tab label helper `tabLabel("Promos", n)` in a pure `.ts`. Do not reuse `recomputeKey` for mark-done invalidation (Pitfall 6).

### `src/components/opportunities/OpportunitiesScreen.tsx`

**Analog:** `src/components/promos/PromosScreen.tsx` (whole file). Copy: `"use client"`; `usePersistentString(STORAGE_KEYS.arbPrecision, "whole")` precision read (35-36); `requestIdRef` stale-response guard + `useTransition` (42-65); try/catch that clears response and sets `loadFailed` (WR-10, 51-60); mount effect on `[precision]` and swallow-first-run effect on `[recomputeKey]` (70-85, extend deps with `promosVersion`); skeleton (`Skeleton className="h-14 w-full"`, 134-139); load-error `Alert variant="destructive"` with Try again button (140-148); `RiskAdvisory` placement (153); header markup (91-96). Client-side re-rank: `pickTop(items, sort, 5)`.

### `src/components/opportunities/PairCard.tsx` / `PairDetails.tsx`

**Analog:** `src/components/promos/PromoRow.tsx` (overlay-trigger Collapsible). Copy lines 44-60 (Collapsible + `relative` div + absolutely positioned empty `CollapsibleTrigger` with focus ring), the `pointer-events-none relative grid min-h-11 ...` content layer (60), interactive children opt back in with `pointer-events-auto` (MarkUsedButton line 74, Tooltip triggers 90/118/130), chevron (154): `<ChevronDown className="size-5 shrink-0 self-center text-muted-foreground transition-transform group-data-open:rotate-180" />`. Money: `<span className="num text-xl font-semibold text-primary">{formatUsd(...)}</span>` (145-147); ROI slot (149-152); Tie-risk tooltip (126-140). Imports (1-12): `Badge`, `Collapsible*`, `Tooltip*`, `cn`, `formatAmerican, formatKickoff, formatPct, formatUsd` from `@/lib/format`. Expanded panel: mirror `PromoDetails.tsx` (read before implementing; not excerpted here) twice.

### `src/components/promos/MarkPairDoneButton` (or new mode in `MarkUsedButton`)

**Analog:** `src/components/promos/MarkUsedButton.tsx`. Copy `useTransition` + `errorMessage` state, `event.stopPropagation()`, ghost `Button` `min-h-10`, `role="alert"` inline error `text-destructive` (35-90). Outcome mapping (54-64): `ok -> onChanged()`, `odds_changed -> setErrorMessage(...) + onChanged()`, `not_found -> message`. UI-SPEC adds confirm dialog: use `alert-dialog` (`src/components/ui/alert-dialog.tsx`; find an existing use with `grep -rl AlertDialog src/components` e.g. `RefreshConfirmDialog.tsx`, `DismissPromoDialog.tsx`) and 44px targets (not `min-h-10`).

### `src/components/promos/DonePairRow.tsx`

**Analog:** `src/components/promos/DonePromoRow.tsx` (lines 22-60: non-hedge/legacy fallback plain div with `used-row-bg`, aria-label; hedge variant uses overlay Collapsible + `MarkUsedButton mode="undo"`). Undo from either member works server-side (`unmarkPairDoneAction`).

### `src/components/promos/PromosScreen.tsx` (modify), `ReviewPanel.tsx`, `ToolsScreen.tsx`

**Analog:** `PromosScreen.tsx` lines 119-131 already contains the nested `Tabs value/onValueChange` + `TabsList variant="line"` + `TabsTrigger` with `<span className="num text-muted-foreground">({n})</span>` count pattern. Extend the `view` union to `"active" | "done" | "review"` (line 40), move `ScrapeStatusPanel` (98) + `ReviewQueueSection` (111-117) into `ReviewPanel` under the Review `TabsContent`, remove `ProfitSummary` (103-109; the component itself moves to OpportunitiesScreen unchanged), add `onReviewCount(n)` effect. `ToolsScreen` copies the same nested-Tabs shape wrapping `FinderScreen` and `SignupOffersScreen` with `keepMounted` on both `TabsContent`. See-all -> Promos must reset `view` to "active" (Pitfall 8).

### `SortSwitch.tsx`

**Analog:** `src/components/ui/toggle-group.tsx` (Base UI, `@base-ui/react/toggle-group`) and the existing precision toggle in `src/components/arb/ArbForm.tsx` (lines ~53-60, `usePersistentString(STORAGE_KEYS.arbPrecision, ...)`); read ArbForm's ToggleGroup usage before writing (single-select, cannot deselect: ignore empty `onValueChange`).

## Shared Patterns

### Server-action auth and IDOR guard
**Source:** `src/app/actions/mark-promo-used.ts` lines 26-35; `get-promos.ts` 96-102.
**Apply to:** `get-opportunities.ts`, `mark-pair-done.ts` (both mark and unmark).
`const user = await requireUser();` is the literal first statement; zod `strictObject` with no `userId`; acting id from `user.userId` only.

### Money math
**Source:** `profitBoost.ts` 68-98 (`LocalDecimal` precision 40, `clean` 20dp, `floorCents`), `profitTotals.ts` (Decimal sums, `.toFixed(2)`).
**Apply to:** all pair math, pruning, totals, `pickTop` comparisons (`new Decimal(str).comparedTo`). Never native floats; format only via `formatUsd/formatPct/formatAmerican` in `@/lib/format`.

### Pure domain modules (no `src/db` imports; "use server" files export only async functions)
**Source:** `promoRowDto.ts` header (9-15), `doneSnapshot.ts` header. **Apply to:** `pairRowDto.ts`, `pairSnapshot.ts`, `arb/build.ts`, `opportunities/*`.

### Feed context (own books, done exclusion, cached odds)
**Source:** `get-promos.ts` 124-138, 175-208; `memberPromoState.ts` 43-58. **Apply to:** `get-opportunities.ts`, `memberPairState.ts`; extract a shared non-server helper (`src/db/feedContext.ts`) rather than calling `getPromos`.

### Fetch-on-mount client screens
**Source:** `PromosScreen.tsx` 42-85. **Apply to:** `OpportunitiesScreen.tsx`.

### Persistent per-device preference
**Source:** `persistentState.ts` 14-19, 100-126. **Apply to:** sort mode.

### Overlay-trigger Collapsible row
**Source:** `PromoRow.tsx` 44-60, 154-160. **Apply to:** `PairCard`, `DonePairRow`.

### Odds-changed / mark-done semantics (260929-igk)
**Source:** `doneSnapshot.ts` `isSameDisplayedProfit` (282-285), `mark-promo-used.ts` 42-51. **Apply to:** `mark-pair-done.ts` (profit + both stakes, D-23).

## No Analog Found

| File / concern | Role | Data Flow | Reason |
|---|---|---|---|
| Two-leg stake solver formulas (`pairMath.ts` body) | utility | transform | Only single-promo solvers exist; use RESEARCH.md Pattern 1 + vectors V1-V10, conventions from `profitBoost.ts` |
| Exact max-weight matching (bitmask DP, greedy fallback) in `pairPromos.ts` | utility | batch | No matching code in repo; RESEARCH.md Pattern 3 and V12 |
| `pickTop` sort/rank helper | utility | transform | No client-side ranker exists; only conventions from `profitTotals.ts`/`rankPromoHedges.ts` sort (335-354) |
| `OpportunitySection` generic shell | component | - | No section wrapper component exists; compose from `ScrapeStatusPanel` card style + `PromosScreen` row stack (`flex flex-col gap-2`, UI-SPEC says `gap-3`) |

## Metadata

**Analog search scope:** `src/domain/{hedge,promos,arb}`, `src/db`, `src/app/actions`, `src/components/{promos,arb,finder}`, `src/lib`, `src/components/ui`
**Files read:** 17 (plus targeted greps)
**Pattern extraction date:** 2026-09-29
