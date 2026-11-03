# Phase 12: Add Kalshi and Polymarket as hedge venues - Pattern Map

**Mapped:** 2026-11-02
**Files analyzed:** 27 (11 new, 16 modified)
**Analogs found:** 25 / 27
**Scope:** bonus-bet finder, promo hedges, paired promos, Arbitrage tab. No-sweat hedge integration (D-01 part) and Low-profile (D-16) are deferred; `noSweat.ts` / `rankNoSweat.ts` are NOT mapped.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match |
|---|---|---|---|---|
| `src/config/books.ts` (mod: add `venue` field, 2 entries, `usableSportsbooks()` / `usableHedgeBooks()` / `refreshBookmakerKeys()`) | config | transform | itself (`usableOddsBooks`) | exact |
| `src/config/venues.ts` (new: fee params, settlement table, availability flag) | config | transform | `src/config/sports.ts` | role-match |
| `src/domain/market/fees.ts` (new) | utility | transform | `src/domain/hedge/bonusBet.ts` (LocalDecimal, floor/ceil cents) | role-match |
| `src/domain/market/marketLeg.ts` (new: MarketLeg, cents from American, display American) | utility | transform | `src/domain/hedge/americanOdds.ts` + `profitBoost.ts` `decimalToAmericanDisplay` | role-match |
| `src/domain/market/solveMarketHedge.ts` (new: bonus/promo/arb/pair top-up solvers) | service (pure) | transform | `src/domain/hedge/bonusBet.ts`, `pairMath.ts` `solveBoostBoostPairWithTopUp` | role-match |
| `src/domain/market/solveMarketHedge.oracle.ts` (new, test-only) | test util | batch | `src/domain/hedge/noSweat.oracle.ts` | exact |
| `src/domain/market/settlement.ts` (new) | utility | transform | `isTieRiskSport` in `src/config/sports.ts` | role-match |
| `src/domain/market/*.test.ts` (new: fees, marketLeg, solveMarketHedge, settlement) | test | table-driven + oracle | `src/domain/hedge/pairMath.test.ts`, `noSweat.test.ts` | exact |
| `src/domain/hedge/marketFilter.ts` (mod: quote gets `kind`/venue) | utility | transform | itself | exact |
| `src/domain/hedge/rankBonusBetHedges.ts` (mod) | service | request-response | itself | exact |
| `src/domain/hedge/rankArbs.ts` (mod) | service | request-response | itself | exact |
| `src/domain/promos/rankPromoHedges.ts` (mod: `bestHedgeQuote`) | service | request-response | itself | exact |
| `src/domain/promos/pairPromos.ts` (mod: market top-up) | service | request-response | itself (`topUp`) | exact |
| `src/domain/promos/selection.ts` (mod: `SelectionQuote`) | model | transform | itself | exact |
| `src/domain/promos/doneSnapshot.ts`, `pairSnapshot.ts` (mod: contracts/price/fee) | model | CRUD (zod-versioned) | themselves | exact |
| `src/domain/promos/dto.ts`, `promoRowDto.ts`, `pairRowDto.ts`, `src/domain/finder/types.ts`, `src/domain/arb/types.ts` + `build.ts` (mod DTO leg) | model | transform | themselves (`FinderLegDTO`) | exact |
| `src/db/schema.ts` + `drizzle/0018_*.sql` (mod/new migration) | migration | CRUD | `drizzle/0017_giant_jack_power.sql` | exact |
| `src/db/queries.ts` (mod: `getBonusBooks`, `getHedgeBookKeys`, `getUsableUserBooks`) | service | CRUD | itself | exact |
| `src/domain/books/bookSelection.ts` (mod allowlist) | validation | request-response | itself | exact |
| `src/ingestion/odds/refresh.ts`, `refreshExtended.ts`, `status.ts` (mod: bookmaker list) | service | batch | themselves | exact |
| `src/components/settings/BookPicker.tsx` (mod: grouped) + `SettingsBooksForm.tsx`, `OnboardingBooksForm.tsx`, `app/settings/page.tsx`, `app/onboarding/books/page.tsx` | component | request-response | itself | exact |
| `src/components/finder/ResultRow.tsx`, `ResultDetails.tsx` | component | request-response | itself (Tie risk badge) | exact |
| `src/components/arb/ArbRow.tsx`, `promos/PromoRow.tsx`, `opportunities/PairCard.tsx` | component | request-response | `ResultRow.tsx` | exact |
| `src/components/market/MarketLegNote.tsx` / badge helpers (new) | component | request-response | `RiskAdvisory.tsx` + Tie-risk Tooltip/Badge | role-match |
| `src/app/actions/find-hedges.ts`, `find-arbs.ts`, `get-promos.ts` (mod: hedgeBookKeys includes markets) | controller (server action) | request-response | themselves | exact |
| `scripts/smoke-venues.ts` (new, optional Wave 0 probe) | utility | request-response | NONE for scripts (see ODDS-05 smoke test via `smokeTestBookKeys`) | none |
| Native Kalshi depth client (optional, last wave) | service | request-response | `src/ingestion/odds/client.ts` | partial |
| `.planning/PROJECT.md`, `REQUIREMENTS.md` (MKT-01..10) | docs | n/a | existing requirement table format | n/a |

