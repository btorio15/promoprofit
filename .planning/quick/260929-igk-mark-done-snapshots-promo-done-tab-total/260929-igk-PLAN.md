---
phase: quick-260929-igk
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/db/schema.ts
  - drizzle/0009_done_snapshots.sql
  - drizzle/meta/_journal.json
  - drizzle/meta/0009_snapshot.json
  - src/db/promoTracking.ts
  - src/domain/promos/doneSnapshot.ts
  - src/domain/promos/doneSnapshot.test.ts
  - src/domain/promos/promoRowDto.ts
  - src/db/memberPromoState.ts
  - src/domain/promos/reviewInput.ts
  - src/domain/promos/dto.ts
  - src/app/actions/mark-promo-used.ts
  - src/app/actions/mark-promo-used.test.ts
  - src/app/actions/get-promos.ts
  - src/app/actions/get-promos.test.ts
  - src/components/promos/MarkUsedButton.tsx
  - src/components/promos/DonePromoRow.tsx
  - src/components/promos/PromoRow.tsx
  - src/components/promos/UnprofitablePromoRow.tsx
  - src/components/promos/ProfitSummary.tsx
  - src/components/promos/PromosScreen.tsx
autonomous: true
requirements: [QUICK-260929-igk]

must_haves:
  truths:
    - "When a member taps 'Mark done' on a promo row, the server recomputes THAT member's current best hedge for that promo from cached odds (same books, same stake precision, same ranking code getPromos uses) and saves a frozen snapshot of it on the member's promo_completions row together with profit_extracted (numeric, cents)."
    - "If the recomputed guaranteed profit differs from what the member's row showed (or a profitable row is now unprofitable, or vice versa), nothing is saved; the member sees 'Odds changed since this loaded — it now shows $X. Review the updated row and mark it done again.' and the feed reloads."
    - "A greyed-out (unprofitable / nothing eligible) promo can still be marked done; it is recorded with profit_extracted = 0.00 and a 'no hedge' snapshot that keeps the note it showed."
    - "The Promos tab has an 'Active' / 'Done (n)' tab strip (same line-tab style as the app's top tabs). A done promo no longer appears in Active and is no longer counted in 'Total profit possible'."
    - "The Done tab renders each done promo only from its saved snapshot (never from live odds): game, promo side + odds + book, hedge side + odds + book, stakes, guaranteed profit, ROI/Conversion %, and the 'Marked done' date; expanding it shows the same stake/payout details panel the Active row had."
    - "A new 'Total profit extracted' figure next to 'Total profit possible' shows the exact-cent sum of this member's profit_extracted; the today/week/month 'profit available' numbers are unchanged."
    - "Undo on a Done row deletes that member's completion + snapshot; the promo returns to Active (recomputed from live odds) and 'Total profit extracted' drops by that row's amount."
    - "Completions made before this change (no snapshot) show in Done as 'Marked done before profit tracking' and count $0.00 — they are never recomputed."
    - "A member only ever sees, creates or undoes their own completions: the acting user id comes only from the session, and every read/delete filters by that user id."
    - "Full npx vitest run, npx tsc --noEmit and npm run lint pass. Migration 0009 is generated and committed but NOT applied."
  artifacts:
    - path: "drizzle/0009_done_snapshots.sql"
      provides: "ALTER TABLE promo_completions ADD snapshot jsonb (nullable) + profit_extracted numeric(10,2) NOT NULL DEFAULT '0'"
      contains: "profit_extracted"
    - path: "src/domain/promos/doneSnapshot.ts"
      provides: "DonePromoSnapshotSchema (zod, versioned), buildDoneSnapshot, toDonePromoDTO (incl. legacy), sumProfitExtracted, isSameDisplayedProfit"
      exports: ["DonePromoSnapshotSchema", "buildDoneSnapshot", "toDonePromoDTO", "sumProfitExtracted", "isSameDisplayedProfit"]
    - path: "src/domain/promos/promoRowDto.ts"
      provides: "toPromoRowDTO / toUnprofitablePromoRowDTO / promoTitle moved out of the 'use server' get-promos.ts so both getPromos and the mark-done action share one mapper"
    - path: "src/db/memberPromoState.ts"
      provides: "computeMemberPromoState -- one promo's current row for one member, same inputs as getPromos"
      exports: ["computeMemberPromoState"]
    - path: "src/components/promos/DonePromoRow.tsx"
      provides: "Done-tab row rendered from the snapshot, with Undo"
  key_links:
    - from: "src/app/actions/mark-promo-used.ts"
      to: "src/db/memberPromoState.ts"
      via: "computeMemberPromoState({ userId: user.userId, promoId, precision, now })"
      pattern: "computeMemberPromoState\\("
    - from: "src/app/actions/mark-promo-used.ts"
      to: "src/db/promoTracking.ts"
      via: "markPromoDone({ userId, promoId, now, snapshot, profitExtracted })"
      pattern: "markPromoDone\\("
    - from: "src/app/actions/get-promos.ts"
      to: "src/db/promoTracking.ts"
      via: "getPromoCompletions(user.userId) -> doneRows / totalExtracted / done-id filter"
      pattern: "getPromoCompletions\\("
    - from: "src/components/promos/PromosScreen.tsx"
      to: "src/components/promos/DonePromoRow.tsx"
      via: "Done TabsContent maps response.doneRows"
      pattern: "doneRows\\.map"
