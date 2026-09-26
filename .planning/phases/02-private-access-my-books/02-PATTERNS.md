# Phase 2: Private Access & My Books - Pattern Map

**Mapped:** 2026-09-26
**Files analyzed:** 31 (17 new, 14 modified)
**Analogs found:** 27 / 31

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/lib/session.ts` (new) | utility | request-response | `src/db/client.ts` (lazy singleton pattern) | role-match |
| `src/proxy.ts` (new) | middleware | request-response | *(none — no middleware/proxy file exists yet)* | no-analog (use RESEARCH.md Pattern 2 verbatim) |
| `src/app/actions/login.ts` (new) | controller (server action) | request-response | `src/app/actions/refresh-odds.ts` | exact (thin action → domain fn → outcome union) |
| `src/app/actions/logout.ts` (new) | controller (server action) | request-response | `src/app/actions/refresh-odds.ts` (shape only, much simpler) | role-match |
| `src/app/actions/redeem-invite.ts` (new) | controller (server action) | CRUD | `src/app/actions/find-hedges.ts` (zod `safeParse` → `fieldErrors` shape) | role-match |
| `src/app/actions/save-books.ts` (new) | controller (server action) | CRUD | `src/app/actions/refresh-odds.ts` (validate → mutate → `revalidatePath`) | exact |
| `src/app/actions/find-hedges.ts` (modified) | controller (server action) | request-response | *(self — extend in place)* | exact |
| `src/app/actions/find-arbs.ts` (modified) | controller (server action) | request-response | *(self — extend in place)* | exact |
| `src/app/actions/refresh-odds.ts` (modified) | controller (server action) | request-response | *(self — extend in place)* | exact |
| `src/app/actions/refresh-spreads-totals.ts` (modified) | controller (server action) | request-response | *(self — extend in place)* | exact |
| `src/app/login/page.tsx` (new) | route (Server Component) | request-response | `src/app/page.tsx` | role-match (unauthenticated variant) |
| `src/app/invite/[token]/page.tsx` (new) | route (Server Component) | request-response | `src/app/page.tsx` | role-match |
| `src/app/onboarding/books/page.tsx` (new) | route (Server Component) | request-response | `src/app/page.tsx` | role-match |
| `src/app/settings/page.tsx` (new) | route (Server Component) | request-response | `src/app/page.tsx` | exact (authenticated, same session-read shape) |
| `src/components/AppHeader.tsx` (new) | component | request-response | `src/components/finder/OddsStatusBar.tsx` (header-row composition, not the refresh logic) | role-match |
| `src/components/AccountMenu.tsx` (new) | component | event-driven | `src/components/finder/RefreshConfirmDialog.tsx` (client component calling a server action + `router.refresh()`) | role-match |
| `src/components/settings/BookPicker.tsx` (new) | component | CRUD | `src/components/finder/FinderForm.tsx` (checkbox-row idiom, lines 198-230) | role-match |
| `src/components/auth/LoginForm.tsx` (new) | component | request-response | `src/components/finder/FinderForm.tsx` (react-hook-form + zodResolver, one submit button) | exact |
| `src/components/auth/InviteForm.tsx` (new) | component | CRUD | `src/components/finder/FinderForm.tsx` | exact |
| `scripts/invite-create.ts` (new) | utility (CLI) | batch | `scripts/refresh-odds.ts` | exact |
| `scripts/password-reset.ts` (new) | utility (CLI) | batch | `scripts/seed.ts` (DB write + `main().then/catch` exit-code idiom) | role-match |
| `src/db/schema.ts` (modified — add `users`, `invites`, `userBooks`; FK on `credit_usage`) | model | CRUD | *(self — extend in place)*, `books`/`creditUsage` table defs | exact |
| `src/db/queries.ts` (modified — `getBonusBooks(allowedKeys)`, `getHedgeBookKeys(allowedKeys)`, new `getUserBookKeys`, `saveUserBooks`) | service | CRUD | *(self — extend in place)* | exact |
| `src/ingestion/odds/store.ts` (modified — `recordCreditUsage` gains `triggeredByUserId`) | service | CRUD | *(self — extend in place)* | exact |
| `src/ingestion/odds/status.ts` (modified — join `users`, add `refreshedByDisplayName`) | service | request-response | *(self — extend in place)* | exact |
| `src/app/page.tsx` (modified — require session, pass `userBookKeys`) | route (Server Component) | request-response | *(self — extend in place)* | exact |
| `src/components/AppShell.tsx` (modified — mount `AppHeader`) | component | request-response | *(self — extend in place)* | exact |
| `src/components/finder/OddsStatusBar.tsx` (modified — attribution suffix) | component | request-response | *(self — extend in place)*, `src/components/finder/oddsAge.ts` | exact |
| `src/components/finder/FinderForm.tsx` (modified — add risk advisory) | component | request-response | `src/components/arb/ArbForm.tsx` lines 279-285 (the `Alert` to copy verbatim) | exact |
| `src/components/finder/EmptyState.tsx` (modified — new `no-books-covered` variant) | component | request-response | *(self — extend in place)*, `src/components/arb/ArbEmptyState.tsx` | exact |

## Pattern Assignments

### `src/lib/session.ts` (utility, request-response)

**Analog:** `src/db/client.ts` (lazy singleton env-var pattern) — no iron-session precedent exists in-repo, so structure follows the codebase's established "lazy singleton reading a server-only env var, throws loudly if unset" idiom, and RESEARCH.md's Pattern 1 supplies the iron-session-specific API calls.

**Lazy singleton + throw-if-unset pattern** (`src/db/client.ts` lines 9-22):
```typescript
let dbInstance: NeonHttpDatabase<typeof schema> | null = null;