## Pattern Assignments

### `src/config/books.ts` (config, transform)

**Analog:** itself. Add `venue: "sportsbook" | "market"` to `BookConfig` (lines 7-15) and two entries after sortOrder 13 (or sortOrder 20+). Existing shape (lines 17-25):

```typescript
export interface BookConfig {
  key: string; displayName: string; region: "us" | "us2" | null;
  apiCoverage: boolean; tier: BookTier; sortOrder: number; note: string | null;
}
```
Region union needs `"us_ex"`. Every existing entry needs `venue: "sportsbook"` (compiler finds them all).

**Current single list to split** (lines 138-143) -- this is the key hazard:
```typescript
export function usableOddsBooks(): BookConfig[] {
  return COLORADO_BOOKS.filter((b) => b.apiCoverage && b.tier === "free").sort((a, b) => a.sortOrder - b.sortOrder);
}
```
Plan: `usableSportsbooks()` = same filter plus `venue === "sportsbook"` (promo/bonus dropdown); `usableHedgeBooks()` = all venues (hedge search, My Books, allowlist); `refreshBookmakerKeys()` = `usableHedgeBooks().map(key)` (<=10 guard test).

**Consumers of `usableOddsBooks()` and what each must switch to** (grep, non-test):
| File:line | Use | Switch to |
|---|---|---|
| `src/ingestion/odds/refresh.ts:105` | bookmaker list + `estimateRefreshCredits(inSeason.length, bookKeys.length)` | `refreshBookmakerKeys()` |
| `src/ingestion/odds/refreshExtended.ts:242` | same (alt lines) | `refreshBookmakerKeys()` |
| `src/ingestion/odds/status.ts:120,123` | credit estimate count | `refreshBookmakerKeys().length` |
| `src/db/queries.ts:29` (`getBonusBooks`) | bonus dropdown, scoped by allowedKeys; also feeds `getHedgeBookKeys` (line 46) and `getUsableUserBooks` (line 70) | `getBonusBooks` -> `usableSportsbooks()`; `getHedgeBookKeys` and `getUsableUserBooks` -> `usableHedgeBooks()` (add new `getMyBookOptions` or param) |
| `src/domain/books/bookSelection.ts:4` | allowlist | `usableHedgeBooks()` |

---

### `src/config/venues.ts` (config, transform)

**Analog:** `src/config/sports.ts` lines 1-50 (typed readonly array + lookup helper, doc-comment with owner decisions).

```typescript
export interface SportConfig { key: string; label: string; tieRisk: boolean; }
export const SPORTS: readonly SportConfig[] = [ { key: "americanfootball_nfl", label: "NFL", tieRisk: true }, ... ] as const;
export function isTieRiskSport(sportKey: string): boolean {
  return SPORTS.find((s) => s.key === sportKey)?.tieRisk ?? false;
}
```
Copy the shape: `VENUES: readonly VenueConfig[]` keyed by book key with `feeModel`, `theta`/`coefficient`, `rounding`, `availableInColorado`, `sourceNote` ("last verified 2026-11-02"), plus `settlementReason(sportKey, venueKey): string | null` helper next to it (or in `domain/market/settlement.ts`).