---

<objective>
Change "Mark used" into "Mark done" with a frozen, server-computed snapshot: marking a promo done saves exactly what the member's row showed (recomputed on the server, never trusted from the client), moves it to a new Done tab rendered only from that snapshot, and adds its profit to a per-member "Total profit extracted" number. Undo restores it. Old completions (pre-snapshot) show as "Marked done before profit tracking" at $0.

Purpose: owner request — once a member has placed a promo's bets, later odds movement must not change what that promo is recorded as having earned, and the member wants a running total of profit actually taken.

Output: migration 0009 (generated, committed, NOT applied), snapshot domain module + tests, shared row mapper, member-state recompute, reworked mark/undo actions, getPromos done split, Done tab UI.
</objective>

<design_decisions>
Plain-English summary of the choices this plan makes (the executor must implement these exactly):

1. **Odds changed between load and tap -> reject, don't silently save.** The client sends `promoId`, its `precision`, and the guaranteed profit its row displayed (`expectedGuaranteedProfit`, a 2-dp string, or `null` for a greyed-out row). The server recomputes. If they match to the cent (Decimal equality, and both null for greyed rows), it saves the server's snapshot. If not, it saves nothing and returns `status: "odds_changed"` with the current profit, and the UI shows "Odds changed since this loaded — it now shows $X. Review the updated row and mark it done again." then reloads the feed.
   Why reject rather than save-the-new-number: the snapshot's whole point is "what the member saw when they placed the bets". Cached odds only change when someone presses refresh, so a mismatch means another member refreshed in between and the member's placed bets were sized off the OLD numbers — saving the new numbers would record stakes and profit they never placed. Rejecting costs one extra tap in a rare case; silently recording a wrong number corrupts "Total profit extracted" forever. The saved values are still 100% server-computed (the client number is only a check, never stored).

2. **Greyed-out promos can still be marked done, at $0.** Today every greyed row already has the Mark button (members use it for promos they skipped or used without hedging). Keeping that is simpler than adding a disabled state, and it's safe: it can never inflate the total. Snapshot `kind: "no_hedge"` stores the promo identity plus the exact note the row showed (e.g. "No profitable hedge right now (best: −$0.65)"); `profit_extracted = 0.00`.

3. **Old completions are not recomputed.** Migration adds `snapshot jsonb NULL` and `profit_extracted numeric(10,2) NOT NULL DEFAULT '0'`, so existing rows get `snapshot = NULL`, `profit_extracted = 0.00`. The Done tab shows them as "Marked done before profit tracking" with $0.00 (book + promo title come from the promos table), counted as $0 in the total.

4. **Snapshot = the member's exact row.** The hedge snapshot stores the full row object getPromos would have returned for that member at that instant (game, teams, kickoff, market badge, promo side/odds/book, hedge side/odds/book, both stakes, payouts, nets, guaranteed profit, ROI/Conversion %, cap note), plus promo terms (book, type, title, boost %, boosted/base odds, bonus amount, max stake, winnings cap, min odds), stake precision, both odds `fetchedAt` timestamps (moneyline + spreads/totals caches, since the row doesn't carry which cache its market came from), and `recordedAt`. Versioned (`version: 1`) and zod-validated on read so a future shape change can't crash the Done tab.

5. **One shared code path.** The row mappers (`toPromoRowDTO`, `toUnprofitablePromoRowDTO`) move out of `get-promos.ts` (a "use server" file can only export async functions) into `src/domain/promos/promoRowDto.ts`. Both getPromos and the new `computeMemberPromoState` use them with the same inputs (member's own books via `getUserBookKeys` -> `getHedgeBookKeys(userBookSet)`, `getBonusBooks` names, both cached odds sets, the member's precision). `rankPromoHedges` evaluates each promo independently, so ranking one promo alone gives the identical row; a parity test proves it.

6. **UI.** "Mark used" -> "Mark done". Done promos leave the Active feed entirely (the old inline green "Marked used" state and the `used` DTO flag are removed). Done tab rows reuse the existing green `used-row-bg` treatment and the existing `PromoDetails` panel. Tabs use `Tabs`/`TabsList variant="line"` exactly like `AppShell.tsx` and `finder/ResultsList.tsx` — no new UI dependency (03-UI-SPEC: zero new shadcn blocks, ≥44px row tap target, ≥40px buttons, `.num` on money).

7. **Unchanged:** `promo_profit_observations`, `recordCurrentProfitObservations` (still called with ALL active promos — group-level), today/week/month numbers, the dismiss/flag flows. A promo that is no longer active cannot be newly marked done (returns "This promo is no longer active."); it can still be undone from Done.
</design_decisions>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/phases/03-promo-scraping-review/03-UI-SPEC.md
@.planning/quick/260927-n12-promos-total-profit-mark-used-state-dail/260927-n12-SUMMARY.md
@src/db/schema.ts
@src/db/promoTracking.ts
@src/app/actions/mark-promo-used.ts
@src/app/actions/mark-promo-used.test.ts
@src/app/actions/get-promos.ts
@src/domain/promos/dto.ts
@src/domain/promos/profitTotals.ts
@src/components/promos/PromosScreen.tsx
@src/components/promos/MarkUsedButton.tsx
@src/components/promos/PromoRow.tsx
@src/components/promos/UnprofitablePromoRow.tsx
@src/components/promos/ProfitSummary.tsx