export function getDb(): NeonHttpDatabase<typeof schema> {
  if (dbInstance) return dbInstance;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set");
  }
  const client = neon(url);
  dbInstance = drizzle({ client, schema });
  return dbInstance;
}
```
Apply the same "throw with a clear message if the required env var is missing" shape to `SESSION_SECRET` inside `getSession()`.

**iron-session API shape** — copy verbatim from RESEARCH.md's Pattern 1 (`src/lib/session.ts` code block, already vetted against the installed `iron-session@9.0.1` README): `getIronSession<SessionData>(await cookies(), sessionOptions)`, `cookieName: "promoprofit_session"`, `ttl: 60 * 60 * 24 * 30` (D-06), `httpOnly`/`secure`/`sameSite: "lax"`.

**Doc-comment convention to match** (every module-level export in this codebase has a `/** ... */` block citing the requirement IDs it satisfies, e.g. `src/db/queries.ts` lines 12-19) — do the same for `getSession()`/`requireSession()`, citing D-06/D-20.

---

### `src/proxy.ts` (middleware, request-response)

**No in-repo analog** — this is the first network-boundary file in the project. Use RESEARCH.md's Pattern 2 code block verbatim (`PUBLIC_PATHS`, cookie-presence check, `NextResponse.redirect`, the `matcher` config). Keep the file name `proxy.ts`, not `middleware.ts` (Next.js 16 rename — see RESEARCH.md Pitfall 2/State of the Art).

**Convention to match regardless:** every other file in `src/` uses named exports with a leading module doc-comment explaining the "why," e.g. `src/ingestion/odds/refresh.ts` lines 1-5. Give `proxy.ts` the same one-paragraph comment citing D-01/D-20/WR-05.

---

### `src/app/actions/login.ts` / `src/app/actions/logout.ts` (controller, request-response)

**Analog:** `src/app/actions/refresh-odds.ts` (full file, 28 lines) — the exact shape to copy: `"use server"` directive, a top-level Zod input schema, `safeParse` → early-return on invalid input, delegate all real logic to a pure/testable module (`runOddsRefresh`), and `revalidatePath("/")` only on the success branch.

**Full analog** (`src/app/actions/refresh-odds.ts`):
```typescript
"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { runOddsRefresh, type RefreshOutcome } from "@/ingestion/odds/refresh";

const RefreshInputSchema = z.object({ confirmed: z.boolean() });