---

### `src/domain/market/fees.ts` + `solveMarketHedge.ts` (pure decimal.js math)

**Analog:** `src/domain/hedge/bonusBet.ts` lines 1-80.

**Local Decimal clone + clean() idiom** (lines 32-45):
```typescript
const LocalDecimal = Decimal.clone({ precision: 40 });
function clean(value: Decimal): Decimal {
  return value.toDecimalPlaces(20, Decimal.ROUND_HALF_UP);
}
```
**Input validation by RangeError** (lines 59-68):
```typescript
if (bonusAmount.lte(0)) throw new RangeError(`bonusAmount must be greater than 0, got ${bonusAmount.toString()}`);
```
**Cent flooring of book payouts** (lines 74-77): `clean(bonusAmount.times(bonusDecimalOdds.minus(1))).toDecimalPlaces(2, Decimal.ROUND_DOWN)`. Reuse this for the book-side payout in market solvers so market and book legs agree. Import `StakePrecision` from `@/domain/hedge/arbMath`, `americanToDecimal` from `./americanOdds`, `floorCents` / `decimalToAmericanDisplay` from `@/domain/hedge/profitBoost`.

Kalshi fee = `ceil` via `Decimal.ROUND_UP`/`.ceil()`; Polymarket = `Decimal.ROUND_HALF_EVEN`. Result type mirrors `BonusBetHedgeResult` (`hedgeStake`, `netIfBonusWins`, `netIfHedgeWins`, `guaranteedProfit`) plus `contracts`, `priceCents`, `feeUsd`, `costUsd` so `rankBonusBetHedges` can compare `guaranteedProfit` uniformly.

**Top-up search with +/- unit neighbourhood** (for pair market leg): `solveBoostBoostPairWithTopUp` in `src/domain/hedge/pairMath.ts`. Mirror its candidate-neighbourhood approach but scan integer N (window N*-3..N*+3 per Pitfall 4).

---

### `src/domain/market/solveMarketHedge.oracle.ts` (test-only, batch)

**Analog:** `src/domain/hedge/noSweat.oracle.ts` lines 1-40 -- integer cents, no Decimal in loop, re-exports PRNG.

```typescript
export { mulberry32, randInt, pick } from "./pairMath.oracle";
function oddsFraction(american: number): { num: number; den: number } {
  return american > 0 ? { num: american + 100, den: 100 } : { num: Math.abs(american) + 100, den: Math.abs(american) };
}
function floorMulCents(cents: number, f: { num: number; den: number }): number {
  const n = cents * f.num; return (n - (n % f.den)) / f.den;
}
```
Import as `from "@/domain/hedge/noSweat.oracle"` or `pairMath.oracle`. File name `*.oracle.ts` is not matched by vitest include. Compare PROFIT only (not stake/contract count), per `pairMath.oracle.ts` header note. Oracle fee must be an independent integer implementation (`ceil(7*n*p*(100-p)/10000)`), not the production fee fn.

**Test analog:** `src/domain/hedge/pairMath.test.ts` lines 1-40 (imports `describe/it/expect` from vitest, `const D = (v) => new Decimal(v)`, helper builders, oracle imports with seeded `mulberry32`).

---

### `src/domain/hedge/marketFilter.ts` (utility, transform)

