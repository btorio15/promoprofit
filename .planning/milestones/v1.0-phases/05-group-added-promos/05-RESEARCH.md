# Phase 5: Group-Added Promos - Research

**Researched:** 2026-09-29
**Domain:** Member-entered (personal) promos on top of the existing scrape-shaped `promos` table, feed, and hedge engine (Next.js 16 server actions, Drizzle/Neon, decimal.js)
**Confidence:** HIGH (all findings come from reading this repo's code; no new libraries)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** No shared promos - added promos are personal only. A promo a member adds is visible only to that member (their Promos list, Opportunities, totals). No shared/private toggle. PROMO-02 revised accordingly.
- **D-02:** The "Add promo" button lives at the top of Promos > Active.
- **D-03:** One screen whose fields change with the promo type. Book + type (profit boost / bonus bet) at the top; only that type's fields show below.
- **D-04:** Game selection uses the Phase 3 search/date-range picker (ScopePicker: "One game" search box or "All {league} games" with From/Through days) - never a long dropdown. Roadmap criterion 1's "dropdown" wording is superseded.
- **D-05:** Profit boost required fields: book, boost % or boosted odds, game(s), max stake. Optional: max winnings (with its kind), min odds, market/side pin, expiry. Expiry defaults to the start of the last game in scope. (No boost goes live without a max stake, CR-04.)
- **D-06:** Boost % or boosted odds - either one, via a toggle; the profit-boost engine already handles both.
- **D-07:** Bonus bet required fields: book, amount, expiry. Game/league/date range optional (unrestricted means the app picks the best conversion across cached games); optional min odds.
- **D-08:** Only the member's own books appear in the book list.
- **D-09:** Live immediately on save - no review queue for hand-added promos.
- **D-10:** Only the member who added a promo can edit, expire, or delete it. Changes show in Promos and Opportunities immediately.
- **D-11:** Deleting a promo that was already marked done keeps its Done entry and profit in Total profit extracted; deletion must not cascade away completion history.
- **D-12:** A hand-added promo stays separate from scraped promos - never merged. Non-blocking note "This looks like a promo already in your list." when an obvious match exists.

### Claude's Discretion
- Exact form layout, validation messages, "Added by you" tag, edit flow (same form prefilled), expire vs delete controls, empty/error states.
- Data model for ownership (`added_by_user_id` on `promos` vs separate table). If the schema changes, a drizzle migration is required and applying it to live Neon needs the owner's explicit OK at execution time (blocking, non-autonomous task).

### Deferred Ideas (OUT OF SCOPE)
- Sharing added promos with the group.
- New promo types (second-chance, deposit match), changes to scraping.
- Kalshi/Polymarket, scheduled scrape fix, Phase 4 code-review warnings WR-01..WR-04.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PROMO-01 | Any member can add a promo (book, type, boost % or boosted price, market, max stake, max winnings, expiry) by picking a real upcoming event; it feeds the opportunities feed | `addPromo` server action + zod input; reuse `resolveMemberScope` + `ScopePicker`; synthesize a valid `ScrapedPromo` for the `parsed` column; insert as `status='active'` so `getActivePromos` returns it; unrestricted bonus bet needs new `scope_kind='any'` (see Pitfall 3) |
| PROMO-02 (revised) | Added promos are personal - visible only to the adding user | `added_by_user_id` column; `getActivePromos(now, viewerUserId?)` visibility predicate (default = scraped only); observation read filter (Pitfall 2) |
| PROMO-05 | User can edit, expire, or delete promos they added | `editPromo` / `expirePromo` / `deletePromo` actions with ownership predicate in the WHERE clause; soft delete (`status='deleted'`) preserves Done history (Pitfall 1) |
</phase_requirements>

## Summary

The phase is almost entirely plumbing into existing machinery. The hedge math (`profitBoost.ts`, `bonusBet.ts`, `rankPromoHedges.ts`) already handles boost %, published boosted price, caps and min odds; `ScopePicker`, `scopeDraft.ts`, `resolveMemberScope` already give validated game/day-range selection. The work is: (1) one additive migration (a nullable owner column), (2) a member-scoped visibility predicate in `getActivePromos` and every caller, (3) four owner-checked server actions, (4) a form + row-action UI per the approved UI-SPEC, (5) closing five leaks/hazards where scraped-promo assumptions would corrupt or expose added promos.

Five hazards are non-obvious and drive the plan (details in Pitfalls): the `promo_completions.promo_id` FK is `ON DELETE CASCADE` (hard delete would erase Done history - D-11); `promo_profit_observations` are read group-wide (an added promo would inflate other members' "available profit"); `getActivePromos` drops any promo with null `scope_kind` (an unrestricted bonus bet, D-07, would silently vanish); the scraper's expire-unseen `UPDATE` matches by `book_key` only (it would expire added promos on every scrape); and a "Boosted odds" boost is ignored by the engine unless the promo is pinned to a market (a boost with neither usable price produces no result).

**Primary recommendation:** Add `promos.added_by_user_id` (nullable FK to users, ON DELETE CASCADE), keep hand-added promos in the same `promos` table with `status='active'`, soft-delete via `status='deleted'`, add `scope_kind='any'` for unrestricted bonus bets, and make `getActivePromos(now, viewerUserId?)` the single visibility choke point (default = scraped-only, secure by default).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Form UI, type-switching fields, ScopePicker, validation messages | Browser / Client | - | Interactive inline panel (client component, react-hook-form/zod optional) |
| Authoritative validation (money, odds, scope, ownership) | API / Backend (server actions) | - | Never trust client; `requireUser()` first, strict zod without userId, `resolveMemberScope` re-run server-side |
| Visibility (personal-only) | API / Backend + Database | - | Enforced in the SQL WHERE of `getActivePromos`, not in UI |
| Hedge math / ranking | API / Backend (domain, pure) | - | Existing `rankPromoHedges`; decimal.js only |
| Persistence, soft delete, ownership | Database / Storage | - | `promos.added_by_user_id`, `status` text |
| Game option list for the picker | API / Backend | Browser | `listCorrectionOptions` reads cached odds; fetch on panel open |

## Standard Stack

No new packages. Everything below is already in `package.json` [VERIFIED: /Users/bentorio/Desktop/Personal Projects/promoprofit/package.json].

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| drizzle-orm / drizzle-kit | ^0.45.3 / ^0.31.11 | Schema + migration | Repo standard; 10 migrations exist |
| @neondatabase/serverless (neon-http) | 1.1 | Driver | No interactive transactions; use single conditional UPDATE / `db.batch` |
| zod | ^4.6.5 | Strict action inputs | Existing pattern (`reviewInput.ts`, `z.strictObject`, no userId field) |
| decimal.js | ^10.6.0 | Money | Store numerics as `Decimal(x).toFixed(2)`; never `number` math |
| vitest | ^5.0.2 | Tests | `include: src/**/*.test.ts`, node environment |
| react-hook-form + @hookform/resolvers | ^7.88 / ^5.9 | Optional form state | Present; existing forms may use plain state - follow `ClassifyQueueCard`/`ReviewPanel` idiom |

**Installation:** none. **Package Legitimacy Audit:** no external packages are recommended by this phase - not applicable.

## Architecture Patterns

### Files to touch (verified)
- Schema: `/Users/bentorio/Desktop/Personal Projects/promoprofit/src/db/schema.ts` (table `promos`, line ~196). Migration config: `drizzle.config.ts` (`out: ./drizzle`, schema `./src/db/schema.ts`, reads `DATABASE_URL` from `.env.local`). Latest migration `drizzle/0009_done_snapshots.sql`, journal `drizzle/meta/_journal.json` idx 9.
- Read path: `src/db/promos.ts` (`getActivePromos`, `mapActivePromoRow`, `ActivePromo`), `src/db/feedContext.ts` (`loadMemberFeedContext`, `loadAvailableProfit`), `src/db/memberPromoState.ts`, `src/db/promoObservations.ts`, `src/db/promoTracking.ts` (`getPromoCompletions`, `getProfitObservationsSince`), `src/app/actions/get-promos.ts`, `get-opportunities.ts`.
- Scraper hazard: `src/ingestion/promos/store.ts` (~line 578 expire-unseen UPDATE).
- Scope: `src/domain/promos/scope.ts` (`PromoScope`, `eventInScope`), `memberScope.ts` (`resolveMemberScope`).
- UI: `src/components/promos/PromosScreen.tsx`, `PromoRow.tsx`, `PromoDetails.tsx`, `DonePromoRow.tsx`, `ScopePicker.tsx`, `DismissPromoDialog.tsx` (pattern for new dialogs), `PromosEmptyState.tsx`; DTOs in `src/domain/promos/dto.ts`, `promoRowDto.ts`, `doneSnapshot.ts`.

### Data flow
```
AddPromoForm (client) --payload--> addPromo (server action)
   requireUser -> zod strict parse (no userId) -> user's books check (getUserBookKeys)
   -> resolveMemberScope(scope, cached events) -> optional pin resolveSelection
   -> build ScrapedPromo (for parsed jsonb) validated by ScrapedPromoSchema
   -> INSERT promos (status='active', added_by_user_id=session user, dedupe_key='added:'+uuid)
   -> revalidatePath("/")
getPromos / getOpportunities / computeMemberPromoState / loadMemberFeedContext
   -> getActivePromos(now, user.userId)  [scraped OR own added]
   -> rankPromoHedges (unchanged) -> DTO (+ addedByYou) -> PromoRow ("Added by you" + actions)
editPromo / expirePromo / deletePromo
   -> UPDATE promos ... WHERE id=? AND added_by_user_id=<session user> AND status='active'
      (0 rows => "not found", no info leak)
```

### Pattern 1: Ownership in the WHERE clause (IDOR guard)
Mirror `applyDismissal`/`applyFlag` (single conditional UPDATE `.returning({id})`, gate on row count). Input schemas are `z.strictObject` with `promoId` only - never a userId.
```typescript
// Source: pattern from src/db/promoReview.ts (applyFlag) + src/app/actions/dismiss-promo.ts
const rows = await db.update(promos)
  .set({ status: "expired" })
  .where(and(eq(promos.id, promoId), eq(promos.addedByUserId, userId), eq(promos.status, "active")))
  .returning({ id: promos.id });
return rows.length === 1;
```

### Pattern 2: Visibility choke point
```typescript
// getActivePromos(now, viewerUserId?) -- default (no viewer) = scraped only
const visible = viewerUserId === undefined
  ? isNull(promos.addedByUserId)
  : or(isNull(promos.addedByUserId), eq(promos.addedByUserId, viewerUserId));
```
Callers that must pass the session user id: `get-promos.ts`, `feedContext.loadMemberFeedContext` (also feeds `memberPairState`), `memberPromoState.computeMemberPromoState` (mark-done). Callers that must NOT: `scripts/promos-check.ts`, `morningObserve` path (default scraped-only keeps group observations clean).

### Pattern 3: Synthetic `parsed` for added promos
`promos.parsed` is NOT NULL and `mapActivePromoRow` re-validates it with `ScrapedPromoSchema` (takes `eligibleMarketTypes`, `claimRequired`). Build a full valid `ScrapedPromo`: `externalId:null`, `title` (e.g. "{Book} profit boost"), `rawText:""` (max 2000, allowed empty), `sourceUrl:"user-added"` (schema requires min 1; column NOT NULL), `scopeText`/`teamsText` ([] or 2 names), `eligibleMarketTypes:[...PROMO_MARKET_TYPES]` (or just the pinned market), `claimRequired:null`, `unparsedCapFields:[]`, `finePrintNote:null`. Validate with `ScrapedPromoSchema.safeParse` before insert (same as `classify-promo.ts`). `dedupe_key`: `` `added:${crypto.randomUUID()}` `` (unique, NOT NULL; cannot collide with scrape keys). `first_seen_at`/`last_seen_at` = now.

### Pattern 4: `scope_kind='any'` for unrestricted bonus bets (D-07)
`getActivePromos` requires a non-null `scope_kind` and drops unknown kinds. Add a third scope: `PromoScope` gains `{ kind: "any" }`; `eventInScope` returns true for it (still filtered to future events by `enumerateScopeSelections`); `getActivePromos` WHERE gains `and(eq(scopeKind,'any'), isNotNull(expiresAt), gt(expiresAt, now))` (bonus expiry is required by D-07, so it is always bounded); `mapActivePromoRow` gets an `any` branch with `scopeLabel = "Any game"`. `sport_key` is null for these rows. Bonus bet only (boost requires a game per D-05). A grep of `scope.kind`/`.scope` shows only `eventInScope`, `enumerateScopeSelections`, `mapActivePromoRow` consume `PromoScope`; `store.ts`/`promoReview.ts` use `ScopeGuess` (a different type) and are untouched. No migration (text column). [VERIFIED: codebase grep]

### Pattern 5: Picker options on demand
`getPromos` only builds `correctionOptions` when the review queue needs them. Add a small server action (e.g. `getAddPromoFormOptions`) called when the panel opens: `requireUser()`, then `listCorrectionOptions({moneyline, extended}, {now})` from `getCachedEvents()`/`getCachedExtendedEvents()` plus `getUsableUserBooks(userId)` (the "usable saved books" predicate in `queries.ts`, D-08). Zero Odds API credits (cache reads only).

### Recommended structure
```
src/domain/promos/addedPromoInput.ts   # zod strict schemas (add/edit) + cross-field rules
src/domain/promos/buildAddedPromo.ts   # pure: input + resolved scope -> row values + ScrapedPromo
src/domain/promos/duplicateHint.ts     # pure: draft vs visible scraped promos (D-12)
src/db/addedPromos.ts                  # insert/update/expire/softDelete/getOwn (ownership in WHERE)
src/app/actions/{add,edit,expire,delete}-promo.ts + get-add-promo-options.ts
src/components/promos/{AddPromoForm,AddedPromoActions,ExpirePromoDialog,DeletePromoDialog}.tsx
```

### Anti-Patterns
- **Hard `DELETE`** of an added promo: cascades `promo_completions` and `promo_profit_observations` (FKs are `ON DELETE cascade`, migration 0006) and destroys Done history. Use soft delete.
- **Client-supplied user id / ownership flags** in any input schema.
- **Trusting client scope**: always re-resolve via `resolveMemberScope` (bounds recomputed server-side, 7-day window `DEFAULT_WINDOW_DAYS`).
- **Float money**: convert with `new Decimal(x).toFixed(2)`; boost percent stored `numeric(7,2)`.
- **Making the added row "pending_review"**: D-09 says live immediately; also never let review actions (`flag-promo-match` requires `auto_matched=true`; confirm/correct/classify require `pending_review`) touch it - they don't as long as `auto_matched=false`, `status='active'`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Game/day-range selection | New dropdown/search | `ScopePicker` + `scopeDraft.ts` + `gameSearch.ts` | Owner rejected dropdowns (D-04) |
| Server scope validation | Own date/event checks | `resolveMemberScope` | ET-day bounds, staleness, WR-12 impossible dates |
| Market/side pin resolution | Own pin logic | `resolveSelection` as in `correct-promo-match.ts` + `PinnedSelectionInputSchema` shape in `reviewInput.ts` | Half-point line rules, live-quote existence |
| Hedge/stake math | Any arithmetic in actions/UI | `rankPromoHedges` / `profitBoost` / `bonusBet` | Cent-exact, cap semantics |
| American odds / money parsing | Regex from scratch | `AmericanOddsSchema`, `MoneyStringSchema` in `scraped.ts` | Same validation as scraped caps |
| Dialog UX | New dialog | Pattern of `DismissPromoDialog.tsx` (AlertDialog) | UI-SPEC says pattern on it |
| ET expiry from date+time | Manual TZ math | `etTime.ts` (`etDayBounds`, `parseEtDateTime`) | DST-correct |

## Runtime State Inventory

Not a rename/migration phase, but there is one live-data change: an additive column on `promos`.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | Existing `promos` rows (scraped) all get `added_by_user_id = NULL` (= shared/scraped) - nullable column, no backfill | Migration (owner OK at execution) |
| Live service config | None - verified: no external service references promo ownership | None |
| OS-registered state | None | None |
| Secrets/env vars | `DATABASE_URL` in `.env.local` used by `drizzle-kit migrate` (pooled Neon URL has unescaped `&` - never `source` it in zsh; STATE decision) | None |
| Build artifacts | None | None |

## Migration approach (owner OK required)

1. Edit `src/db/schema.ts` `promos`: add `addedByUserId: integer("added_by_user_id").references(() => users.id, { onDelete: "cascade" })` and `index("promos_added_by_user_id_idx").on(table.addedByUserId)`.
   - Use `cascade`, NOT `set null`: `set null` on user deletion would turn a private promo into a null-owner (= visible to everyone) promo. (User deletion doesn't happen in practice; cascade is the safe failure mode.)
2. Generate: `npm run db:generate` (= `drizzle-kit generate`) creates `drizzle/0010_*.sql` + `drizzle/meta/0010_snapshot.json` + journal entry. Commit all three. Expected SQL: `ALTER TABLE "promos" ADD COLUMN "added_by_user_id" integer;` + FK constraint + `CREATE INDEX`. Purely additive, nullable, no data rewrite, safe on live data.
3. Apply to Neon: `npm run db:migrate` (= `drizzle-kit migrate`, reads `DATABASE_URL` via dotenv `.env.local`). **This must be a `checkpoint:human-action`/blocking non-autonomous task requiring the owner's explicit OK** (per CONTEXT + commit f61ac2b). Precedent: prior phases committed the migration with code then applied live (e.g. "migration 0005, applied live").
4. Verify after apply: `npm run db:check` (`scripts/db-check.ts`) or a one-off query that the column exists.
5. Order: code that reads/writes `added_by_user_id` must not deploy/run before the migration is applied (queries selecting the new column would error). Plan the migration task before any task whose tests hit the live DB (unit tests here mock the db, so the ordering only matters for the running app).

No status enum change needs a migration: `promos.status` is `text`; add `"deleted"` to `PROMO_STATUSES` in `src/domain/promos/types.ts` (check exhaustive usages such as `PromoStatus` maps and `lifecycle.ts` after adding).

## Common Pitfalls

### Pitfall 1: Hard delete wipes Done history (D-11)
**What goes wrong:** `promo_completions.promo_id` FK is `ON DELETE cascade` (and `getPromoCompletions` INNER JOINs `promos`), so deleting the row removes the Done entry, its profit and the Total profit extracted.
**How to avoid:** Soft delete: `status='deleted'` (owner-checked UPDATE). The inner join still resolves, `toDoneRows` renders from the snapshot. Also `DELETE FROM promo_profit_observations WHERE promo_id=?` for a deleted promo so "available profit" drops it (observations are not history). Add a `promoAddedByUserId`/`promoStatus` field to the `getPromoCompletions` select so Done rows can hide Edit/Delete/Expire when the source is deleted/expired (UI-SPEC "Delete and Done history"). Test: delete a done promo -> `totalExtracted` unchanged, Done row still present.
**Warning signs:** any `db.delete(promos)`.

### Pitfall 2: Private promo leaks into other members' "available profit"
**What goes wrong:** `recordCurrentProfitObservations` records group-level observations (ranked at every usable hedge book) and `getProfitObservationsSince` reads ALL rows; `summarizeAvailableProfit` then filters only by promo book. `getPromos`/`getOpportunities` pass `activePromos` (which will now include the member's own added promos) into the recorder, so another member with a book at the same sportsbook would see the added promo's profit in their today/week/month figures.
**How to avoid:** Change `getProfitObservationsSince(sinceDate, viewerUserId)` to join `promos` and filter `added_by_user_id IS NULL OR = viewer`; `loadAvailableProfit` takes the user id (both callers have it). Keep the recorder's default (`getActivePromos(now)` with no viewer = scraped only) for the morning script. Update mocks in `get-promos.test.ts`/`get-opportunities.test.ts` (they mock `getProfitObservationsSince` and `getActivePromos`).
**Warning signs:** a test where user A adds a promo and user B's `availableProfit` changes.

### Pitfall 3: Unrestricted bonus bet disappears (D-07)
`getActivePromos` requires `scope_kind IS NOT NULL` and known kind; null-scope rows are dropped with a console.warn. See Pattern 4 (`scope_kind='any'`). Also ensure `eventInScope` and the pairs code treat `any` correctly (pairs use ranked opportunities, not scope).

### Pitfall 4: Scrape run expires added promos
`store.ts` expire-unseen: `UPDATE promos SET status='expired' WHERE book_key=? AND status IN ('active','pending_review') AND dedupe_key NOT IN (this run's keys)`. Added promos are at the same `book_key` and never in the run's keys -> expired on every scrape. **Fix:** add `isNull(promos.addedByUserId)` to that WHERE. Add a regression test in the ingestion store tests (look at existing `store`-related tests / `run.test.ts`, `reconcile.test.ts` for the mocking style). Also audit `scripts/promos-check.ts` and `promo-match-report.ts` (read-only; fine).

### Pitfall 5: "Boosted odds" needs a pinned selection
`rankPromoHedges.evaluateBoostCandidate` only honors `boostedOddsAmerican` for pinned candidates (`isPinned ? promo.boostedOddsAmerican : null`), and `ScrapedPromoSchema` rejects `boostedOddsAmerican` without `pinned` (D-03 rule). An unpinned boost with only boosted odds has no price -> no result (silent no-opportunity). UI-SPEC lists market/side pin as optional under "More details", which conflicts. **Recommendation (needs planner/owner awareness):** in "Boosted odds" mode require One game + a pinned market/side (validate server-side and show the pin Select in the main section when Boosted odds is chosen; message e.g. "Pick the exact bet this price is for."). Boost % mode keeps the pin optional. For a pinned boost-% promo the engine can also use `baseOddsAmerican` but live quotes suffice - leave `baseOddsAmerican` null.
Also: an unpinned boost-% promo requires a live promo-book quote in cached odds (else that candidate is skipped) - normal, shows in "unprofitable"/empty states.

### Pitfall 6: `max winnings` kind mapping
The DB constraint (`mapActivePromoRow`) drops a promo with `max_winnings` but no valid `max_winnings_kind`. UI labels "Total payout" | "Extra winnings" map to `WINNINGS_CAP_KINDS` = `net_winnings | total_payout | boost_extra`. Map "Total payout" -> `total_payout`, "Extra winnings" -> `boost_extra` [ASSUMED from label semantics; confirm against `profitBoost.ts` cap-kind doc comments - note `boost_extra` requires `baseOddsAmerican` (throws RangeError -> candidate skipped when base odds unknown; for an unpinned promo base comes from the live promo-book quote so it works; for a pinned promo with no live quote and null `baseOddsAmerican` it will fail)]. Verify in Wave 1 with a unit test through `rankPromoHedges`.

### Pitfall 7: Expiry semantics
- Boost: leave `expires_at` NULL by default; `getActivePromos` already ends an event-scoped promo at `event_commence_time` and a sport_window at `window_end` (= "start of the last game" default, D-05). Only set `expires_at` when the member overrides. For an event scope also set `event_commence_time`, `home_team`, `away_team` (needed by the WHERE `gt(eventCommenceTime, now)` and label) - the `ScopeGuess` from `resolveMemberScope` provides these; reuse `scopeColumnsFrom` semantics from `promoReview.ts` (module-private there - export it or duplicate carefully).
- Bonus: required, stored as ET end-of-day instant computed server-side from a date string + time; reject past (`Pick an expiry that hasn't passed.`).
- "Expire now": `status='expired'` (and only status - keep data for Done rows).

### Pitfall 8: Edit vs Done
Editing in place keeps `id`, so an existing Done snapshot is unaffected (snapshot is frozen). Type and Book are locked on edit (UI-SPEC). Editing an expired/deleted promo must fail (WHERE `status='active'`). After edit, `revalidatePath("/")` + client refetch.

### Pitfall 9: Duplicate hint (D-12) must not leak
Compute the hint against the viewer's visible scraped promos only (already in the DTO list the client holds, or via a pure function over rows the server returns). Never query other members' added promos. Pure function `duplicateHint(draft, visiblePromoSummaries)`: same book + type + (bonus amount | boost %) + overlapping scope (event equality, or event-in-window / window overlap / any). Client-side, non-blocking.

## Code Examples

### Strict input (no userId), per existing pattern
```typescript
// Source: pattern of src/domain/promos/reviewInput.ts
export const AddPromoInputSchema = z.discriminatedUnion("promoType", [
  z.strictObject({
    promoType: z.literal("profit_boost"),
    bookKey: z.string().min(1),
    boost: z.discriminatedUnion("mode", [
      z.strictObject({ mode: z.literal("percent"), boostPercent: MoneyString /* >0 */ }),
      z.strictObject({ mode: z.literal("odds"), boostedOddsAmerican: AmericanOdds }),
    ]),
    scope: ScopeSelectionSchema,          // event | sport_day (+ optional pinned for event)
    maxStake: MoneyString,                // REQUIRED (CR-04)
    maxWinnings: z.strictObject({ amount: MoneyString, kind: z.enum(["total_payout","boost_extra"]) }).optional(),
    minOddsAmerican: AmericanOdds.optional(),
    expiresAtEtDate: EtDate.optional(),   // server converts to end-of-day ET instant
  }),
  z.strictObject({
    promoType: z.literal("bonus_bet"),
    bookKey: z.string().min(1),
    bonusAmount: MoneyString,
    expiresAtEtDate: EtDate, expiresAtEtTime: EtTime.optional(),
    scope: ScopeSelectionSchema.optional(),  // omitted => scope_kind 'any'
    minOddsAmerican: AmericanOdds.optional(),
  }),
]);
```
Server checks after parse: `bookKey` in `getUserBookKeys(user.userId)` (D-08; reject otherwise), scope via `resolveMemberScope` (stale -> `{status:"stale"}` -> field error "That game isn't available any more"), decimals via `new Decimal(x).toFixed(2)`.

### Row insert values (added boost, event scope)
```typescript
{ bookKey, dedupeKey: `added:${crypto.randomUUID()}`, promoType, status: "active", autoMatched: false,
  scopeKind: "event", eventId, sportKey, eventCommenceTime, homeTeam, awayTeam,
  marketType/line/side: pinned ?? null, boostPercent, boostedOddsAmerican, maxStake, maxWinnings, maxWinningsKind,
  minOddsAmerican, parsed: validatedScrapedPromo, rawText: "", sourceUrl: "user-added",
  expiresAt, firstSeenAt: now, lastSeenAt: now, addedByUserId: user.userId }
```

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| All promos scrape-shaped/shared | Row ownership via nullable `added_by_user_id` | One table, existing ranking untouched |
| Dropdown of games | ScopePicker (search / league range) | Reuse as-is (D-04) |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | "Total payout"/"Extra winnings" map to `total_payout`/`boost_extra` cap kinds | Pitfall 6 | Wrong cap math for added boosts; verify against `profitBoost.ts` doc + a unit test |
| A2 | `scope_kind='any'` is acceptable to the owner as the representation for "unrestricted bonus bet" (vs. requiring a league) | Pattern 4 | If owner prefers required league, drop `any` (smaller change) |
| A3 | Require pin for "Boosted odds" mode (deviation from UI-SPEC's optional pin) | Pitfall 5 | Planner/UI must adjust the form; alternative is to disallow Boosted odds without a pin via validation message only |
| A4 | Deleting observations for a soft-deleted promo is desired | Pitfall 1 | Available-profit numbers slightly higher if kept |

## Open Questions (RESOLVED)

1. **Boosted odds vs optional pin** - Recommendation: make the pin required when "Boosted odds" is chosen (Pitfall 5); planner should flag to the owner as a small UI-SPEC amendment. **RESOLVED:** Plan 05-06 (boost slice) makes the pin required in Boosted odds mode as a UI-SPEC amendment (orchestrator default A3); Boost % keeps it optional.
2. **`status='deleted'` exhaustiveness** - After adding to `PROMO_STATUSES`, grep `PromoStatus` usages (`lifecycle.ts`, `store.ts`) for `Record<PromoStatus,...>` maps; the scraper must treat `deleted` rows like it treats `dismissed` (never resurrect) - moot because added promos are excluded from scraper matching by dedupe key, but confirm typecheck passes. **RESOLVED:** Plan 05-01 Task 2 adds `deleted` to the status set, updates every exhaustive map, and gates on typecheck.
3. **Done row for a deleted/expired added promo** - needs `promoAddedByUserId` + `promoStatus` on `DoneCompletionInput`/`DonePromoDTO` (e.g. `addedByYou`, `sourceActive`). Small DTO change; `doneSnapshot.test.ts` has fixtures to update. **RESOLVED:** Plan 05-09 Task 1 adds `promoAddedByUserId`/`promoStatus` to the completion query and `addedByYou`/`addedPromoStatus` to `DonePromoDTO` (Task 2 renders them on Done rows).

## Environment Availability

| Dependency | Required By | Available | Notes |
|------------|------------|-----------|-------|
| Node / npm | build, tests | assumed (engines >=22.13) | - |
| Neon `DATABASE_URL` in `.env.local` | `db:migrate` | required at execution | Owner OK required |
| Odds API credits | not used | n/a | Form reads cached odds only; 0 credits |

No other external dependencies.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest ^5.0.2, node environment |
| Config file | `/Users/bentorio/Desktop/Personal Projects/promoprofit/vitest.config.ts` (`include: src/**/*.test.ts`, `@` alias) |
| Quick run command | `npx vitest run <path/to/file.test.ts>` |
| Full suite command | `npm test` (= `vitest run`), plus `npm run typecheck` and `npm run lint` |

No component/DOM test infra (node env only) - UI behavior is covered by pure-function tests (draft/validation/duplicate hint/DTO) plus manual checks. Action tests mock db modules with `vi.hoisted` + `vi.mock` (see `src/app/actions/get-promos.test.ts`).

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PROMO-01 | Input schema: boost needs %/odds, game, max stake; bonus needs amount + future expiry; strict (no userId); book must be one of user's books | unit | `npx vitest run src/domain/promos/addedPromoInput.test.ts` | Wave 0 |
| PROMO-01 | `buildAddedPromo` yields a row that passes `ScrapedPromoSchema` and `mapActivePromoRow`-compatible columns; cents exact via Decimal | unit | `npx vitest run src/domain/promos/buildAddedPromo.test.ts` | Wave 0 |
| PROMO-01 | `addPromo` action: requireUser first, stale scope -> stale, non-owned book rejected, insert called with `addedByUserId=session` | unit (mocked db) | `npx vitest run src/app/actions/add-promo.test.ts` | Wave 0 |
| PROMO-01 | Added boost/bonus flows through `rankPromoHedges` to a positive-profit row (boost % unpinned; boosted-odds pinned; `any`-scope bonus picks best game; caps applied) | unit | `npx vitest run src/domain/promos/rankPromoHedges.test.ts` (extend) | exists, extend |
| PROMO-01 | `eventInScope` for `kind:"any"` | unit | `npx vitest run src/domain/promos/scope.test.ts` (extend) | exists, extend |
| PROMO-02 | `getActivePromos` predicate: no viewer -> scraped only; viewer A sees own not B's (query-shape test or pure predicate helper) | unit | `npx vitest run src/db/promos.test.ts` | Wave 0 |
| PROMO-02 | `getPromos`/`getOpportunities`/`computeMemberPromoState` pass session user id to `getActivePromos` | unit | `npx vitest run src/app/actions/get-promos.test.ts src/app/actions/get-opportunities.test.ts` (extend) | exist, extend |
| PROMO-02 | `getProfitObservationsSince` excludes others' added promos (available profit not inflated) | unit | `npx vitest run src/db/promoTracking.test.ts` (extend) | exists, extend |
| PROMO-02 | Scrape expire-unseen never touches `added_by_user_id IS NOT NULL` | unit | ingestion store test (extend nearest `run.test.ts`/`reconcile.test.ts`, or new `store.test.ts`) | Wave 0 |
| PROMO-05 | edit/expire/delete actions: ownership in WHERE (other user -> not found, 0 rows), requireUser first, strict input, delete = soft (`status='deleted'`), edit refused on non-active | unit | `npx vitest run src/app/actions/added-promo-actions.test.ts` | Wave 0 |
| PROMO-05 | Deleting a done promo keeps Done row + `totalExtracted` (completions untouched, join still resolves) | unit | `npx vitest run src/domain/promos/doneSnapshot.test.ts` (extend) | exists, extend |
| D-12 | `duplicateHint` matches same book/type/amount/overlap; never blocks | unit | `npx vitest run src/domain/promos/duplicateHint.test.ts` | Wave 0 |
| Schema | `npm run typecheck` (schema + `PromoScope` union exhaustiveness) | static | `npm run typecheck` | n/a |
| Migration | Additive SQL only, journal updated | manual check + owner-gated apply | inspect `drizzle/0010_*.sql`; `npm run db:check` after apply | manual |
| UI | Form focus/validation copy, badge, action dialogs per UI-SPEC | manual (phone-width) | - | manual-only: no DOM test infra |

### Sampling Rate
- Per task commit: `npx vitest run <touched test files>` (< 30s)
- Per wave merge: `npm test && npm run typecheck && npm run lint`
- Phase gate: full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `src/domain/promos/addedPromoInput.test.ts`, `buildAddedPromo.test.ts`, `duplicateHint.test.ts`
- [ ] `src/db/promos.test.ts` (visibility predicate) - or extract the predicate into a pure helper to test without a DB
- [ ] `src/app/actions/add-promo.test.ts`, `added-promo-actions.test.ts`
- [ ] Ingestion store regression test for expire-unseen exclusion
- Framework install: none needed.

## Security Domain

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (existing) | `requireUser()` as the literal first statement of every action |
| V3 Session Management | existing | iron-session, unchanged |
| V4 Access Control | **yes - core** | Ownership in SQL WHERE (`added_by_user_id = session user`); visibility choke point in `getActivePromos`; unauthorized id returns generic "not found" (no existence leak) |
| V5 Input Validation | yes | zod `strictObject`, no userId/ownership field, server-side scope re-resolution, decimal money strings, American odds bounds |
| V6 Cryptography | no | `crypto.randomUUID()` only for a dedupe key (not a secret) |

| Threat Pattern | STRIDE | Standard Mitigation |
|----------------|--------|---------------------|
| IDOR: edit/delete another member's promo by id | Tampering/Info disclosure | Ownership predicate in the UPDATE WHERE; row count check |
| Personal promo shown to other members (feed, totals, pairs, observations) | Info disclosure | Viewer-scoped `getActivePromos`; observation read filter (Pitfall 2) |
| Adding a promo for a book the user doesn't have / forged bookKey | Tampering | Validate against `getUserBookKeys(session user)` and `books` FK |
| Stored XSS via free text | Tampering | Added promos have no free-text fields beyond generated title; render as React text (as elsewhere) |
| Mass creation / oversized payloads | DoS | Strict schema bounds; optional per-user active-promo cap (e.g. 100) [ASSUMED nice-to-have] |

## Project Constraints (from CLAUDE.md)
- decimal.js for all money; format at display only. No float math.
- Drizzle ORM + Neon (`@neondatabase/serverless`, neon-http: no interactive transactions - use single conditional statements or `db.batch`); commit generated SQL migrations.
- iron-session auth; `requireUser()` first.
- Zod for validation; Vitest table-driven tests for hedge math.
- Correctness to the cent; hedge venues regulated books only; Colorado books only; free-tier Odds API credits: this phase spends none.
- GSD workflow: changes go through GSD commands; owner memory: explain decisions in plain English, no off-roadmap suggestions, push-notify at handoffs.
- No project skills directory found.

## Sources

### Primary (HIGH confidence - direct code reading, this repo)
- `src/db/schema.ts` (promos, promo_completions FK cascade, promo_profit_observations), `drizzle.config.ts`, `drizzle/meta/_journal.json`, `drizzle/0006_promo_tracking.sql`, `0009_done_snapshots.sql`
- `src/db/promos.ts`, `feedContext.ts`, `memberPromoState.ts`, `memberPairState.ts`, `promoObservations.ts`, `promoTracking.ts`, `promoReview.ts`
- `src/ingestion/promos/store.ts` (expire-unseen)
- `src/domain/promos/scope.ts`, `memberScope.ts`, `scopeDraft.ts`, `scraped.ts`, `rankPromoHedges.ts`, `types.ts`, `reviewInput.ts`
- `src/app/actions/get-promos.ts`, `get-opportunities.ts`, `classify-promo.ts`, `correct-promo-match.ts`, `dismiss-promo.ts`, `mark-promo-used.ts`
- `.planning/phases/05-group-added-promos/05-CONTEXT.md`, `05-UI-SPEC.md`, `.planning/REQUIREMENTS.md`, `CLAUDE.md`

### Secondary/Tertiary
- None (no external research needed; no new libraries).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no new dependencies
- Architecture: HIGH - derived from existing patterns in the codebase
- Pitfalls: HIGH for 1-4 (verified in code); MEDIUM for 5-6 (engine behavior read, but cap-kind label mapping is assumed)

**Research date:** 2026-09-29
**Valid until:** 30 days (codebase-internal; invalidated by changes to `getActivePromos`/schema)