export async function refreshOdds(input: unknown): Promise<RefreshOutcome> {
  const parsed = RefreshInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid refresh request" };
  }
  const outcome = await runOddsRefresh({ confirmed: parsed.data.confirmed });
  if (outcome.status === "ok") {
    revalidatePath("/");
  }
  return outcome;
}
```

**Apply to `login.ts`:** same shape — `LoginInputSchema = z.object({ email: z.string(), password: z.string() })`, delegate to a `login()` domain function (lookup user by lowercased email, `verify()` via `@node-rs/argon2`, check `failedLoginAttempts`/`lockedUntil`, call `session.save()` per RESEARCH.md's iron-session code example), return a discriminated-union outcome (`ok` / `invalid_credentials` / `locked`) mirroring `RefreshOutcome`'s style (see `src/ingestion/odds/refresh.ts` lines 31-42 for the union-type convention).

**Apply to `logout.ts`:** trivial — `"use server"`, call `(await getSession()).destroy()`, no Zod schema needed (no input). Follow RESEARCH.md's iron-session code example verbatim.

**Session-check-first convention (D-20/WR-05):** every server action that spends credits or reads/writes per-user data must call `requireSession()`/`getSession()` as its **first** statement, mirroring how `findHedges`/`findArbs` currently call `FinderInputSchema.safeParse(input)` as their first statement before touching the DB (`src/app/actions/find-hedges.ts` lines 87-91).

---

### `src/app/actions/redeem-invite.ts` (controller, CRUD)

**Analog:** `src/app/actions/find-hedges.ts` (Zod validation → `fieldErrors` shape, lines 86-103) for the multi-field form-validation branch; `src/ingestion/odds/store.ts`'s `recordCreditUsage`/`tryAcquireRefreshLock` (lines 132-181) for the "single DB write with a conflict/race guard" idiom.

**Zod → fieldErrors pattern** (`src/app/actions/find-hedges.ts` lines 86-103):
```typescript
export async function findHedges(input: unknown): Promise<FindHedgesResponse> {
  const parsed = FinderInputSchema.safeParse(input);
  if (!parsed.success) {
    const { fieldErrors } = z.flattenError(parsed.error);
    return { status: "invalid", fieldErrors };
  }
  const { bookKey, bonusAmount, maxHedgeAmount } = parsed.data;
  const bonusBooks = await getBonusBooks();
  const bonusBook = bonusBooks.find((b) => b.key === bookKey);
  if (!bonusBook) {
    return { status: "invalid", fieldErrors: { bookKey: ["Choose the book holding your bonus bet."] } };
  }
  // ...
}
```
Apply the same "parse → domain-level lookup → domain-level validity check → typed error" chain to invite redemption: parse `{ token, email, displayName, password }` → hash `token` (SHA-256, per RESEARCH.md Don't-Hand-Roll) → look up `invites` row → check `usedAt`/`expiresAt` → check email uniqueness → `hash()` password via `@node-rs/argon2` → insert `users` row + mark invite used, in one DB call sequence (no batch/transaction precedent needed here since it's a single-user write, unlike `commitOddsRefresh`'s multi-table batch).

**Single-use claim/guard pattern** (`src/ingestion/odds/store.ts` lines 167-181, `tryAcquireRefreshLock`) — same "insert or fail atomically" idea applies to marking an invite used exactly once; consider a conditional `UPDATE ... WHERE used_at IS NULL RETURNING` to avoid a race between two redemption attempts of the same link, structurally parallel to this function's `onConflictDoUpdate` + `setWhere` guard.

---

### `src/app/actions/save-books.ts` (controller, CRUD)

**Analog:** `src/app/actions/refresh-odds.ts` (validate → mutate → `revalidatePath`, full file shown above) — but per RESEARCH.md Pitfall 5, this action must **never** import anything from `src/ingestion/odds/refresh.ts` or `refreshExtended.ts` (D-19: no credit spend on a books save).

**Apply:** `SaveBooksInputSchema = z.object({ bookKeys: z.array(z.string()).min(1) })` (D-09 — enforce ≥1 in the schema itself, mirroring how `FinderInputSchema` encodes its own business rules rather than checking them ad hoc in the action body). On success, call the new `saveUserBooks(userId, bookKeys)` query function (see `db/queries.ts` below) then `revalidatePath("/")` and `revalidatePath("/settings")`.

---

### `src/app/actions/find-hedges.ts` / `src/app/actions/find-arbs.ts` (modified, request-response)

**Pattern:** extend in place — RESEARCH.md's Architecture Pattern 3 is the exact seam, already confirmed against the live source in this pass.

**Current call sites to change** (`find-hedges.ts` line 95, `find-arbs.ts` lines 102-108):
```typescript
// find-hedges.ts, current:
const bonusBooks = await getBonusBooks();
// ...
const hedgeBookKeys = new Set(await getHedgeBookKeys());
```
```typescript
// find-arbs.ts, current:
const [bonusBooks, hedgeBookKeys, ...] = await Promise.all([
  getBonusBooks(),
  getHedgeBookKeys(),
  getCachedEvents(),
  getCachedExtendedEvents(),
]);
```
**Change to:** resolve the session first (`const session = await requireSession();`), read `const userBookKeys = new Set(await getUserBookKeys(session.userId));`, then pass `userBookKeys` into `getBonusBooks(userBookKeys)` / `getHedgeBookKeys(userBookKeys)`. **No other line in either file changes** — `extractTwoWayMoneylines`, `rankBonusBetHedges`, `rankArbs`, `moneylineToArbMarket`, and `extractTwoWaySpreadsAndTotals` already consume whatever `allowedBookKeys` set they're handed (confirmed in `src/domain/hedge/marketFilter.ts` lines 26-31, `MarketFilterOptions.allowedBookKeys: ReadonlySet<string>`).

---

### `src/app/actions/refresh-odds.ts` / `src/app/actions/refresh-spreads-totals.ts` (modified, request-response)

**Pattern:** add a session-required check as the first statement (D-20, closes WR-05), and thread `session.userId` into the credit-usage write.

**Current shape** (`refresh-odds.ts`, full file shown above) — insert `const session = await requireSession(); if (!session.userId) return { status: "error", message: "Not signed in" };` immediately after the `"use server"` directive/imports, before the Zod parse. Then pass `triggeredByUserId: session.userId` through to wherever `runOddsRefresh` ultimately calls `recordCreditUsage` (`src/ingestion/odds/refresh.ts` lines 189-199) — this requires `runOddsRefresh`'s options object to also accept `triggeredByUserId` and forward it.

---

### `src/db/schema.ts` (modified, CRUD/model)

**Analog:** `books` table (lines 9-18) for a simple lookup-style table; `creditUsage` (lines 71-78) for a table that will grow a nullable FK.

**Table-definition convention to copy** (`src/db/schema.ts` lines 1-18):
```typescript
import { pgTable, text, boolean, integer, serial, timestamp, jsonb, index } from "drizzle-orm/pg-core";