**Analog:** itself. Quote shape (lines 10-15) and loop (lines 45-75):
```typescript
export interface MoneylineQuote { bookKey: string; outcome: "home" | "away"; team: string; oddsAmerican: number; }
...
for (const bookmaker of event.bookmakers) {
  if (!opts.allowedBookKeys.has(bookmaker.key)) continue;
  const h2h = bookmaker.markets.find((m) => m.key === "h2h");
  if (!h2h) continue;
  if (h2h.outcomes.length !== 2) continue;
```
No code change needed for venue keys to flow through (Odds API h2h parses unchanged; `OddsEventSchema` is looseObject). Add either a `venue` derivable by `bookKey` lookup (preferred: `isMarketVenue(bookKey)` helper exported from `config/books.ts`) or a field on the quote. Discriminating on bookKey avoids touching every quote constructor. Also drop quotes whose price is outside the 1..99c implied range.

---

### `src/domain/hedge/rankBonusBetHedges.ts` (service, request-response)

**Analog:** itself. Insertion point is `buildOrientation` (lines 80-110): currently picks `bestHedgeQuote` (highest decimal odds across `hedgeBookKeys`), calls `calculateBonusBetHedge`, drops `guaranteedProfit.lte(0)`.

```typescript
const hedgeQuote = bestHedgeQuote(market.quotes, hedgeOutcome, opts.hedgeBookKeys);
if (!hedgeQuote) return null;
const result = calculateBonusBetHedge({ bonusAmount: opts.bonusAmount, bonusOddsAmerican: bonusQuote.oddsAmerican, hedgeOddsAmerican: hedgeQuote.oddsAmerican });
if (result.guaranteedProfit.lte(0)) return null;
```
Change: split `hedgeBookKeys` candidates into book quotes (existing best-odds path) and market quotes (new solver each). Evaluate the best book hedge AND each market hedge, keep max `guaranteedProfit` (D-02), tie-break equal profit deterministically (book key alphabetical, as in `bestHedgeQuote`). `BonusBetOpportunity.hedge: HedgeLeg` (lines 11-16) becomes a discriminated union (`kind: "book" | "market"`; market carries `contracts`, `priceCents`, `feeUsd`, `side`); `result` stays `BonusBetHedgeResult`-shaped. Note `maxHedgeStake` cap (lines 108-114, filters on `result.hedgeStake`) must use the market leg's total cost.

---

### `src/domain/hedge/rankArbs.ts` (service, request-response)

**Analog:** itself. `findBestArbPair` (lines 56-100) does the joint book-pair search with `a.bookKey === b.bookKey` skip (D-06 different books). Market adaptation: D-04 requires exactly one sportsbook leg, so exclude market-vs-market pairs:
```typescript
for (const a of sideAQuotes) for (const b of sideBQuotes) {
  if (a.bookKey === b.bookKey) continue;
  // NEW: if (isMarket(a.bookKey) && isMarket(b.bookKey)) continue;   // D-04
```
Pairs containing a market need the market solver (whole contracts, fee) rather than `calculateArb` (`arbMath.ts`) and must be ranked by after-fee profit, not by `impliedSum`. `ArbLeg` (lines 123-129) and `ArbOpportunity.result: ArbResult` need a market-leg variant. `moneylineToArbMarket` (lines 134-150) already maps quotes by bookKey, no change.

---

### `src/domain/promos/rankPromoHedges.ts` / `selection.ts` (service, request-response)

**Analog:** itself. `SelectionQuote` is `{ bookKey; oddsAmerican }` (selection.ts:17-20) and `bestHedgeQuote` (rankPromoHedges.ts:70-92) filters by `hedgeBookKeys` and picks highest decimal odds. Result union (`PromoOpportunity.result`, lines 40-47) is `{kind:"boost"} | {kind:"bonus"}`. Apply the same "best book hedge vs market hedge, keep higher guaranteedProfit" comparison as in `rankBonusBetHedges`, for bonus kind (calculateBonusBetHedge) and boost kind (`calculateProfitBoostHedge`). `PromoOpportunity.hedge: SelectionQuote` gains the market leg info. Preserve D-18 `memberBookKeys.has(p.bookKey)` promo-book rule; a market quote must never satisfy the promo-book check (Pitfall 6).

