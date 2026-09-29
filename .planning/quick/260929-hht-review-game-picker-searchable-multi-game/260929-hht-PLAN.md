---
phase: quick-260929-hht
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/domain/promos/gameSearch.ts
  - src/domain/promos/gameSearch.test.ts
  - src/domain/promos/scopeDraft.ts
  - src/domain/promos/scopeDraft.test.ts
  - src/domain/promos/correctionOptions.ts
  - src/domain/promos/correctionOptions.test.ts
  - src/components/promos/CorrectionScopeSelect.tsx
  - src/components/promos/ScopePicker.tsx
  - src/components/promos/QueueItemCard.tsx
  - src/components/promos/ClassifyQueueCard.tsx
autonomous: true
requirements: [QUICK-260929-hht]

must_haves:
  truths:
    - "In the review queue (Correct on a match card, and the boost / bonus panels on a 'Needs a look' card), a member first picks a mode with a two-button toggle: 'One game' or 'All games in a league'. There is no longer one long dropdown that mixes games and days."
    - "In 'One game' mode, typing in a search box (e.g. 'bron', 'DEN', 'rams @ broncos', 'montreal', 'nhl') narrows the upcoming cached games to matches on team name, abbreviation or alias, case- and accent-insensitive; results are grouped by league, then by ET day, in a list that scrolls inside a fixed max height; each row is at least 44px tall and tapping it selects the game."
    - "In 'All games in a league' mode, the member picks a League, a From day (only days that league has cached games) and a Through day (default = same day); picking a league auto-selects its first day so the choice is never half-filled."
    - "When the queued promo has a scraped window, the picker opens in league mode prefilled with that window's league, first day and last day (same behavior as 260929-gcn's prefill)."
    - "The market/side pin ('Best available (app picks)' default) still works for a single game on the Correct panel and is hidden in league mode."
    - "Payloads sent to correctPromoMatch / classifyPromo are unchanged: a game is { kind: 'event', eventId } (plus pinned on Correct); a single-day league choice is exactly { kind: 'sport_day', sportKey, etDate } with NO etEndDate key; a multi-day choice adds etEndDate. No server action, schema, migration, DB, lifecycle or ranking file changes."
    - "Full npx vitest run, npx tsc --noEmit and npm run lint pass."
  artifacts:
    - path: "src/domain/promos/gameSearch.ts"
      provides: "normalizeSearchText, eventSearchText (team names + TEAM_ALIASES + league label), searchEventOptions (every query token must prefix-match a word), groupEventOptions (league -> ET day groups)"
      contains: "export function searchEventOptions"
    - path: "src/domain/promos/scopeDraft.ts"
      provides: "ScopeDraft type, EMPTY_SCOPE_DRAFT, scopeInputFromDraft, leagueOptions, fromDayOptions, selectLeague, selectFromDay, prefillScopeDraft, ScopeSelectionInput type"
      contains: "export function scopeInputFromDraft"
    - path: "src/domain/promos/correctionOptions.ts"
      provides: "CorrectionEventOption gains homeTeam, awayTeam, etDate, searchText"
      contains: "searchText"
    - path: "src/components/promos/ScopePicker.tsx"
      provides: "ScopePicker (mode toggle + game search list + league/from/through selects) and ThroughDaySelect"
      contains: "export function ScopePicker"
  key_links:
    - from: "src/components/promos/ScopePicker.tsx"
      to: "src/domain/promos/gameSearch.ts"
      via: "searchEventOptions + groupEventOptions over options.events"
      pattern: "searchEventOptions\\("
    - from: "src/components/promos/QueueItemCard.tsx"
      to: "src/app/actions/correct-promo-match.ts"
      via: "scopeInputFromDraft(draft) -> correctPromoMatch payload"
      pattern: "scopeInputFromDraft\\("
    - from: "src/components/promos/ClassifyQueueCard.tsx"
      to: "src/app/actions/classify-promo.ts"
      via: "scopeInputFromDraft(draft) -> classifyPromo payload.scope"
      pattern: "scopeInputFromDraft\\("
    - from: "src/domain/promos/correctionOptions.ts"
      to: "src/domain/promos/gameSearch.ts"
      via: "listCorrectionOptions fills searchText via eventSearchText"
      pattern: "eventSearchText\\("