<interfaces>
<!-- Extracted from the codebase. Use these directly. -->

From src/db/schema.ts (current, lines 302-314):
  promoCompletions = pgTable("promo_completions", {
    userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    promoId: integer("promo_id").notNull().references(() => promos.id, { onDelete: "cascade" }),
    completedAt: timestamp("completed_at", { withTimezone: true }).notNull(),
  }, (table) => [primaryKey({ columns: [table.userId, table.promoId] })]);
  promos table has: id, bookKey ("book_key"), promoType ("promo_type" text), parsed (jsonb, notNull; scraped drafts carry a string `title`).
  Promos are never deleted anywhere in src/ or scripts/ (grep-verified), so the cascade does not threaten recorded profit.
  Money precedent: numeric("max_guaranteed_profit", { precision: 10, scale: 2 }) -- comes back from neon-http as a string; keep it a string.

From src/db/promoTracking.ts (current exports):
  getUsedPromoIds(userId): Promise<Set<number>>                       // only caller: get-promos.ts
  markPromoUsed({ userId, promoId, now }): Promise<boolean>            // only caller: mark-promo-used.ts
  unmarkPromoUsed({ userId, promoId }): Promise<void>                  // deletes WHERE user_id AND promo_id
  recordProfitObservations(...), getProfitObservationsSince(...)       // untouched

From src/domain/promos/rankPromoHedges.ts:
  interface RankablePromo { id; bookKey; promoType: PromoType; scope; pinned; eligibleMarketTypes;
    boostPercent: string|null; boostedOddsAmerican: number|null; baseOddsAmerican: number|null;
    bonusAmount: string|null; maxStake: string|null; winningsCap: { kind: WinningsCapKind; amount: string }|null;
    minOddsAmerican: number|null }
  interface PromoOpportunity<P> { promo; selection; promoOddsAmerican; promoOddsDerived; hedge; sameBook;
    candidatesEvaluated; result: {kind:"boost";boost:ProfitBoostResult}|{kind:"bonus";bonus:BonusBetHedgeResult} }
  interface RankOptions { moneylineEvents; extendedEvents; hedgeBookKeys: ReadonlySet<string>; precision: StakePrecision; now: Date }
  rankPromoHedges(promos, opts): PromoOpportunity[]   // strictly-profitable only, one per promo, each promo evaluated independently
  findUnprofitablePromos(promos, opts): UnprofitablePromo[]  // every promo NOT in rankPromoHedges' output -> { promo, bestGuaranteedProfit: Decimal|null, candidatesEvaluated }

From src/db/promos.ts:
  interface ActivePromo extends RankablePromo { finePrintNote: string|null; claimHint: string|null; scopeLabel: string;
    autoMatched: boolean; attribution: { verb: "Confirmed by"|"Corrected by"|"Cap entered by"; displayName: string }[] }
  getActivePromos(now: Date): Promise<ActivePromo[]>

From src/db/queries.ts:
  getUserBookKeys(userId): Promise<string[]>; getHedgeBookKeys(allowedKeys?: ReadonlySet<string>): Promise<string[]>;
  getBonusBooks(): Promise<{ key; displayName; ... }[]>;
  getCachedEvents(): Promise<{ events: OddsEvent[]; fetchedAt: Date|null }>;
  getCachedExtendedEvents(): Promise<{ events: OddsEvent[]; fetchedAt: Date|null }>

From src/app/actions/get-promos.ts (to MOVE, bodies verbatim): capNoteFor, attributionLineFor, toPromoRowDTO(opportunity, bookNames, userBookSet, usedPromoIds),
  unprofitablePromoTitle(promo), unprofitablePromoNote(bestGuaranteedProfit), toUnprofitablePromoRowDTO(entry, bookNames, userBookSet, usedPromoIds).
  getPromos builds rankOpts = { moneylineEvents, extendedEvents, hedgeBookKeys: new Set(await getHedgeBookKeys(userBookSet)), precision, now }
  and bookNames = new Map(bonusBooks.map(b => [b.key, b.displayName])). It has FIVE `status: "ok"` return branches.

From src/domain/promos/reviewInput.ts:
  PromoIdInputSchema = z.object({ promoId: z.number().int().positive() }).strict()
From src/domain/promos/promosInput.ts:
  PromosInputSchema = z.object({ precision: z.enum(["whole", "cents"]) })