**Pair top-up** (`pairPromos.ts:53, 296-302`): `topUp?: { side; selection; bookKey; oddsAmerican; ... }` and
```typescript
quoteOnA = bestHedgeQuote(legA.selection.promoSideQuotes, opts.hedgeBookKeys);
quoteOnB = bestHedgeQuote(legB.selection.promoSideQuotes, opts.hedgeBookKeys);
```
Market top-up is a third leg with contracts; extend `topUp` with the market variant. Line 268 `if (lo.bookKey === hi.bookKey) continue;` concerns promo books only (unchanged).

---

### Snapshots and DTOs: `doneSnapshot.ts`, `pairSnapshot.ts`, `dto.ts`, `promoRowDto.ts`, `pairRowDto.ts`, `finder/types.ts`, `arb/types.ts`

**Analog:** themselves. Zod versioned snapshot with compile-time guard:

`doneSnapshot.ts:39-44` hedge leg:
```typescript
hedge: z.object({ bookKey: z.string(), bookName: z.string(), selectionLabel: z.string(), oddsAmerican: z.number() }),
```
Extend with optional/nullable fields (never required, so old stored snapshots still parse): `kind: z.enum(["book","market"]).optional()`, `contracts: z.number().nullable().optional()`, `priceCents`, `feeUsd: z.string()`, `side`. Money stays 2-dp strings. Keep the guard at line 57:
```typescript
export const _rowShapeGuard = (r: SnapshotRow): PromoRowDTO => r;
```
so DTO and snapshot cannot drift. `pairSnapshot.ts:20-45` `PairTopUpSnapshotSchema` (has `bookKey, bookName, selectionLabel, oddsAmerican, stake, payout, note`) gets the same market fields. `FinderLegDTO` (`finder/types.ts:7-12`) likewise. Snapshot is built only server-side from a fresh recompute (no client numbers). Existing tests to extend: `doneSnapshot.test.ts`, `pairSnapshot.test.ts`.

---

### Migration (`drizzle/0018_*.sql`, `src/db/schema.ts`)

**Analog:** `drizzle/0017_giant_jack_power.sql` (latest; `drizzle/meta` journal updated by `drizzle-kit generate`). Done snapshots appear to be JSON blobs validated by Zod, so a migration may be unnecessary; check `src/db/schema.ts` for the completion-table column type before adding columns. If JSON, only Zod changes are needed and no migration is required (confirm and say so in the plan). `user_books.book_key` is a free string; no enum change.

---

### `src/db/queries.ts` (service, CRUD)

**Analog:** itself, lines 26-72 (`getBonusBooks` / `getHedgeBookKeys` / `getUsableUserBooks`). Pattern to keep: read from `config/books.ts`, scope by `allowedKeys` set, config order. Doc-comment (lines 11-25) states the invariant "dropdown, hedge venues and refresh can't drift apart"; update it to the split. New: `getHedgeBookKeys` returns sportsbooks + markets filtered by user set (a member with no market ticked gets none, D-03/D-14).

**Critical edge:** `getUsableUserBooks` (line 70) is the "has at least one usable book" redirect predicate. A member who only ticked Kalshi would pass; it must count sportsbooks only (D-04 / promos only from books) while My Books displays both.

---

### `src/domain/books/bookSelection.ts` (validation)

**Analog:** itself, lines 1-30. `USABLE_BOOK_KEYS` set from `usableOddsBooks()` -> `usableHedgeBooks()`; keep the `.min(1)` rule but consider requiring at least one sportsbook:
```typescript
.refine((keys) => keys.every((key) => USABLE_BOOK_KEYS.has(key)), { message: "Choose only books from the list." })
```
Update the doc comment's "7 API-covered free-tier books" wording.

---

### `src/ingestion/odds/{refresh,refreshExtended,status}.ts` (batch)

**Analog:** themselves. Pattern (refresh.ts:105-106):
```typescript
const bookKeys = usableOddsBooks().map((b) => b.key); // D-15, never paid_only
const estimatedCredits = estimateRefreshCredits(inSeason.length, bookKeys.length);
```
and quota.ts:29-36 `estimateRefreshCredits(sports, bookmakerCount, markets=1)` = `sports * ceil(n/10) * markets`. Replace with `refreshBookmakerKeys()`. Add guard test `refreshBookmakerKeys().length <= 10` (new in `src/config/books.test.ts` or `quota.test.ts`), and extend `status.test.ts` (uses `usableOddsBooks` already, per grep) to assert estimate unchanged (9 books -> 1 bucket).