---

<objective>
Owner feedback (verbatim, after the scope change): "no, no ticker for certain games. it just needs to be easier to search for a game or define a date range. one dropdown doesnt work". Earlier: "Promos are usually single games, multiple games on one day, or all games for one league."

Replace the single combined "Game or day" dropdown (CorrectionScopeSelect: every cached game plus every "Any {sport} game · day" entry in one long Select) with a picker that has two clearly separate modes:
1. One game: a search box over the cached upcoming games, grouped by league then ET day, in a bounded scrolling list with 44px rows.
2. All games in a league: League + From day + Through day selects (the existing sport_day + optional etEndDate from 260929-gcn), prefilled from the scraped window.

This is UI-only plus pure helpers. The server contract (event, or sport_day with optional etEndDate) is unchanged. Explicitly OUT of scope per the owner: multi-game checkboxes, any new scope kind, migration 0009, and any schema/store/lifecycle/ranking/describe change.

Output: two pure tested helper modules, three new fields on CorrectionEventOption, a new ScopePicker component (replacing CorrectionScopeSelect.tsx), and both review cards rewired to it.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/phases/03-promo-scraping-review/03-UI-SPEC.md
@.planning/quick/260929-gcn-multi-day-promo-windows-fanduel-date-par/260929-gcn-SUMMARY.md
@src/components/promos/CorrectionScopeSelect.tsx
@src/components/promos/QueueItemCard.tsx
@src/components/promos/ClassifyQueueCard.tsx
@src/domain/promos/correctionOptions.ts
@src/domain/promos/correctionOptions.test.ts

<interfaces>
<!-- Verified by reading the code at planning time. Use these directly. -->

From src/domain/promos/correctionOptions.ts (current, before this plan):
- export interface CorrectionEventOption { eventId: string; sportKey: string; sportLabel: string; label: string /* "{away} @ {home} · {kickoff}" */; commenceTime: string; markets: CorrectionMarketOption[] }
- export interface CorrectionSportDayOption { value: string /* `${sportKey}|${etDate}` */; sportKey: string; sportLabel: string; etDate: string /* "YYYY-MM-DD" ET */; label: string /* "Any NFL game · Sun, Sep 27 (ET)" */ }
- export interface CorrectionOptions { events: CorrectionEventOption[]; sportDays: CorrectionSportDayOption[] }
- export const DEFAULT_WINDOW_DAYS = 7
- export function throughDayOptions(startEtDate: string, now: Date, windowDays = DEFAULT_WINDOW_DAYS): { etDate: string; label: string }[]  // first item = start day itself
- export function prefillSportDay(window: { sportKey; startEtDate; endEtDate }, sportDays: CorrectionSportDayOption[], now: Date): { value: string /* `${sportKey}|${etDate}` */; throughEtDate: string } | null
- export function listCorrectionOptions(events: { moneyline: OddsEvent[]; extended: OddsEvent[] }, opts: { now: Date; windowDays?: number }): CorrectionOptions
- private: etDateKey(iso) -> ET "YYYY-MM-DD"; events are already sorted by SPORTS order then commence time (bySportThenCommence); sportDays sorted by SPORTS order then etDate.
- OddsEvent fields used: id, sport_key, commence_time, home_team, away_team.

From src/domain/promos/aliases.ts:
- export const TEAM_ALIASES: Readonly<Record<sportKey, Readonly<Record<canonicalTeamName, readonly string[]>>>>  // e.g. americanfootball_nfl["Denver Broncos"] = ["Broncos","Denver","DEN"]; icehockey_nhl has "Montréal Canadiens" (accented)
- export function normalizeTeamText(text: string): string  // trim, lowercase, strip ".", collapse spaces, drop leading "the " (does NOT strip accents)