/**
 * <one-paragraph doc comment citing the requirement IDs this table serves>
 */
export const books = pgTable("books", {
  key: text("key").primaryKey(),
  displayName: text("display_name").notNull(),
  region: text("region"),
  apiCoverage: boolean("api_coverage").notNull(),
  tier: text("tier").notNull(),
  sortOrder: integer("sort_order").notNull(),
  note: text("note"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
```
**Apply to `users`:** `serial("id").primaryKey()`, `text("email").notNull().unique()` (pre-lowercased per RESEARCH.md Don't-Hand-Roll), `text("display_name").notNull()`, `text("password_hash").notNull()`, `integer("failed_login_attempts").notNull().default(0)`, `timestamp("locked_until", { withTimezone: true })`, `timestamp("created_at", { withTimezone: true }).notNull().defaultNow()`.

**Apply to `invites`:** `serial("id").primaryKey()`, `text("token_hash").notNull().unique()` (SHA-256 hash, never plaintext — RESEARCH.md Anti-Patterns), `timestamp("expires_at", { withTimezone: true }).notNull()`, `timestamp("used_at", { withTimezone: true })`, `integer("used_by_user_id").references(() => users.id)`, `timestamp("created_at", { withTimezone: true }).notNull().defaultNow()`.

**Apply to `userBooks`:** normalized join table per RESEARCH.md's explicit rejection of a `jsonb`/array column (Anti-Patterns + Pitfall 4) — `integer("user_id").notNull().references(() => users.id)`, `text("book_key").notNull().references(() => books.key)`, composite primary key or a `unique` index on `(user_id, book_key)`. Model the FK-to-`books.key` style on the existing indexed-column convention in `cachedOdds` (lines 34-37, `index(...).on(table.sportKey)`).

**Apply to `creditUsage` FK addition:** add `triggeredByUserId: integer("triggered_by_user_id").references(() => users.id, { onDelete: "set null" })` (nullable — RESEARCH.md Open Question 1 recommends `ON DELETE SET NULL`) alongside the existing columns (lines 71-78); do not touch any other column.

**Migration workflow (unchanged convention):** `npm run db:generate` then `npm run db:migrate` — never `db push` (per `drizzle.config.ts` and CLAUDE.md).

---

### `src/db/queries.ts` (modified, CRUD/service)

**Analog:** self — the file's own existing `getBonusBooks`/`getHedgeBookKeys` (lines 12-28) and its doc-comment convention citing decision IDs (lines 12-19).

**Current functions to extend:**
```typescript
export async function getBonusBooks(): Promise<BookOption[]> {
  return usableOddsBooks().map((b) => ({ key: b.key, displayName: b.displayName }));
}

export async function getHedgeBookKeys(): Promise<string[]> {
  const bonusBooks = await getBonusBooks();
  return bonusBooks.map((b) => b.key);
}
```
**Change to accept an optional `allowedKeys: ReadonlySet<string>` and intersect** — exact code already drafted in RESEARCH.md Architecture Pattern 3:
```typescript
export async function getBonusBooks(allowedKeys?: ReadonlySet<string>): Promise<BookOption[]> {
  const usable = usableOddsBooks();
  const filtered = allowedKeys ? usable.filter((b) => allowedKeys.has(b.key)) : usable;
  return filtered.map((b) => ({ key: b.key, displayName: b.displayName }));
}
```

**New `getUserBookKeys`/`saveUserBooks` — model on the existing `getCachedEvents`-style "select rows, map to plain shape" pattern** (`src/db/queries.ts` lines 52-80, structure only — not the sport-specific logic):
```typescript
export async function getUserBookKeys(userId: number): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ bookKey: userBooks.bookKey }).from(userBooks).where(eq(userBooks.userId, userId));
  return rows.map((r) => r.bookKey);
}
```
For `saveUserBooks(userId, keys)`, model the "delete-then-insert" idiom from `src/ingestion/odds/store.ts`'s `replaceSportStatements` (lines 54-76) — delete all of this user's `userBooks` rows, then bulk-insert the new set, in one `db.batch([...])` transaction (same all-or-nothing reasoning as `commitOddsRefresh`, lines 97-104).

**Test analog:** `src/db/queries.test.ts` (full file shown above, 22 lines) — the `vi.mock("./client", () => ({ getDb: vi.fn(() => { throw ... }) }))` guard pattern proves a function never falls back to the DB when it shouldn't; adapt this shape (mock the DB, assert on the returned shape) for `getUserBookKeys`/`saveUserBooks` unit tests.

---

### `src/ingestion/odds/store.ts` (modified — `recordCreditUsage` gains attribution)

**Analog:** self, `recordCreditUsage` (lines 131-141) and `CreditUsageRow` interface (lines 17-27).

**Current:**
```typescript
export interface CreditUsageRow {
  requestsRemaining: number;
  requestsUsed: number;
  refreshCost: number;
  sportsFetched: number;
  recordedAt: Date;
}