---

### `src/components/settings/BookPicker.tsx` (component)

**Analog:** itself (whole file, 51 lines). Single flat list; `books: { key; displayName }[]`. Extend prop to carry `venue` (and optional `note`) and render two groups: sportsbooks, then a "Prediction markets" heading with the CFTC one-liner shown when a market is ticked. Row idiom to reuse for both groups:
```tsx
<Label key={book.key} htmlFor={`book-${book.key}`} className="min-h-10 w-full cursor-pointer gap-2 font-normal">
  <Checkbox id={`book-${book.key}`} checked={selected.has(book.key)} onCheckedChange={(checked) => toggle(book.key, checked === true)} disabled={disabled} />
  {book.displayName}
</Label>
```
Callers: `SettingsBooksForm.tsx` (props `books`, `initialKeys`; `sameKeys` no-op guard unchanged), `OnboardingBooksForm.tsx`, `app/settings/page.tsx:35-36` (calls `getBonusBooks()` + `getUsableUserBooks` -> needs the all-venues list), `app/onboarding/books/page.tsx`. Markets off by default: do not seed them into the onboarding default selection. Copy/layout per `12-UI-SPEC.md`.

---

### Cards: `ResultRow.tsx`, `ArbRow.tsx`, `PromoRow.tsx`, `PairCard.tsx`, `ResultDetails.tsx` (component)

**Analog:** `src/components/finder/ResultRow.tsx` lines 57-72 (Tie risk Tooltip+Badge) -- template for "Settlement differs" / "Thin market" / "price may move":
```tsx
{result.tieRisk ? (
  <Tooltip>
    <TooltipTrigger render={<Badge variant="outline" className="cursor-default">Tie risk</Badge>} />
    <TooltipContent>Regular-season NFL games can end in a tie ... </TooltipContent>
  </Tooltip>
) : null}
```
Imports (lines 3-9): `Badge` from `@/components/ui/badge`, `Tooltip*` from `@/components/ui/tooltip`, `formatAmerican, formatUsd` from `@/lib/format`. Hedge cell (lines 43-50) renders `team + formatAmerican(oddsAmerican)` and `bookName`; for a market leg render the D-12 line ("Kalshi: buy 42 YES @ 61c ($25.62 + $0.42 fee) ~ -156") and add a shared `<MarketLegBadges leg={...} sportKey={...} />` component to avoid copy-paste across the four card types. Same `tieRisk` badge blocks exist in `ArbRow.tsx`, `PromoRow.tsx`, `PairCard.tsx`; add the new component beside each. `src/components/RiskAdvisory.tsx` (17 lines, `Alert` + `AlertDescription`) is the style reference for any inline advisory text.

---

### Server actions: `find-hedges.ts`, `find-arbs.ts`, `get-promos.ts`

**Analog:** themselves. All three build `hedgeBookKeys = new Set(await getHedgeBookKeys(userBookSet))` (find-hedges.ts:114; find-arbs.ts:37-50; get-promos.ts:158-206) and pass it to rankers. Because `getHedgeBookKeys` will include markets only when the member ticked them, the rankers receive market keys with no further change in actions. DTO builders (where `FinderLegDTO` / `PromoRowDTO` are created from opportunities) need the market leg fields; `find-hedges.ts:73` passes `allowedBookKeys: rankOpts.hedgeBookKeys` to `extractTwoWayMoneylines`. Lines 77/167/229 call `getHedgeBookKeys()` unscoped for the "all books" empty-state explanation: make sure that variant either stays sportsbook-only or the message copy still reads correctly.

---

## Shared Patterns

### Decimal-only money math, local clone, cent flooring
**Source:** `src/domain/hedge/bonusBet.ts` lines 32-45, 74-77
**Apply to:** `fees.ts`, `solveMarketHedge.ts`, any DTO conversion (money crosses to client as 2-dp strings, `finder/types.ts` header comment).