From src/domain/promos/etTime.ts:
- export function etDayBounds(etDate: string): { start: string; end: string } | null
- export function etDayLabel(iso: string): string  // "Sun, Sep 27" in America/New_York

From src/config/sports.ts:
- export const SPORTS: readonly { key; label; tieRisk }[]  // order: NFL, NBA, MLB, NCAAF, NCAAB, NHL
- export function getSportLabel(sportKey: string): string

From src/lib/format: formatKickoff(iso: string): string

From src/components/promos/CorrectionScopeSelect.tsx (current; will be replaced):
- export type ScopeSelectionInput = { kind: "event"; eventId: string } | { kind: "sport_day"; sportKey: string; etDate: string; etEndDate?: string }
- scopeInputFromValue(value, throughEtDate): etEndDate is included ONLY when throughEtDate is a non-empty string different from etDate. Keep this exact rule.
- ThroughDaySelect({ id, startEtDate, value, onValueChange, disabled }) — Select over throughDayOptions(startEtDate, new Date()), first item labelled "{label} (same day)".
- Consumers: ONLY QueueItemCard.tsx and ClassifyQueueCard.tsx (grep-verified).

Server contract (unchanged, do not edit): src/domain/promos/reviewInput.ts
- Correct: scope = { kind: "event", eventId, pinned: {marketType,line,side} | null } | { kind: "sport_day", sportKey, etDate, etEndDate? } (strictObject — no extra keys allowed)
- Classify: scope = { kind: "event", eventId } | { kind: "sport_day", sportKey, etDate, etEndDate? } | null (null = no scope chosen -> promo goes to match review)

UI primitives (base-ui shadcn): ToggleGroup value is an ARRAY, onValueChange receives an array (see src/components/arb/ArbForm.tsx lines 211-220: value={[precision]} onValueChange={(values) => { const next = values[0]; ... }}). Clicking the already-selected item yields [] -> ignore it. Select onValueChange may pass null (existing pattern: `(v) => onValueChange(v ?? fallback)`). Input default is h-8 — pass className "h-11".