export async function recordCreditUsage(row: CreditUsageRow): Promise<void> {
  const db = getDb();
  await db.insert(creditUsage).values({
    requestsRemaining: row.requestsRemaining,
    requestsUsed: row.requestsUsed,
    refreshCost: row.refreshCost,
    sportsFetched: row.sportsFetched,
    recordedAt: row.recordedAt,
  });
}
```
**Change:** add `triggeredByUserId: number | null` to `CreditUsageRow` and pass it through to `.values({...})`. Update every call site (`src/ingestion/odds/refresh.ts` line 189, `refreshExtended.ts`'s equivalent call) to supply it from the action's session.

---

### `src/ingestion/odds/status.ts` (modified — join `users`, add `refreshedByDisplayName`)

**Analog:** self (full file shown above, 78 lines) — `getOddsStatus()` already composes several independent reads via `Promise.all` (lines 37-41) and derives a DTO field-by-field (lines 66-77); add one more derived, optional field the same way.

**Pattern to follow:** extend `getLatestCreditUsage()` (in `store.ts`) to left-join `users` on `triggeredByUserId` and return an optional `triggeredByDisplayName`, then in `status.ts` add `refreshedByDisplayName: latest?.triggeredByDisplayName ?? undefined` to the returned `OddsStatus` object (lines 66-77) — never a placeholder string, per D-21's "no placeholder" rule and this file's own existing "never invent a balance" comment style (line 180 in `refresh.ts`, same philosophy).

---

### `src/app/page.tsx` (modified — require session)

**Analog:** self (full file, 19 lines) — the `Promise.all` + `force-dynamic` convention is the thing to preserve exactly.

**Current:**
```typescript
export const dynamic = "force-dynamic";

export default async function Home() {
  const [bonusBooks, freshness, status] = await Promise.all([
    getBonusBooks(),
    getOddsFreshness(),
    getOddsStatus(),
  ]);
  return <AppShell status={status} bonusBooks={bonusBooks} hasCachedOdds={freshness !== null} />;
}
```
**Change:** call `const session = await getSession();` first; if `!session.userId`, `redirect("/login")` (Next.js `next/navigation`'s `redirect`, no precedent in-repo yet but this is the standard App Router idiom RESEARCH.md's Pattern 1/diagram assumes). If `session.userId` exists but `(await getUserBookKeys(session.userId)).length === 0`, `redirect("/onboarding/books")` (D-08). Otherwise fetch `userBookKeys` alongside the existing `Promise.all` and pass into `getBonusBooks(new Set(userBookKeys))`.

---

### `src/app/login/page.tsx`, `src/app/invite/[token]/page.tsx`, `src/app/onboarding/books/page.tsx`, `src/app/settings/page.tsx` (new/modified routes)

**Analog:** `src/app/page.tsx` for the "async Server Component reads server-only data, no client fetch" shape; `src/app/layout.tsx` for how `RootLayout` wraps `children` (these new pages render inside the same root layout, so no new provider/font logic is needed — reuse `TooltipProvider` from `layout.tsx` lines 21-29 unmodified).

**Unauthenticated pages** (`/login`, `/invite/[token]`) render **without** `AppShell`/`AppHeader`/`OddsStatusBar` per UI-SPEC — do not import `AppShell`; build a minimal centered-column wrapper directly in each page component (UI-SPEC's `max-w-[400px]`/`max-w-[480px]` centered `Card` layout), following the existing convention of composing `Card`/`Input`/`Label`/`Button` from `src/components/ui/*` directly rather than introducing a new layout primitive.

**Authenticated pages** (`/onboarding/books`, `/settings`) call `requireSession()` first (redirect to `/login` if absent), matching the `page.tsx` → `redirect()` pattern above.

---

### `src/components/AppHeader.tsx` (new component)

**Analog:** `src/components/finder/OddsStatusBar.tsx` for the "sticky-row composed of a status message + one action button, inside a `max-w-[1080px]` centered container" shape (lines 126-129) — **do not** copy the `sticky` class per UI-SPEC's explicit "AppHeader is not sticky" decision.

**Container/row shape to copy** (`src/components/finder/OddsStatusBar.tsx` lines 126-129, adapt classes per UI-SPEC's `h-14`/`bg-secondary`/non-sticky spec):
```typescript
<div className="border-b border-border bg-secondary px-4 py-3">
  <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-2">
    <div className="flex flex-wrap items-center justify-between gap-2">
      {/* left: wordmark, right: AccountMenu trigger */}
    </div>
  </div>