### Compare by guaranteed profit, deterministic tie-break
**Source:** `rankBonusBetHedges.ts` sort (profit desc, then `commenceTime`, then `eventId`) and `bestHedgeQuote` (decimal odds, then `bookKey` alphabetical).
**Apply to:** all four rankers (D-02: market wins only if after-fee profit strictly beats the best book; on equal profit prefer sportsbook purely as a deterministic tie-break, document it).

### Single config source of truth, no hardcoded book keys
**Source:** `src/config/books.ts` header comment; `queries.ts:11-25`.
**Apply to:** every consumer listed in the `usableOddsBooks()` table above. Add one new `src/config/books.test.ts` covering: markets excluded from `usableSportsbooks()`, included in `usableHedgeBooks()`, off-by-default, `refreshBookmakerKeys().length <= 10`.

### Zod validation with versioned, backward-compatible snapshots
**Source:** `doneSnapshot.ts:1-60`, `pairSnapshot.ts:1-45`; Odds API `src/domain/odds/schemas.ts` (looseObject).
**Apply to:** new snapshot fields (optional/nullable), any native Kalshi response parsing (clamp price 1..99).

### Exhaustive-switch / compile-time guards
**Source:** `_rowShapeGuard` in `doneSnapshot.ts:57`; CONTEXT A-02.
**Apply to:** the `kind: "book" | "market"` discriminant; let the compiler find every leg consumer.

### Tie-risk badge plumbing (sport config -> filter -> rank -> DTO -> row)
**Source:** `config/sports.ts` `isTieRiskSport`; `marketFilter.ts` `tieRisk`; `ResultRow.tsx:57-72`.
**Apply to:** `settlement.ts` reason lookup and the "Settlement differs" badge (NFL tie: Kalshi pays 50c vs book refund per RESEARCH).

### Oracle-backed solver tests
**Source:** `noSweat.oracle.ts`, `pairMath.oracle.ts`, `pairMath.test.ts`.
**Apply to:** `solveMarketHedge.test.ts` (seeded `mulberry32`, compare profit only, window N*-3..N*+3 so the solver cannot be a cent short as in todo `2026-10-03-two-bet-pair-solver-rounding`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| Whole-contract, nonlinear-fee hedge solver (`solveMarketHedge.ts` core) | service | transform | No existing solver handles per-contract price + fee + integer count; use RESEARCH Pattern 1/Code Examples with `bonusBet.ts` idioms and the oracle |
| `scripts/smoke-venues.ts` (live Odds API probe, human-gated, 1-2 credits) | utility | request-response | Closest is the ODDS-05 smoke path (`smokeTestBookKeys()` in `books.ts:146`); no scripts dir pattern reviewed. Use `src/ingestion/odds/client.ts` fetch + key handling |
| Native Kalshi orderbook client (optional Thin-market wave) | service | request-response | `client.ts` is the nearest fetch wrapper (fixed base URL, Zod, safeMessage) but nothing handles bids-only books or refresh-lock caching for non-credit sources |
| Settlement-rules table per sport x venue | config | transform | New data; shape it like `SPORTS` in `sports.ts` |

## Metadata

**Analog search scope:** `src/config`, `src/domain/{hedge,promos,books,finder}`, `src/ingestion/odds`, `src/db/queries.ts`, `src/components/{finder,settings,arb,promos,opportunities}`, `src/app/actions`, `drizzle/`.
**Files scanned:** ~30 read in full or by range; remainder via grep.
**Not mapped (deferred per scope note):** `noSweat.ts`, `rankNoSweat.ts`, Low-profile settings (D-16).
**Pattern extraction date:** 2026-11-02
**Unverified during mapping:** whether done snapshots are stored as JSON (no migration needed) -- planner should check `src/db/schema.ts` completion table; `ArbRow.tsx` / `PromoRow.tsx` / `PairCard.tsx` Tie-risk blocks were located by grep, not read.