From src/lib/session.ts: requireUser(): Promise<{ userId: number; email; displayName }>  (redirects when logged out)
From src/lib/format.ts: formatUsd(value: string), formatAmerican(n), formatPct(value: string), formatKickoff(iso: string)
From src/components/ui/tabs.tsx: Tabs, TabsList (variant="line"), TabsTrigger, TabsContent  -- usage precedent: src/components/finder/ResultsList.tsx lines 45-97
From src/app/globals.css: `used-row-bg` utility (green gradient, light+dark) -- reuse for Done rows.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Migration 0009, snapshot domain module, shared row mapper, tracking reads/writes</name>
  <files>src/db/schema.ts, drizzle/0009_done_snapshots.sql, drizzle/meta/_journal.json, drizzle/meta/0009_snapshot.json, src/domain/promos/doneSnapshot.ts, src/domain/promos/doneSnapshot.test.ts, src/domain/promos/promoRowDto.ts, src/app/actions/get-promos.ts, src/db/promoTracking.ts</files>
  <behavior>
    Table-driven tests in src/domain/promos/doneSnapshot.test.ts:
    - buildDoneSnapshot, hedge kind, boost row (guaranteedProfit "12.34", ROI) -> snapshot.kind "hedge", version 1, row deep-equals the input row, promo terms copied (boostPercent, maxStake, winningsCap), precision + both fetchedAt ISO strings (null preserved) + recordedAt kept; profitExtracted === "12.34".
    - buildDoneSnapshot, hedge kind, bonus-bet row (Conversion) -> profitExtracted equals row.guaranteedProfit to the cent (e.g. "7.10" stays "7.10", not "7.1").
    - buildDoneSnapshot, no_hedge kind -> row null, note copied verbatim from the unprofitable row, profitExtracted "0.00".
    - DonePromoSnapshotSchema round-trip: JSON.parse(JSON.stringify(snapshot)) parses successfully and equals the original.
    - toDonePromoDTO: hedge snapshot -> kind "hedge", row present, profitExtracted from the DB column value, completedAt ISO; no_hedge snapshot -> kind "no_hedge", row null, note kept; snapshot null -> kind "legacy", note "Marked done before profit tracking", profitExtracted "0.00" even if the column says otherwise, title from parsed.title (string) else "Promo #{id}", bookName from the passed map else the raw key; snapshot present but failing the schema -> kind "legacy" with note "Saved details unavailable" and profitExtracted = the column value.
    - sumProfitExtracted: [] -> "0.00"; ["0.10","0.20"] -> "0.30" (float would give 0.30000000000000004); ["12.34","0.00","7.66"] -> "20.00"; legacy rows ("0.00") contribute nothing.
    - isSameDisplayedProfit(expected, current): ("12.34","12.34") true; ("12.34","12.35") false; ("12.30","12.3") true (Decimal equality); (null,null) true; (null,"1.00") false; ("1.00",null) false.
  </behavior>
  <action>
    (a) Schema + migration (design decision 3): in src/db/schema.ts add to `promoCompletions` `snapshot: jsonb("snapshot")` (nullable) and `profitExtracted: numeric("profit_extracted", { precision: 10, scale: 2 }).notNull().default("0")`, with a doc comment explaining legacy rows = snapshot NULL / $0. Import `jsonb`/`numeric` if not already imported (they are used elsewhere in the file). Run `npx drizzle-kit generate --name done_snapshots` (no DB connection needed for generate — confirmed by 260927-n12). It must produce drizzle/0009_done_snapshots.sql with two `ALTER TABLE "promo_completions" ADD COLUMN` statements plus the journal/snapshot meta. Do NOT run `npm run db:migrate` or any command that touches Neon.

    (b) Move the row mappers (design decision 5): create src/domain/promos/promoRowDto.ts and move `capNoteFor`, `attributionLineFor`, `toPromoRowDTO`, `unprofitablePromoTitle` (export it as `promoTitle`), `unprofitablePromoNote`, `toUnprofitablePromoRowDTO` out of get-promos.ts with bodies unchanged (signatures keep the `usedPromoIds` parameter for now; Task 3 removes it). To keep src/domain free of src/db imports (existing convention, see profitTotals.ts header), type the promo parameter with a local exported interface `PresentablePromo extends RankablePromo { finePrintNote: string|null; claimHint: string|null; scopeLabel: string; autoMatched: boolean; attribution: { verb: "Confirmed by" | "Corrected by" | "Cap entered by"; displayName: string }[] }` — ActivePromo satisfies it structurally. Make the mappers generic `<P extends PresentablePromo>` over `PromoOpportunity<P>` / `UnprofitablePromo<P>`. Update get-promos.ts to import them; remove the now-unused imports there (Decimal, formatAmerican, formatUsd, marketBadgeLabel, selectionLabel, getSportLabel, formatBoostPercent if no longer used — let lint/tsc tell you). This is a pure refactor: existing src/app/actions/get-promos.test.ts must pass unchanged.

    (c) Create src/domain/promos/doneSnapshot.ts (pure; no src/db imports; decimal.js for all money):
      - `DonePromoSnapshotSchema` (zod v4): `{ version: z.literal(1), kind: z.enum(["hedge","no_hedge"]), recordedAt: string, precision: z.enum(["whole","cents"]), oddsFetchedAt: { moneyline: string|null, spreadsTotals: string|null }, promo: { id, bookKey, bookName, promoType (z.enum from PROMO_TYPES in ./types), promoTypeLabel: z.enum(["Boost","Bonus bet"]), title, scopeLabel, boostPercent: string|null, boostedOddsAmerican: number|null, baseOddsAmerican: number|null, bonusAmount: string|null, maxStake: string|null, winningsCap: { kind: string, amount: string }|null, minOddsAmerican: number|null }, row: SnapshotRowSchema.nullable(), note: z.string().nullable() }`. `SnapshotRowSchema` is a z.object mirroring every PromoRowDTO field EXCEPT `used` (rowKey, promoId, promoType, promoTypeLabel, sportLabel, commenceTime, homeTeam, awayTeam, marketBadge, scopeLabel, candidatesEvaluated, autoMatched, finePrintNote, claimHint, tieRisk, sameBook, promo{bookKey,bookName,selectionLabel,oddsAmerican,oddsDerived}, hedge{bookKey,bookName,selectionLabel,oddsAmerican}, promoStake, hedgeStake, totalStaked, promoPayout, hedgePayout, netIfPromoWins, netIfHedgeWins, guaranteedProfit, rateLabel enum ["ROI","Conversion"], ratePct, capNote, attribution, worstCase, hasPromoBook). Add a compile-time assignability guard, e.g. `const _rowShapeGuard = (r: z.infer<typeof SnapshotRowSchema>): Omit<PromoRowDTO, "used"> => r;` (Task 3 simplifies it to `PromoRowDTO` once `used` is gone). Export `type DonePromoSnapshot = z.infer<typeof DonePromoSnapshotSchema>` and `type SnapshotRow`.
      - `buildDoneSnapshot(input, { now, precision, oddsFetchedAt: { moneyline: Date|null; spreadsTotals: Date|null } }) => { snapshot: DonePromoSnapshot; profitExtracted: string }` where input is `{ kind: "hedge"; terms: DonePromoTerms; row: PromoRowDTO } | { kind: "no_hedge"; terms: DonePromoTerms; row: UnprofitablePromoRowDTO }` and `DonePromoTerms` = the promo-terms fields above minus bookName/promoTypeLabel/title/scopeLabel (those come from the row). Strip `used` from the stored row (destructure it out). profitExtracted: hedge -> `new Decimal(row.guaranteedProfit).toFixed(2)`; no_hedge -> "0.00"; no_hedge note = row.note.
      - `DonePromoDTO` (export the interface from here; dto.ts re-exports it in Task 2): `{ rowKey: "done-{promoId}"; promoId; completedAt: string (ISO); kind: "hedge"|"no_hedge"|"legacy"; bookName; promoTypeLabel: "Boost"|"Bonus bet"; title; scopeLabel: string|null; profitExtracted: string; row: SnapshotRow|null; note: string|null; recordedPrecision: "whole"|"cents"|null }`.
      - `toDonePromoDTO(completion: { promoId; completedAt: Date; snapshot: unknown; profitExtracted: string; promoBookKey: string; promoType: string; promoParsed: unknown }, bookNames: ReadonlyMap<string,string>) => DonePromoDTO` implementing the legacy/unreadable rules from <behavior> (design decision 3). Never recompute anything.
      - `sumProfitExtracted(rows: { profitExtracted: string }[]) => string` (Decimal sum, toFixed(2)).
      - `isSameDisplayedProfit(expected: string|null, current: string|null) => boolean` (design decision 1).
      Write the test file first (RED), then implement (GREEN).

    (d) src/db/promoTracking.ts — ADD (keep the old three functions until Task 2 removes them so tsc stays green):
      - `getPromoCompletions(userId)`: select promoId, completedAt, snapshot, profitExtracted from promoCompletions innerJoin promos on promos.id = promoCompletions.promoId, selecting promos.bookKey as promoBookKey, promos.promoType, promos.parsed as promoParsed; WHERE promoCompletions.userId = userId; ORDER BY completedAt desc. Keep profitExtracted a string.
      - `markPromoDone({ userId, promoId, now, snapshot, profitExtracted })`: insert values with snapshot + profitExtracted, `.onConflictDoNothing({ target: [promoCompletions.userId, promoCompletions.promoId] })` (a double-tap keeps the FIRST snapshot; idempotent). Existence is already proven by the caller's recompute, so no separate exists-check.
  </action>
  <verify>
    <automated>cd "/Users/bentorio/Desktop/Personal Projects/promoprofit" && npx vitest run src/domain/promos/doneSnapshot.test.ts src/app/actions/get-promos.test.ts && npx tsc --noEmit && grep -c "ADD COLUMN" drizzle/0009_done_snapshots.sql && grep -q '"0009_done_snapshots"' drizzle/meta/_journal.json</automated>
  </verify>
  <done>Migration 0009 generated (two ADD COLUMN statements, journal entry idx 9), not applied; doneSnapshot tests green; get-promos tests green unchanged after the mapper move; tsc clean.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Server-side recompute, mark-done/undo actions, getPromos done split + total extracted</name>
  <files>src/db/memberPromoState.ts, src/domain/promos/reviewInput.ts, src/domain/promos/dto.ts, src/app/actions/mark-promo-used.ts, src/app/actions/mark-promo-used.test.ts, src/app/actions/get-promos.ts, src/app/actions/get-promos.test.ts, src/db/promoTracking.ts</files>
  <behavior>
    mark-promo-used.test.ts (mock @/lib/session, @/db/memberPromoState, @/db/promoTracking, next/cache):
    - logged out -> rejects, computeMemberPromoState and markPromoDone never called.
    - invalid inputs table: {} ; {promoId:"1",...}; missing precision; precision "half"; expectedGuaranteedProfit 12.34 (number); "12.3" (not 2dp); extra userId field -> all { status: "invalid" }, no DB calls.
    - computeMemberPromoState called with { userId: 7 (session), promoId, precision, now: any Date } — never an input-supplied user.
    - state not_active -> { status: "not_found", message: "This promo is no longer active." }, no insert, no revalidate.
    - hedge state, expected matches -> markPromoDone called with userId 7, the built snapshot (kind "hedge") and profitExtracted "12.34"; returns { status: "ok", profitExtracted: "12.34" }; revalidatePath("/").
    - hedge state, expected "12.00" vs current "12.34" -> { status: "odds_changed", currentGuaranteedProfit: "12.34", message contains "$12.34" }, no insert.
    - hedge state, expected null (member saw greyed row) -> odds_changed; no_hedge state, expected "5.00" -> odds_changed with currentGuaranteedProfit null.
    - no_hedge state, expected null -> markPromoDone with profitExtracted "0.00", snapshot.kind "no_hedge"; ok.
    - unmark: logged out rejects; extra userId -> invalid; valid -> unmarkPromoUsed({ userId: 7, promoId }) and revalidate.
    get-promos.test.ts:
    - replace getUsedPromoIds mock with getPromoCompletions (default []).
    - a done promo (completion with hedge snapshot) is absent from rows and unprofitableRows, excluded from totalProfit, present in doneRows rendered from its snapshot even though live odds now give a different profit (snapshot numbers win), and totalExtracted equals the sum of profitExtracted.
    - legacy completion (snapshot null) appears in doneRows as kind "legacy" with "0.00" and adds $0 to totalExtracted.
    - doneRows and totalExtracted are present in every "ok" branch (at least the none-scraped/no-active, no-odds and normal branches).
    - recordCurrentProfitObservations still receives ALL active promos (including done ones).
    - parity: for a fixture with two promos, `computeMemberPromoState({ userId, promoId, precision, now })` (imported from @/db/memberPromoState — NOT mocked in this file; it reuses the same mocked @/db/promos and @/db/queries) returns kind "hedge" with a row deep-equal to the getPromos row for that promoId, and kind "no_hedge" with a row equal to the unprofitableRows entry for a greyed promo.
  </behavior>
  <action>
    (a) src/db/memberPromoState.ts (db-layer orchestration seam, same pattern as src/db/promoObservations.ts). `computeMemberPromoState({ userId, promoId, precision, now })` returns `{ kind: "not_active" } | { kind: "hedge"; terms: DonePromoTerms; row: PromoRowDTO; oddsFetchedAt: { moneyline: Date|null; spreadsTotals: Date|null } } | { kind: "no_hedge"; terms; row: UnprofitablePromoRowDTO; oddsFetchedAt }`. Steps: `getActivePromos(now)` -> find by id (absent -> not_active); `getUserBookKeys(userId)` -> userBookSet; `Promise.all([getHedgeBookKeys(userBookSet), getBonusBooks(), getCachedEvents(), getCachedExtendedEvents()])` exactly as getPromos; bookNames Map from bonusBooks; rankOpts identical to getPromos'; `rankPromoHedges([promo], rankOpts)[0]` -> hedge via `toPromoRowDTO(opp, bookNames, userBookSet, new Set())`; else `findUnprofitablePromos([promo], rankOpts)[0]` -> no_hedge via `toUnprofitablePromoRowDTO(...)`. terms = the RankablePromo money/odds fields listed in doneSnapshot's DonePromoTerms. Doc-comment why ranking one promo alone equals the feed (rankPromoHedges evaluates each promo independently) and that userId must come from the session.

    (b) src/domain/promos/reviewInput.ts: add `MarkPromoDoneInputSchema = z.strictObject({ promoId: z.number().int().positive(), precision: z.enum(["whole","cents"]), expectedGuaranteedProfit: z.string().regex(/^-?\d+\.\d{2}$/).nullable() })` with a doc comment: no userId (IDOR guard); expectedGuaranteedProfit is only an optimistic-concurrency check and is NEVER stored (design decision 1).

    (c) src/app/actions/mark-promo-used.ts: keep file + export names (`markPromoUsedAction`, `unmarkPromoUsedAction`) to limit churn. `markPromoUsedAction(input: unknown): Promise<MarkDoneResponse>` where `MarkDoneResponse = { status: "ok"; profitExtracted: string } | { status: "invalid" } | { status: "not_found"; message: "This promo is no longer active." } | { status: "odds_changed"; message: string; currentGuaranteedProfit: string|null }`. Order: `requireUser()` literal first statement; safeParse; `computeMemberPromoState({ userId: user.userId, ... , now: new Date() })`; not_active -> not_found; `isSameDisplayedProfit(expected, current)` where current = hedge ? row.guaranteedProfit : null — mismatch -> odds_changed with message `Odds changed since this loaded — it now shows ${formatUsd(current)}. Review the updated row and mark it done again.` (current null -> "it now has no profitable hedge"); else `buildDoneSnapshot` -> `markPromoDone` -> `revalidatePath("/")` -> ok with profitExtracted. `unmarkPromoUsedAction` keeps PromoIdInputSchema + session userId + `unmarkPromoUsed` (deletes WHERE user_id = session user AND promo_id — snapshot goes with the row), returns `UndoDoneResponse = { status: "ok" } | { status: "invalid" }`. Rewrite mark-promo-used.test.ts per <behavior> (RED first).

    (d) src/db/promoTracking.ts: delete `getUsedPromoIds` and `markPromoUsed` (no remaining callers after this task — grep to confirm). Keep `unmarkPromoUsed`.

    (e) src/domain/promos/dto.ts: `export type { DonePromoDTO } from "./doneSnapshot"`; add to the "ok" GetPromosResponse: `doneRows: DonePromoDTO[]` (this member's completions, newest first, rendered only from snapshots) and `totalExtracted: string` (exact-cent sum of profit_extracted; "0.00" when none), with doc comments. Update the totalProfit doc comment: "excluding promos they've marked done".

    (f) src/app/actions/get-promos.ts: replace `getUsedPromoIds(user.userId)` in the Promise.all with `getPromoCompletions(user.userId)`; `doneRows = completions.map(c => toDonePromoDTO(c, colBookNames))` where colBookNames is a Map from COLORADO_BOOKS (key -> displayName; available before bonusBooks is fetched, needed in empty branches); `doneIds = new Set(completions.map(c => c.promoId))`; `totalExtracted = sumProfitExtracted(doneRows)`. `feedPromos = activePromos.filter(p => !doneIds.has(p.id))`: use feedPromos for the `length === 0` empty check, `rankPromoHedges`, `findUnprofitablePromos`, and the no-books re-rank; keep `recordCurrentProfitObservations(now, { activePromos, ... })` on the FULL list (group-level observations unchanged). Pass `doneIds` where `usedPromoIds` was (always false now for feed rows; Task 3 removes the field). Add `doneRows, totalExtracted` to ALL FIVE "ok" returns. Update get-promos.test.ts per <behavior> (existing `used` assertions in the "used-state and totalProfit" describe block become done-split assertions).
  </action>
  <verify>
    <automated>cd "/Users/bentorio/Desktop/Personal Projects/promoprofit" && npx vitest run src/app/actions/mark-promo-used.test.ts src/app/actions/get-promos.test.ts src/domain/promos && npx tsc --noEmit && test "$(grep -rn 'getUsedPromoIds\|markPromoUsed(' src | wc -l | tr -d ' ')" = "0"</automated>
  </verify>
  <done>Mark-done action recomputes from the server for the session user only, rejects on displayed-profit mismatch, saves snapshot + profit_extracted; undo deletes only the session user's row; getPromos returns doneRows + totalExtracted in every ok branch and excludes done promos from the feed and totalProfit; parity test proves recompute == feed row; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 3: Promos UI — Active/Done tabs, Done rows from snapshot, Mark done button, Total profit extracted</name>
  <files>src/components/promos/MarkUsedButton.tsx, src/components/promos/DonePromoRow.tsx, src/components/promos/PromoRow.tsx, src/components/promos/UnprofitablePromoRow.tsx, src/components/promos/ProfitSummary.tsx, src/components/promos/PromosScreen.tsx, src/domain/promos/dto.ts, src/domain/promos/promoRowDto.ts, src/domain/promos/doneSnapshot.ts, src/app/actions/get-promos.ts, src/app/actions/get-promos.test.ts, src/db/memberPromoState.ts</files>
  <action>
    (a) Remove the obsolete `used` flag (design decision 6): delete `used` from PromoRowDTO and UnprofitablePromoRowDTO in dto.ts, the `usedPromoIds` parameter + `used:` lines from promoRowDto.ts mappers, their call sites in get-promos.ts and memberPromoState.ts, any remaining `.used` assertions in get-promos.test.ts; simplify doneSnapshot.ts's row guard to `(r: SnapshotRow): PromoRowDTO => r` and drop the `used` destructure in buildDoneSnapshot.

    (b) src/components/promos/MarkUsedButton.tsx: keep the file/component name, change props to a discriminated union `{ mode: "mark"; promoId: number; precision: "whole"|"cents"; expectedGuaranteedProfit: string|null; onChanged: () => void } | { mode: "undo"; promoId: number; onChanged: () => void }`. Labels: "Mark done" (CheckCheck icon, aria-label "Mark this promo as done") / "Undo" (Undo2, aria-label "Undo marking this promo done — it returns to Active"). mark -> `markPromoUsedAction({ promoId, precision, expectedGuaranteedProfit })`; undo -> `unmarkPromoUsedAction({ promoId })`. ok -> clear error, onChanged(). odds_changed -> show `outcome.message` AND call onChanged() so the row reloads with fresh numbers. not_found -> show message. invalid -> "Couldn't mark this promo done." / "Couldn't undo this promo.". Keep stopPropagation, useTransition pending-disable, ghost sm Button, absolute error <p role="alert">. Keep the button ≥40px tall on mobile (add `min-h-10` if size="sm" is shorter — check button.tsx).

    (c) PromoRow.tsx: add `precision` prop; drop all `row.used` branches (background back to `row.hasPromoBook ? "bg-secondary" : "bg-secondary/40 opacity-60"`, aria-label without "Marked used", no "Marked used" badge); render `<MarkUsedButton mode="mark" promoId={row.promoId} precision={precision} expectedGuaranteedProfit={row.guaranteedProfit} onChanged={onChanged} />`. UnprofitablePromoRow.tsx: same removal; `expectedGuaranteedProfit={null}` (design decision 2); add `precision` prop.

    (d) New src/components/promos/DonePromoRow.tsx ("use client"), props `{ row: DonePromoDTO; onChanged: () => void }`, rendered ONLY from the DTO (never live data):
      - kind "hedge": same Collapsible + absolute overlay-trigger structure and six-column grid as PromoRow (copy its classes; `used-row-bg` background). Col 1: "{sportLabel} · {formatKickoff(commenceTime)}", "{away} @ {home}", market badge, "Marked done {formatKickoff(row.completedAt)}" caption, Undo button (`MarkUsedButton mode="undo"`, pointer-events-auto). Col 2 promo type badge + selection + `.num` odds + book. Col 3 hedge selection + odds + hedge book. Col 4 `.num` profit extracted (text-primary, same size as PromoRow). Col 5 rate + label. Chevron. Expanded: `<PromoDetails row={row.row} />` (the snapshot row).
      - kind "no_hedge" and "legacy": plain div (like UnprofitablePromoRow, `used-row-bg`, not expandable): promo type badge, title, book name, scopeLabel (if present), the note ("No profitable hedge right now (best: −$0.65)" / "Marked done before profit tracking" / "Saved details unavailable"), "Marked done {date}", `.num` "$0.00" (or profitExtracted), Undo button.
      - aria-label on the trigger/div: "{title or teams} — marked done, {formatUsd(profitExtracted)} extracted".
    (e) ProfitSummary.tsx: add `totalExtracted: string` prop. Top block becomes a flex-wrap pair (stacks on mobile): existing "Total profit possible" (subtext "At your books, not counting promos you've marked done") and new "Total profit extracted" (`num text-3xl font-semibold`, same size/weight as the headline — 03-UI-SPEC allows only the existing 4 sizes/2 weights; subtext "Recorded when you marked promos done"). Leave the today/week/month row untouched.
    (f) PromosScreen.tsx: pass `totalExtracted={response.totalExtracted}` to ProfitSummary; pass `precision` to PromoRow/UnprofitablePromoRow. Below ReviewQueueSection, wrap the existing list area in `<Tabs value={view} onValueChange={(v: string) => setView(v === "done" ? "done" : "active")}>` with `<TabsList variant="line" aria-label="Show active or done promos">` + triggers "Active" and "Done ({doneRows.length})" (count only when response is ok). Active TabsContent = the existing skeleton / error / empty-state / rows block unchanged. Done TabsContent = `response.doneRows.map(row => <DonePromoRow key={row.rowKey} row={row} onChanged={runGetPromos} />)` in a `flex flex-col gap-2`, or when empty a muted line "Nothing marked done yet. Promos you mark done show here with the profit recorded at that moment." `view` is local useState, default "active".
  </action>
  <verify>
    <automated>cd "/Users/bentorio/Desktop/Personal Projects/promoprofit" && npx vitest run && npx tsc --noEmit && npm run lint && test "$(grep -rn '\.used\b\|usedPromoIds\|Mark used' src/components/promos src/domain/promos/dto.ts src/domain/promos/promoRowDto.ts src/app/actions/get-promos.ts | wc -l | tr -d ' ')" = "0"</automated>
  </verify>
  <done>Promos tab shows Active / Done (n) line tabs; Active rows show "Mark done"; Done rows render from snapshots with date, profit and Undo (legacy rows labeled, $0); ProfitSummary shows "Total profit extracted" beside "Total profit possible"; `used` flag fully removed; full vitest, tsc and lint pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> markPromoUsedAction / unmarkPromoUsedAction | untrusted promoId, precision, expectedGuaranteedProfit |
| DB jsonb snapshot -> Done tab | stored data read back later; shape may drift across versions |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-igk-01 | Spoofing / Elevation | mark/undo actions | mitigate | `requireUser()` is the first statement; user id only from session; `.strictObject` schemas reject any `userId` field (tests assert) |
| T-igk-02 | Tampering | profit_extracted / snapshot | mitigate | Client numbers are never stored: server recomputes via computeMemberPromoState and stores buildDoneSnapshot output; expectedGuaranteedProfit is only compared (regex-validated 2dp string) |
| T-igk-03 | Information disclosure | getPromoCompletions / Done tab | mitigate | Query filters `promo_completions.user_id = session user`; doneRows only built from that list |
| T-igk-04 | Tampering (IDOR) | unmarkPromoUsed | mitigate | DELETE WHERE user_id = session user AND promo_id — a member can't delete another member's completion (test asserts session userId passed) |
| T-igk-05 | Denial of service | Done tab rendering | mitigate | Snapshot zod-validated on read (versioned); invalid -> "Saved details unavailable" row, never a crash |
| T-igk-06 | Repudiation | double submit | accept | onConflictDoNothing keeps the first snapshot; private 3-5 person app |
</threat_model>

<verification>
- `npx vitest run` (full suite), `npx tsc --noEmit`, `npm run lint` all pass.
- drizzle/0009_done_snapshots.sql exists with ADD COLUMN "snapshot" jsonb and ADD COLUMN "profit_extracted" numeric(10, 2) DEFAULT '0' NOT NULL; journal has idx 9. Migration NOT applied (orchestrator applies after review).
- No `used` flag, `getUsedPromoIds`, or `markPromoUsed(` remain.
</verification>

<success_criteria>
- Marking done stores a server-recomputed snapshot and cents-exact profit for the session member only, or rejects with "Odds changed..." when the displayed profit no longer matches.
- Done tab shows frozen snapshots (legacy rows as "Marked done before profit tracking", $0); Active feed and "Total profit possible" exclude done promos.
- "Total profit extracted" = Decimal sum of the member's profit_extracted; Undo removes the row and the amount.
</success_criteria>

<output>
Create `.planning/quick/260929-igk-mark-done-snapshots-promo-done-tab-total/260929-igk-SUMMARY.md` when done. Note in it that migration 0009 must be applied with `npm run db:migrate` by the orchestrator.
</output>