</div>
```

---

### `src/components/AccountMenu.tsx` (new component)

**Analog:** `src/components/finder/RefreshConfirmDialog.tsx` for "client component wrapping a shadcn overlay primitive, calling a server action and handling its outcome" (not read in full this pass, but its usage in `OddsStatusBar.tsx` lines 210-216 shows the `open`/`onOutcome`/`onCancel` prop contract convention to mirror for consistency). Since `AccountMenu` is simpler (no confirm-dialog step), the closer structural analog is any `"use client"` component that calls a server action directly inside an event handler — see `src/components/finder/OddsStatusBar.tsx`'s `startRefresh()` (lines 118-124):
```typescript
function startRefresh() {
  setBanner({ kind: "none" });
  startTransition(async () => {
    const outcome = await refreshOdds({ confirmed: false });
    handleOutcome(outcome);
  });
}
```
**Apply:** `AccountMenu`'s "Log out" item calls `logout()` inside a `useTransition`, then `router.push("/login")` (or `router.refresh()` if a redirect happens server-side inside the action). Use the `dropdown-menu` shadcn block (new — `npx shadcn add dropdown-menu`) for the trigger/content/item structure; no other component in the repo uses `dropdown-menu` yet, so follow the official shadcn API as scaffolded, not an in-repo precedent.

---

### `src/components/settings/BookPicker.tsx` (new, shared by onboarding + settings)

**Analog:** `src/components/finder/FinderForm.tsx` lines 198-230 — the exact full-row-tappable checkbox idiom UI-SPEC explicitly calls out to reuse ("same tap-row idiom" — UI-SPEC lines 69, 78).

**Checkbox-row pattern to copy** (`src/components/finder/FinderForm.tsx` lines 198-209):
```tsx
<Label
  htmlFor="limitHedgeAmount"
  className="min-h-10 w-fit cursor-pointer gap-2 font-normal"
>
  <Checkbox
    id="limitHedgeAmount"
    checked={limitHedgeChecked}
    onCheckedChange={(checked) => setLimitHedgeStored(checked ? "true" : "false")}
  />
  Limit hedge amount
</Label>
```
**Apply:** render one such row per `usableOddsBooks()` entry (7 rows, D-10), each `Label`/`Checkbox` pair driven by local component state (an array or `Set<string>` of checked keys), `w-full` instead of `w-fit` (UI-SPEC: "the whole row... is the tap target"). Parent (`onboarding/books/page.tsx`'s client wrapper, or `settings/page.tsx`'s client wrapper) owns the "≥1 checked" validation and disables the CTA — mirror `ArbForm.tsx`'s `searchDisabled` boolean-composition pattern (lines 174-177) for computing the CTA's `disabled` prop from multiple conditions.

---

### `src/components/auth/LoginForm.tsx` / `src/components/auth/InviteForm.tsx` (new components)

**Analog:** `src/components/finder/FinderForm.tsx` (full file, 253 lines) — react-hook-form + `zodResolver`, one submit button, `useTransition`, server-error-to-field-error mapping. This is the closest existing "form with a few fields + one primary CTA + server-side re-validation" shape in the codebase (per RESEARCH.md's explicit call-out: "auth forms are closer to `FinderForm.tsx`'s shape" than `ArbForm.tsx`'s auto-compute-on-change shape).

**Form scaffold to copy** (`src/components/finder/FinderForm.tsx` lines 82-120, structure only):
```typescript
const form = useForm<FormValues>({
  resolver: zodResolver(InputSchema),
  defaultValues: { /* ... */ },
});