Test environment: vitest node env, include "src/**/*.test.ts" only — there are no component tests; all logic worth testing must live in pure .ts modules.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Pure helpers: game search, grouping, scope draft (TDD)</name>
  <files>src/domain/promos/gameSearch.ts, src/domain/promos/gameSearch.test.ts, src/domain/promos/scopeDraft.ts, src/domain/promos/scopeDraft.test.ts, src/domain/promos/correctionOptions.ts, src/domain/promos/correctionOptions.test.ts</files>
  <behavior>
    gameSearch.test.ts (table-driven, it.each), fixture = CorrectionEventOption-like objects built through listCorrectionOptions OR hand-built with the new fields; include: NFL "LA Rams @ DEN Broncos"-style and canonical "Los Angeles Rams @ Denver Broncos", NBA "Boston Celtics @ Denver Nuggets", NFL "Green Bay Packers @ Chicago Bears", NHL "Montréal Canadiens @ Toronto Maple Leafs", and one team NOT in TEAM_ALIASES (e.g. NCAAF "Colorado State Rams @ Wyoming Cowboys"):
    - "" and "   " -> every event, original order
    - "broncos", "BRON", "Bron" -> the Broncos game only
    - "den" -> Broncos game AND Nuggets game (alias DEN / Denver), in original order
    - "rams @ broncos", "rams vs broncos", "rams at broncos" -> Broncos game (stop tokens "@", "vs", "v", "at" ignored); also matches only games containing both tokens
    - "LAR" -> Rams game via alias
    - "green bay" -> Packers game (multi-word alias, each token prefix-matches)
    - "montreal", "MONTRÉAL", "habs"-style only if alias exists (use "canadiens") -> NHL game (accent-insensitive)
    - "nhl" -> every NHL event (league label is searchable)
    - "wyoming" -> the non-aliased game via its own team-name words
    - "ams" -> [] (prefix-of-word semantics, not substring) ; "xyz" -> []
    - groupEventOptions: preserves input order of leagues and of days; each league group = { sportKey, sportLabel, days: [{ etDate, dayLabel, events }] }; two NFL games on different ET days -> one NFL group with two day groups; an event at 11:30pm ET vs 12:30am ET next day falls on the correct ET days; empty input -> []
    - correctionOptions.test.ts: listCorrectionOptions event option now also has homeTeam, awayTeam, etDate (ET day of commence) and a searchText containing the normalized team names, their aliases and the league label (e.g. for canonical "Denver Broncos": contains "broncos", "den", "denver", "nfl")
    scopeDraft.test.ts (table-driven):
    - scopeInputFromDraft(EMPTY_SCOPE_DRAFT) -> null; game mode with eventId null -> null; league mode with sportKey or fromEtDate null -> null
    - game mode { eventId: "e1" } -> toStrictEqual { kind: "event", eventId: "e1" }
    - league single day (through null, "" or equal to from) -> toStrictEqual { kind: "sport_day", sportKey, etDate } and Object.keys has no "etEndDate" (byte-identical to today's single-day payload)
    - league multi-day (through != from) -> { kind: "sport_day", sportKey, etDate, etEndDate: through }
    - a draft that has BOTH an eventId and league fields uses only the active mode's fields
    - leagueOptions(sportDays) -> distinct { sportKey, sportLabel } in first-appearance (SPORTS) order
    - fromDayOptions(sportDays, sportKey) -> that league's days only, each { etDate, label } where label = etDayLabel of the ET day start (e.g. "Sun, Sep 27"); other leagues excluded
    - selectLeague(draft, sportKey, sportDays) -> mode "league", sportKey set, fromEtDate = that league's first day, throughEtDate = same day; unknown league with no days -> fromEtDate/throughEtDate null
    - selectFromDay(draft, etDate, now) -> keeps throughEtDate when it is >= new from AND still offered by throughDayOptions(etDate, now); otherwise resets throughEtDate to etDate
    - prefillScopeDraft(scrapedWindow, sportDays, now): multi-day window -> league-mode draft with sportKey, fromEtDate and throughEtDate matching prefillSportDay's result; null window or no same-league day -> null
  </behavior>
  <action>
    Write the tests first (RED), then implement (GREEN).

    correctionOptions.ts: extend CorrectionEventOption with homeTeam: string, awayTeam: string, etDate: string (via the existing private etDateKey(ev.commence_time)), and searchText: string (via eventSearchText from gameSearch.ts). Fill them in listCorrectionOptions's eventOptions map. Do not change sorting, the pool rule, labels, markets, sportDays, throughDayOptions, scrapedWindowEtDays or prefillSportDay. Existing tests must keep passing untouched; only ADD assertions for the new fields.

    gameSearch.ts (new, pure, zero-I/O, header doc-comment citing quick-260929-hht and the owner quote):
    - normalizeSearchText(text): NFD-normalize and strip combining marks (so "Montréal" -> "montreal"), then apply normalizeTeamText from aliases.ts, then replace every non [a-z0-9] run with a single space and trim. Reuse normalizeTeamText; do not duplicate the alias table.
    - eventSearchText(sportKey, homeTeam, awayTeam): normalized, space-joined, de-duplicated words from homeTeam, awayTeam, TEAM_ALIASES[sportKey]?.[homeTeam] ?? [], TEAM_ALIASES[sportKey]?.[awayTeam] ?? [], and getSportLabel(sportKey). Exact-key lookup only (a team name the table doesn't know just contributes its own words; no fuzzy matching, consistent with aliases.ts's "never close enough" rule).
    - searchEventOptions<T extends { searchText: string }>(events: readonly T[], query: string): T[]. Tokens = normalizeSearchText(query) split on spaces, minus stop tokens "vs", "v", "at" ("@" already removed by normalization). No tokens -> return a copy of all events in order. Otherwise keep an event when EVERY token is a prefix of at least one word of its searchText. Preserve input order. Never mutate input.
    - groupEventOptions(events: readonly CorrectionEventOption[]): { sportKey; sportLabel; days: { etDate; dayLabel; events: CorrectionEventOption[] }[] }[] — insertion-order grouping (input is already SPORTS-then-commence sorted, same approach as the old groupCorrectionOptions in CorrectionScopeSelect.tsx); dayLabel = etDayLabel(first event's commenceTime).
    Import CorrectionEventOption as a type-only import to avoid a runtime cycle with correctionOptions.ts.

    scopeDraft.ts (new, pure): move the ScopeSelectionInput type here (re-exported shape identical to the one in CorrectionScopeSelect.tsx). Define ScopeDraft as a FLAT object { mode: "game" | "league"; eventId: string | null; sportKey: string | null; fromEtDate: string | null; throughEtDate: string | null } so toggling modes keeps each mode's choice; EMPTY_SCOPE_DRAFT = game mode, all null. Implement scopeInputFromDraft (etEndDate only when throughEtDate is a non-empty string different from fromEtDate — the exact 260929-gcn rule, so single-day payloads stay byte-identical), leagueOptions, fromDayOptions (label from etDayLabel(etDayBounds(etDate).start); skip any day whose bounds are null), selectLeague, selectFromDay (uses throughDayOptions from correctionOptions.ts for the "still offered" check), and prefillScopeDraft (wraps prefillSportDay; split its value on "|" into sportKey/etDate). All functions return new objects, never mutate.

    Money math is not involved. No server/action/schema files are touched in this task.
  </action>
  <verify>
    <automated>npx vitest run src/domain/promos/gameSearch.test.ts src/domain/promos/scopeDraft.test.ts src/domain/promos/correctionOptions.test.ts</automated>
  </verify>
  <done>All three test files pass; gameSearch.ts and scopeDraft.ts export the listed functions; every existing correctionOptions assertion is unchanged and passing; CorrectionEventOption carries homeTeam, awayTeam, etDate, searchText.</done>
</task>

<task type="auto">
  <name>Task 2: ScopePicker component (mode toggle, searchable game list, league + date range)</name>
  <files>src/components/promos/ScopePicker.tsx</files>
  <action>
    Create src/components/promos/ScopePicker.tsx ("use client"). Copy ThroughDaySelect into it unchanged in behavior (Select over throughDayOptions, first item "(same day)"), but give its trigger className "h-11 w-full". Leave CorrectionScopeSelect.tsx in place for now so the build stays green between commits; Task 3 deletes it after rewiring its only two consumers.

    Export ScopePicker with props: idPrefix: string; label?: string (default "Game or league"); draft: ScopeDraft; onDraftChange: (next: ScopeDraft) => void; options: CorrectionOptions; disabled?: boolean. Fully controlled for the draft; its only local state is the search query string and a boolean for whether the results list is expanded.

    Layout, top to bottom (mobile-first, 03-UI-SPEC: controls at least h-10, tap rows at least 44px — use h-11 / min-h-11 for every new control and row):
    1. A Label (text = label) and a ToggleGroup with two ToggleGroupItems, full width (className "w-full", items "h-11 flex-1"): value "game" = "One game", value "league" = "All games in a league". Follow ArbForm's array API; ignore an empty array so one mode is always selected. Switching mode calls onDraftChange({ ...draft, mode }) — the other mode's fields are kept.
    2. Game mode:
       - If draft.eventId is set and the list is collapsed: show one row with the chosen game ("{away} @ {home}" plus formatKickoff(commenceTime) muted, league label as a small Badge) and a "Change game" outline Button (h-11). If the chosen eventId is no longer in options.events, treat it as not chosen (show the search).
       - Otherwise: an Input (type "search", className "h-11", placeholder "Search a team, e.g. Broncos or DEN", autoComplete "off", enterKeyHint "search", aria-controls the list id; no autoFocus so phones don't pop the keyboard). Under it a results container with className including "max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-border" (bounded height, scrolls inside the card). Compute results with useMemo: groupEventOptions(searchEventOptions(options.events, query)). Render each league group with a sticky header (sticky top-0 bg-background, text-sm font-medium: sportLabel) and each day as a muted sub-header (dayLabel), then one button per game: type "button", className with "min-h-11 w-full text-left px-3", aria-pressed when selected, primary text "{awayTeam} @ {homeTeam}", secondary muted formatKickoff(commenceTime), a lucide Check icon when selected. Tapping calls onDraftChange({ ...draft, mode: "game", eventId }) and collapses the list.
       - A small aria-live="polite" muted line with the result count ("12 games" / "1 game"). Zero results: "No games match that search. Try a team name or abbreviation, or switch to All games in a league." Zero cached games at all: "No upcoming games in the cached odds."
    3. League mode: a grid "grid gap-3 sm:grid-cols-3" (stacks on phones) of three Selects, triggers "h-11 w-full":
       - League: items from leagueOptions(options.sportDays); onValueChange -> onDraftChange(selectLeague(draft, value, options.sportDays)).
       - From: items from fromDayOptions(options.sportDays, draft.sportKey); disabled until a league is chosen; onValueChange -> onDraftChange(selectFromDay(draft, value, new Date())).
       - Through: ThroughDaySelect with startEtDate = draft.fromEtDate (render only when fromEtDate is set); onValueChange -> onDraftChange({ ...draft, throughEtDate }).
       Under the grid, one muted helper line: "Counts every {league} game from {from} through {through} (ET)." when complete.
    Every control id is derived from idPrefix plus a suffix so two cards on the page never collide. Respect `disabled` on every control. Do not use dangerouslySetInnerHTML; search text is never sent to the server. Do not call setState inside useEffect (derive from props instead) so the react-hooks lint rules pass.
  </action>
  <verify>
    <automated>grep -c "export function ScopePicker\|export function ThroughDaySelect\|searchEventOptions(\|groupEventOptions(\|max-h-72\|min-h-11" src/components/promos/ScopePicker.tsx && npx tsc --noEmit && npx eslint src/components/promos/ScopePicker.tsx</automated>
  </verify>
  <done>ScopePicker.tsx exists with the two-mode toggle, bounded searchable grouped list with 44px rows, and League/From/Through selects; grep count is at least 6; tsc and eslint are clean for the new file.</done>
</task>

<task type="auto">
  <name>Task 3: Wire ScopePicker into both review cards; full checks</name>
  <files>src/components/promos/QueueItemCard.tsx, src/components/promos/ClassifyQueueCard.tsx, src/components/promos/CorrectionScopeSelect.tsx</files>
  <action>
    After rewiring both cards (below), delete src/components/promos/CorrectionScopeSelect.tsx (git rm): its exports CorrectionScopeSelect, EVENT_PREFIX, DAY_PREFIX, scopeInputFromValue, dayEtDateFromValue, ScopeSelectionInput, ThroughDaySelect and the local groupCorrectionOptions have no other consumers (grep-verified at planning time: only these two cards import it).

    QueueItemCard.tsx (Correct sub-panel):
    - Replace eventValue/throughValue state with one draft state (useState of ScopeDraft, initial EMPTY_SCOPE_DRAFT). Keep marketValue ("best" default).
    - toggleCorrect: when opening with draft still equal to EMPTY_SCOPE_DRAFT and item.scrapedWindow is set, set draft to prefillScopeDraft(item.scrapedWindow, correctionOptions.sportDays, new Date()) when non-null (same presentational prefill as 260929-gcn).
    - Render ScopePicker (idPrefix `correct-${item.promoId}`, options correctionOptions, draft, onDraftChange). In onDraftChange, if the next draft's eventId differs from the current one, reset marketValue to "best".
    - selectedEvent = draft.mode === "game" && draft.eventId ? correctionOptions.events.find(e => e.eventId === draft.eventId) : undefined. Show the existing "Market / side" Select only when draft.mode === "game" (hidden in league mode, same as the old sport-day behavior); give its trigger h-11.
    - saveMatch: scopeInput = scopeInputFromDraft(draft); return early when null. Event -> { kind: "event", eventId, pinned: selectedEvent?.markets.find(m => m.value === marketValue)?.pinned ?? null }; sport_day -> scopeInput as-is. Save button disabled when scopeInputFromDraft(draft) is null or pending. On ok and on Cancel, reset draft to EMPTY_SCOPE_DRAFT and marketValue to "best".
    ClassifyQueueCard.tsx (boost and bonus panels):
    - Same draft state replacing eventValue/throughValue; resetPanels resets it; applyScrapedWindowPrefill uses prefillScopeDraft only when the draft is still EMPTY_SCOPE_DRAFT.
    - scopeControls(idPrefix) renders ScopePicker with idPrefix `${idPrefix}-${item.promoId}` and label "Game or league".
    - Both payload.scope assignments become scopeInputFromDraft(draft) (null when nothing complete is chosen — same meaning as today's eventValue null: promo goes to match review). No pin on classify (unchanged).
    Remove every import of the deleted CorrectionScopeSelect module and any now-unused imports (Select pieces, prefillSportDay, Label) so lint passes. Update the doc-comments that mentioned the old dropdown to describe the picker. Do NOT touch any file under src/app/actions, src/db, src/ingestion, reviewInput.ts, memberScope.ts, verbatimGuard.ts or reconcile.ts.

    Then run the full suite. If `npx tsc --noEmit` reports only the pre-existing src/app/layout.tsx "Cannot find name 'LayoutProps'" error (Next generated types missing in a fresh worktree), run `npx next typegen` and re-run tsc; it must end with zero errors.
  </action>
  <verify>
    <automated>! grep -rn "CorrectionScopeSelect\|scopeInputFromValue\|dayEtDateFromValue\|EVENT_PREFIX\|DAY_PREFIX" src && git diff --quiet HEAD -- src/app/actions src/db src/ingestion src/domain/promos/reviewInput.ts src/domain/promos/memberScope.ts && npx vitest run && npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>CorrectionScopeSelect.tsx is deleted; both cards use ScopePicker and scopeInputFromDraft; no reference to the old dropdown remains anywhere in src; server/DB/ingestion files are byte-unchanged; full vitest, tsc and lint pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| browser -> server action | The picker's scope choice crosses into correctPromoMatch / classifyPromo; the client is untrusted |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-hht-01 | Tampering | correctPromoMatch / classifyPromo scope input | mitigate | Unchanged server path: strict zod schemas in reviewInput.ts plus resolveMemberScope re-validate every eventId against cached odds and recompute ET-day bounds server-side; Task 3's verify asserts those files are byte-unchanged |
| T-hht-02 | Information disclosure / XSS | ScopePicker search text and team names | mitigate | Rendered only through React text nodes (no dangerouslySetInnerHTML); the search query stays client-side and is never sent to the server |
| T-hht-03 | Tampering | money-number path (CR-04, verbatimGuard, reconcile) | accept | Not touched by this UI-only change; no new path lets a reader number reach an active promo |
</threat_model>

<verification>
- npx vitest run (full suite) passes, including new gameSearch.test.ts and scopeDraft.test.ts.
- npx tsc --noEmit reports zero errors; npm run lint is clean.
- git diff shows no changes under src/app/actions, src/db, src/ingestion, drizzle/, or to reviewInput.ts / memberScope.ts / verbatimGuard.ts / reconcile.ts.
- Owner walkthrough (after merge, on a phone): open a match card's Correct, type "bron" and pick the game; switch to "All games in a league", pick NHL, From today, Through tomorrow, save; open a "Needs a look" card and confirm the league mode is prefilled from the scraped window.
</verification>

<success_criteria>
- A single game is found by typing a few letters of a team name or abbreviation, with no long dropdown to scroll.
- A league-wide promo over one or several days is set with League / From / Through, prefilled when the book's text named the dates.
- Server payloads are identical to before for the same choice (single-day has no etEndDate key).
- No multi-game selection, no new scope kind, no migration.
</success_criteria>

<output>
Create `.planning/quick/260929-hht-review-game-picker-searchable-multi-game/260929-hht-SUMMARY.md` when done
</output>