const onSubmit = form.handleSubmit((values) => {
  startTransition(async () => {
    const result = await serverAction(values);
    if (result.status === "invalid") {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        const message = messages?.[0];
        if (!message) continue;
        form.setError(field as keyof FormValues, { message });
      }
      return;
    }
    // success: redirect (handled by the server action or router.push here)
  });
});
```
**Field markup to copy** (`FinderForm.tsx` lines 184-196, `Input` + `Label` + inline error paragraph):
```tsx
<div className="flex min-w-0 flex-1 flex-col gap-2">
  <Label htmlFor="bonusAmount">Bonus amount</Label>
  <Input id="bonusAmount" inputMode="decimal" className="num h-10" placeholder="$0.00" {...form.register("bonusAmount")} />
  {form.formState.errors.bonusAmount ? (
    <p className="text-sm text-destructive">{form.formState.errors.bonusAmount.message}</p>
  ) : null}
</div>
```
Adapt for `type="email"`/`type="password"` inputs per UI-SPEC; drop the `.num`/`inputMode="decimal"` classes (money-specific, not applicable to auth fields).

**Note:** `z.input<typeof Schema>` vs. the resolved output type is a known zod@4 + `@hookform/resolvers` pitfall already solved once in this codebase (`FinderForm.tsx` lines 27-31) — reuse the same `type FormValues = z.input<typeof InputSchema>;` escape hatch for `LoginInputSchema`/`InviteRedemptionInputSchema`.

---

### `scripts/invite-create.ts` (new CLI script)

**Analog:** `scripts/refresh-odds.ts` (full file, 41 lines) — CLI wrapper around a server-side domain function, `process.argv.includes("--flag")` for options, `console.log(JSON.stringify(...))` for output, explicit `process.exit(code)` per outcome branch.

**Full pattern to copy:**
```typescript
import { runOddsRefresh } from "../src/ingestion/odds/refresh";

async function main() {
  const confirmed = process.argv.includes("--yes");
  const outcome = await runOddsRefresh({ confirmed });
  console.log(JSON.stringify(outcome, null, 2));
  switch (outcome.status) {
    case "ok": process.exit(0); break;
    // ... one case per outcome status
  }
}

main().catch((err) => {
  console.error("odds:refresh failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
```
**Apply:** `invite-create.ts` generates a token via `randomBytes(32).toString("base64url")` (RESEARCH.md Don't-Hand-Roll — matches this codebase's existing `randomUUID()` precedent in `src/ingestion/odds/refresh.ts` line 61 for "use `node:crypto`, not a package"), hashes it (SHA-256) for storage, inserts an `invites` row with `expiresAt = now + 7 days`, and prints the plain (unhashed) link/token to stdout — the hash is stored, the plaintext is only ever in this one console line, per RESEARCH.md's Anti-Patterns section and Open Question 2's `APP_URL` env-var recommendation.

**`package.json` script registration convention** (existing `scripts` block, e.g. `"odds:refresh": "tsx --env-file=.env.local scripts/refresh-odds.ts"`) — add `"invite:create": "tsx --env-file=.env.local scripts/invite-create.ts"` and `"password:reset": "tsx --env-file=.env.local scripts/password-reset.ts"` in the same style.

---

### `scripts/password-reset.ts` (new CLI script)

**Analog:** `scripts/seed.ts` (full file, 122 lines) — the closest existing "CLI script that does a direct DB write via `getDb()`, not through a server action" shape, plus its `main().then(() => process.exit(0)).catch((err) => { console.error(...); process.exit(1); })` bottom-of-file idiom (lines 116-121).

**Bottom-of-file idiom to copy exactly** (`scripts/seed.ts` lines 116-121):
```typescript
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
```
**Apply:** `password-reset.ts` takes an email (`process.argv[2]`) and a generated or provided temp password, hashes it via `@node-rs/argon2`, and `UPDATE users SET password_hash = ... WHERE lower(email) = ...` via `getDb()` directly (same `import { getDb } from "../src/db/client";` line as `scripts/seed.ts` line 12).

---

## Shared Patterns

### Session-required guard (D-20, closes WR-05)
**Source:** RESEARCH.md Pattern 1 (`src/lib/session.ts`, new file — no existing in-repo analog since this is the first auth code in the project)
**Apply to:** every server action in `src/app/actions/*` except none are exempt from *some* check — `login.ts` and `redeem-invite.ts` are the only two that don't require an *existing* session (they *create* one), every other action (`find-hedges`, `find-arbs`, `refresh-odds`, `refresh-spreads-totals`, `save-books`, `logout`) must call `requireSession()`/`getSession()` as its first statement.
```typescript
const session = await getSession();
if (!session.userId) {
  return { status: "error", message: "Not signed in" }; // or redirect(), for page components
}
```

### Zod `safeParse` → typed outcome (existing project-wide convention)
**Source:** `src/app/actions/find-hedges.ts` lines 86-91, `src/app/actions/refresh-odds.ts` lines 14-18 — every server action in the codebase already follows this, no deviation needed for the new auth actions.
```typescript
const parsed = SomeInputSchema.safeParse(input);
if (!parsed.success) {
  const { fieldErrors } = z.flattenError(parsed.error);
  return { status: "invalid", fieldErrors };
}
```

### Revalidate-on-success, never on failure (D-19 correctness constraint)
**Source:** `src/app/actions/refresh-odds.ts` lines 22-24, `src/app/actions/refresh-spreads-totals.ts` lines 23-25
**Apply to:** `save-books.ts` — call `revalidatePath("/")`/`revalidatePath("/settings")` only after a successful write, and (per RESEARCH.md Pitfall 5) never import anything from `src/ingestion/odds/refresh.ts`/`refreshExtended.ts` from this action.

### Doc-comment convention citing decision/requirement IDs
**Source:** pervasive across the codebase — `src/db/schema.ts` lines 1-8, `src/db/queries.ts` lines 12-19, `src/ingestion/odds/refresh.ts` lines 1-5, `src/components/AppShell.tsx` lines 20-28
**Apply to:** every new file this phase — a leading `/** ... */` block naming the specific D-xx/DASH-xx/BONUS-xx/CALC-06 IDs the file satisfies, matching this project's established self-documentation style (helps a future reader trace code back to `02-CONTEXT.md` without re-deriving intent).

### Alert component for advisories/errors (CALC-06 + general banner pattern)
**Source:** `src/components/arb/ArbForm.tsx` lines 279-285 (copy **verbatim**, including copy text, for the finder's new CALC-06 advisory) and lines 242-276 (the `Alert`/`Alert variant="destructive"` pattern for warning/blocked/error banners)
```tsx
<Alert>
  <AlertDescription>
    Placing exact, identically-sized stakes across several books is a known pattern
    sportsbooks use to detect and limit arbing accounts. That risk exists for every row
    below — it&apos;s not a reason to skip a profitable one, just something to weigh.
  </AlertDescription>
</Alert>
```
**Apply to:** `FinderForm.tsx` (copy this exact block, placed per UI-SPEC "directly above the results list, below the finder form card"); `settings/page.tsx`'s save-success confirmation (neutral `Alert`, no variant, per UI-SPEC line 80); `login`/`invite` forms' credential/validation error banners (`Alert variant="destructive"`, same as the blocked/error banners in `OddsStatusBar.tsx` lines 192-207).

### EmptyState "new variant, existing component" pattern (D-18)
**Source:** `src/components/finder/EmptyState.tsx` (full file, 77 lines) — the `EmptyStateVariant` union + `COPY` record + "one variant needs runtime interpolation, handled by an early-return branch" idiom (lines 9, 57-67)
**Apply to:** add a `"no-books-covered"` variant (or similar) to `EmptyStateVariant`, following the exact same early-return-for-dynamic-copy shape used for `"no-results-under-limit"` (lines 57-67) since this variant also needs a dynamic element — a `Button`/link to `/settings` — that a static `COPY` record entry can't express. Same treatment applies to `src/components/arb/ArbEmptyState.tsx` for D-16/D-18's Arbitrage-tab equivalent.

### Book-filtering seam: `allowedBookKeys: ReadonlySet<string>` (BONUS-02, D-14, D-16, D-17)
**Source:** `src/domain/hedge/marketFilter.ts` lines 26-31 (`MarketFilterOptions.allowedBookKeys`), already consumed identically by `extractTwoWayMoneylines`, `extractTwoWaySpreadsAndTotals`, and (via `rankArbs`) every arb-leg tie-break in `MultipleBooksPopover`.
**Apply to:** the *only* change needed at the engine boundary is what set gets passed in — from "every usable book" to "this session's user's books ∩ usable books." No changes needed inside `src/domain/hedge/*` or `src/components/arb/MultipleBooksPopover.tsx` themselves (confirmed by RESEARCH.md's direct source reads and this pass's read of `marketFilter.ts`).

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `src/proxy.ts` | middleware | request-response | First network-boundary file in the project (no `middleware.ts` predecessor to migrate from) — use RESEARCH.md's Pattern 2 code block as the authoritative source instead of an in-repo analog. |
| `src/lib/session.ts` | utility | request-response | No prior session/auth code exists in the repo — structure borrows the "lazy singleton, throw if env var missing" shape from `src/db/client.ts`, but the iron-session-specific API calls must come from RESEARCH.md's Pattern 1 / the iron-session README, not an in-repo precedent. |

## Metadata

**Analog search scope:** `src/app/`, `src/components/`, `src/db/`, `src/domain/`, `src/ingestion/`, `src/lib/`, `scripts/` (entire `src/` tree and `scripts/` directory enumerated via `find`; no directories excluded)
**Files scanned:** 31 non-test source files read or grepped this session, plus 3 test files for the Vitest mocking convention
**Pattern extraction date:** 2026-09-26
