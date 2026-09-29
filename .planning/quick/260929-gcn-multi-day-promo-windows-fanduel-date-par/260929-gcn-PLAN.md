---
phase: quick-260929-gcn
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/domain/promos/etTime.ts
  - src/domain/promos/etTime.test.ts
  - src/ingestion/promos/books/fanduel.ts
  - src/ingestion/promos/books/fanduel.test.ts
  - src/test/fixtures/promos/fanduel-promo-detail-nhl-boost-0929.json
  - src/domain/promos/memberScope.ts
  - src/domain/promos/memberScope.test.ts
  - src/domain/promos/reviewInput.ts
  - src/domain/promos/correctionOptions.ts
  - src/domain/promos/correctionOptions.test.ts
  - src/app/actions/correct-promo-match.ts
  - src/app/actions/classify-promo.ts
  - src/app/actions/promo-review.test.ts
  - src/domain/promos/dto.ts
  - src/app/actions/get-promos.ts
  - src/app/actions/get-promos.test.ts
  - src/components/promos/CorrectionScopeSelect.tsx
  - src/components/promos/QueueItemCard.tsx
  - src/components/promos/ClassifyQueueCard.tsx
autonomous: true
requirements: [QUICK-260929-gcn]

must_haves:
  truths:
    - "A FanDuel promo whose text says 'for any NHL Games on September 29th and September 30th, 2026' is stored with windowStart 2026-09-29T04:00:00.000Z and windowEnd 2026-10-01T03:59:59.999Z (both ET days covered), instead of null"
    - "FanDuel promos without an explicit, unambiguous date list keep windowStart/windowEnd null; the existing single-date CFB window (…04:00Z .. expiresAt 06:00Z) and the Eagles @ Bears single-game window are unchanged"
    - "The LONHLPBT0929 promo still has maxStake null with 'maxStake' in unparsedCapFields, so CR-04 still sends it to review for the amount"
    - "In the review queue, after picking a sport day a member can pick a 'Through' day (default = same day) and save a multi-day sport window in one step"
    - "The server recomputes range bounds from the date strings, rejects end-before-start, impossible dates and days past the 7-day correction window as invalid, and returns stale only when the END day is over"
    - "A single-day sport_day submission (no etEndDate) produces exactly the same result as before"
    - "When a queued promo already has a scraped window, the Game-or-day and Through selectors open prefilled with that window's first and last ET days"
  artifacts:
    - path: "src/domain/promos/etTime.ts"
      provides: "parseEtDateSpan (date-list/range phrase -> first/last ET date) and extendToExpiry (slateWindow's 12h-extension step, reused by slateWindow)"
      contains: "export function parseEtDateSpan"
    - path: "src/ingestion/promos/books/fanduel.ts"
      provides: "multi-date sport-wide scope phrase -> ET-day window"
    - path: "src/test/fixtures/promos/fanduel-promo-detail-nhl-boost-0929.json"
      provides: "LONHLPBT0929 detail payload in the same shape as fanduel-promo-detail-cfb-boost.json"
    - path: "src/domain/promos/memberScope.ts"
      provides: "sport_day input with optional etEndDate, range validation"
      contains: "etEndDate"
    - path: "src/domain/promos/correctionOptions.ts"
      provides: "throughDayOptions, scrapedWindowEtDays, prefillSportDay pure helpers"
      contains: "export function throughDayOptions"
    - path: "src/components/promos/CorrectionScopeSelect.tsx"
      provides: "ThroughDaySelect component + scopeInputFromValue(value, throughEtDate)"
      contains: "ThroughDaySelect"
  key_links:
    - from: "src/ingestion/promos/books/fanduel.ts"
      to: "src/domain/promos/etTime.ts"
      via: "parseEtDateSpan + etDayBounds in buildCandidate"
      pattern: "parseEtDateSpan\\("
    - from: "src/domain/promos/reviewInput.ts"
      to: "src/domain/promos/memberScope.ts"
      via: "SportDayScopeInputSchema.etEndDate passed by correct-promo-match.ts and classify-promo.ts into resolveMemberScope"
      pattern: "etEndDate"
    - from: "src/components/promos/QueueItemCard.tsx"
      to: "src/app/actions/correct-promo-match.ts"
      via: "scopeInputFromValue(eventValue, throughValue) -> correctPromoMatch payload"
      pattern: "scopeInputFromValue\\(eventValue, "
    - from: "src/app/actions/get-promos.ts"
      to: "src/domain/promos/dto.ts"
      via: "QueueItemDTO.scrapedWindow built from row.parsed.windowStart/windowEnd/sportKeyHint"
      pattern: "scrapedWindow"
---

<objective>
Make multi-day promos work end to end. (1) The FanDuel parser turns explicit game-date lists/ranges ("for any NHL Games on September 29th and September 30th, 2026") into an ET-day window covering every named day, instead of leaving the window empty. (2) The review queue's "any {sport} game on day X" choice gains an optional "Through" day so a member can scope a promo to several days in one save, prefilled from the scraped window when there is one.

Purpose: LONHLPBT0929 (NHL 50% Profit Boost Token, valid Sept 29 AND Sept 30) was stored with no window, and the review queue could only scope it to one day, silently dropping the Sept 30 games.
Output: parser + etTime helper + LONHLPBT0929 fixture; range-aware resolveMemberScope, zod schemas and actions; review UI "Through" selector with prefill; table-driven Vitest coverage.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/phases/03-promo-scraping-review/.continue-here.md

<background>
Live evidence (verified by the orchestrator in Neon, 2026-09-29): LONHLPBT0929 scraped 2026-09-29T17:34Z. Its detail rawText includes
"Get a 50% Profit Boost Token to use on ANY wager for any NHL Games on September 29th and September 30th, 2026!" and
"Profit Boost Token is valid for use on ANY wager, -200 or Longer, for any NHL Games on September 29th and September 30th, 2026, up to a maximum wager. Log in for more details." and
"Profit Boost Token expires at 2:00 AM ET on Thursday, October 1st, 2026."
Stored parse: sportKeyHint icehockey_nhl, boostPercent 50.00, minOddsAmerican -200, maxStake null, unparsedCapFields ["maxStake"], expiresAt 2026-10-01T06:00:00Z, windowStart/windowEnd null.
sourceUrl: https://api.sportsbook.fanduel.com/promos/api/promotions/LONHLPBT0929?channel=desktop&rewardsHubEnabled=true&cyrWithPromosEnabled=true&isChallengesEnabled=true&rewardBoxEnabled=false
Same run: LOWNBAPB0929 (WNBA) is skipped as unsupported_sport — leave that alone.

Why the window is null today: fanduel.ts SCOPE_PHRASE_RE requires "<Month> <day>[suffix], <year>" immediately after "Games on", so "September 29th and ..." does not match; GAME_SCOPE_RE needs "for the A @ B"; so buildCandidate falls through to the null-window branch.
</background>

<interfaces>
From src/domain/promos/etTime.ts (existing; MONTH_NAMES, parseDateOnly, isRealCalendarDate, computeEtDayBounds are module-private):
- export function etDayBounds(etDate: string): { start: string; end: string } | null   // "YYYY-MM-DD" -> ET day; null for impossible dates (WR-12)
- export function etDayWindow(dateText: string): { start; end } | null                  // "September 26th, 2026" or "9/26/2026"
- export function etDayLabel(iso: string): string                                        // "Sun, Sep 27"
- export function slateWindow(dateText: string, expiresAt: string | null): { start; end } | null
    // ET-day window, end extended to expiresAt when expiresAt is later than day end by (0, 12h]

From src/ingestion/promos/books/fanduel.ts (module-private):
- SCOPE_PHRASE_RE = /for\s+any\s+(.+?)\s+Games?\s+on\s+([A-Za-z]+\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4})/i
- extractScope(text) -> { scopeText: `${sportWords} Games on ${dateText}`, dateText } | null
- GAME_SCOPE_RE / parseGameScope(text) (single game "for the A @ B NFL Game on September 28"), withInferredYear(dateText, expiresAt)
- buildCandidate(params): precedence today = extractScope -> slateWindow; else parseGameScope -> slateWindow(withInferredYear); else scopeText = entry.name, window null
- buildCandidateWithDetail: text = `${entry.name}\n${detail.title}\n${htmlToText(detail.description)}`; expiresAt = detail.combinedEndDate ?? detail.customerPromotionState?.promoStateExpiryDate ?? entry.combinedEndDate ?? null
- FanduelDetailResponseSchema = z.array(FanduelDetailEntrySchema).min(1)  (detail fixture is a JSON array with one object)

From src/domain/promos/memberScope.ts:
- export type MemberScopeInput = { kind: "event"; eventId: string } | { kind: "sport_day"; sportKey: string; etDate: string };
- export type MemberScopeResult = { status: "ok"; scope: ScopeGuess; event: OddsEvent | null } | { status: "stale"; message: string } | { status: "invalid" };
- export function resolveMemberScope(input, events: { moneyline; extended }, now: Date): MemberScopeResult
  sport_day today: etDayBounds null -> invalid; bounds.end <= now -> stale "That day has already passed. Pick another."; bounds.start > now + DEFAULT_WINDOW_DAYS days -> invalid; else ok { kind: "sport_window", sportKey, windowStart: bounds.start, windowEnd: bounds.end }, event null.

From src/domain/promos/reviewInput.ts:
- const SportDayScopeInputSchema = z.strictObject({ kind: z.literal("sport_day"), sportKey: z.enum(SPORT_KEYS), etDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })
  used by both ClassifyScopeInputSchema and CorrectMatchInputSchema.

From src/app/actions/correct-promo-match.ts (~line 60) and classify-promo.ts (~line 54): both build the resolveMemberScope input inline as
  `{ kind: "sport_day", sportKey: X.sportKey, etDate: X.etDate }` — etEndDate must be threaded through here.

From src/domain/promos/correctionOptions.ts:
- export const DEFAULT_WINDOW_DAYS = 7
- export interface CorrectionSportDayOption { value: `${sportKey}|${etDate}`; sportKey; sportLabel; etDate; label }
- module-private etDateKey(iso) -> "YYYY-MM-DD" in America/New_York
- NOTE: correctionOptions.ts imports etTime.ts, so etTime.ts must NOT import correctionOptions.ts (cycle).

From src/components/promos/CorrectionScopeSelect.tsx:
- export const EVENT_PREFIX = "event:"; export const DAY_PREFIX = "day:";   day option value = `day:${sportKey}|${etDate}`
- export type ScopeSelectionInput = { kind: "event"; eventId } | { kind: "sport_day"; sportKey; etDate }
- export function scopeInputFromValue(value: string): ScopeSelectionInput
- CorrectionScopeSelect props: { id, value, onValueChange, options, label?, placeholder?, disabled? }
Consumers: QueueItemCard.tsx (eventValue state, isSportDaySelected, saveMatch, Correct toggle button at ~line 199 `setCorrectOpen((open) => !open)`), ClassifyQueueCard.tsx (eventValue shared by openBoostPanel/openBonusPanel, saveBoost/saveBonus call `scopeInputFromValue(eventValue)`, resetPanels()).

From src/domain/promos/dto.ts: QueueItemDTO { promoId; kind; bookName; promoTypeLabel; description; bestGuessLabel; matchedLabel; capRecap; unparsedCapFields; classify }
From src/app/actions/get-promos.ts: toQueueItemDTO(row: QueueRow) — row.parsed has windowStart, windowEnd, sportKeyHint.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: FanDuel multi-date windows (etTime span parser + fanduel wiring + LONHLPBT0929 fixture)</name>
  <files>src/domain/promos/etTime.ts, src/domain/promos/etTime.test.ts, src/ingestion/promos/books/fanduel.ts, src/ingestion/promos/books/fanduel.test.ts, src/test/fixtures/promos/fanduel-promo-detail-nhl-boost-0929.json</files>
  <behavior>
    parseEtDateSpan(spanText, expiresAt) table (etTime.test.ts, it.each), expiresAt "2026-10-01T06:00:00Z" unless stated:
    - "September 29th and September 30th, 2026" -> { startEtDate: "2026-09-29", endEtDate: "2026-09-30", dayCount: 2 }
    - "September 29th, 2026" -> { "2026-09-29", "2026-09-29", 1 }
    - "September 29th" (no year) -> year inferred from expiresAt -> { "2026-09-29", "2026-09-29", 1 }
    - "September 29th - September 30th" / "September 29th – September 30th, 2026" -> 29..30
    - "September 29th through October 1st, 2026" and "September 29th thru October 1st" (expiresAt 2026-10-02T06:00:00Z) -> 2026-09-29..2026-10-01, dayCount 3
    - "September 29th, September 30th and October 1st, 2026" -> 29..Oct 1 (consecutive list)
    - "December 31st and January 1st, 2027" -> 2026-12-31..2027-01-01 (yearless date later in the year than the following explicit-year date takes year-1)
    - null cases: "September 29th and October 5th, 2026" (gap in an "and"/comma list), "September 30th and September 29th, 2026" (descending), "September 29th through September 29th" (a range connector needs end > start), "February 30th and February 31st, 2026" (WR-12 impossible), "September 29th and September 30th" with expiresAt null (no year source -> null), "September 29th through October 20th, 2026" (span > 7 days), "this week", "" (garbage)
    FanDuel (fanduel.test.ts):
    - LONHLPBT0929 detail fixture parsed with now 2026-09-29T17:34:00Z -> exactly one candidate with externalId "LONHLPBT0929", windowStart "2026-09-29T04:00:00.000Z", windowEnd "2026-10-01T03:59:59.999Z", sportKeyHint "icehockey_nhl", boostPercent "50.00", minOddsAmerican -200, maxStake null, unparsedCapFields contains "maxStake", scopeText contains "NHL Games on September 29th and September 30th, 2026"
    - synthetic list-only entry "…for any NFL Games this week!" -> windowStart/windowEnd null
    - synthetic list-only entry "…for any NFL Games on October 3rd and October 4th, 2026!" (combinedEndDate "2026-10-05T06:00:00.000Z") -> window 2026-10-03T04:00:00.000Z .. 2026-10-05T03:59:59.999Z
    - existing CFB (single date, 04:00Z..06:00Z extended) and LONFLMNFRE0928 Eagles @ Bears assertions keep passing UNCHANGED (do not edit them)
  </behavior>
  <action>
    Step A — fixture (do this first; per the .continue-here anti-pattern "save a live capture as a fixture before fixing any parser miss"). Run: curl -sS -H "x-sportsbook-region: CO" -H "accept: application/json" -H "referer: https://sportsbook.fanduel.com/" -A "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36" against the LONHLPBT0929 sourceUrl in <background>, and save the raw body to src/test/fixtures/promos/fanduel-promo-detail-nhl-boost-0929.json. Accept it only if it is a JSON array whose first element has promoCode "LONHLPBT0929", a title, and a description containing "September 29th and September 30th, 2026" (check with node -e / python3). Do not send or forge any x-px-context/PerimeterX header (T-03-14-03). If the fetch fails or the promo is gone, hand-build the fixture in the SAME shape as fanduel-promo-detail-cfb-boost.json (open that file and mirror its keys: a one-element array with promoCode, name, title, description (HTML, like the CFB one), tags, combinedEndDate, customerPromotionState.promoStateExpiryDate, termsAndConditions, etc.), using the rawText lines from <background> as the name/description text, title "NHL Profit Boost Token", combinedEndDate "2026-10-01T06:00:00.000Z", and state in SUMMARY that it is hand-built. Do not assert fixture facts in tests that you have not read in the saved file.

    Step B — etTime.ts (RED first: write the parseEtDateSpan table in etTime.test.ts, run, see it fail). Add and export:
    (1) parseEtDateSpan(spanText: string, expiresAt: string | null): { startEtDate: string; endEtDate: string; dayCount: number } | null. Tokenise the text into dates and connectors. A date = month name (existing MONTH_NAMES, full names; also accept the common 3-4 letter abbreviations "Sept"/"Sep"/"Oct" etc. only if trivial — otherwise full names only) + day 1-31 with optional st/nd/rd/th + optional ", YYYY". Connectors: list type = "," / "and" / ", and" / "&"; range type = "-" / en dash / em dash / "through" / "thru" / "to" / "until". Anything else in the text (other words) -> null. Year rules: a yearless date takes the year of the NEXT date in the phrase that has an explicit year, minus 1 if its month is greater than that date's month; if no date has an explicit year, use the ET calendar year of expiresAt, and if that date's ET day would start after expiresAt use year-1; if a year is still needed and expiresAt is null -> null. Validation (fail closed -> null on any violation): every date is a real calendar date (reuse isRealCalendarDate, WR-12); dates strictly ascending; each list-connected adjacent pair must be consecutive calendar days (a gap would cover unlisted days); each range-connected pair must have end > start; total span (last - first) at most 6 days (dayCount <= 7; local constant MAX_SPAN_DAYS with a comment — do NOT import DEFAULT_WINDOW_DAYS from correctionOptions.ts, that creates an import cycle). Return YYYY-MM-DD strings (zero-padded) that etDayBounds accepts.
    (2) extendToExpiry(window: { start: string; end: string }, expiresAt: string | null) — the existing 12h-extension step lifted out of slateWindow; rewrite slateWindow as etDayWindow + extendToExpiry so its behavior and existing tests are byte-for-byte unchanged.

    Step C — fanduel.ts buildCandidate. Add a new sport-wide span regex (bounded, no nested quantifiers, same catastrophic-backtracking discipline as GAME_SCOPE_RE, T-pcc-02): "for any <sport words> Game(s) on <span>" where <span> is a run of date tokens and connectors (month name, day+suffix, optional ", YYYY", connectors) stopping at the first character that is not part of that vocabulary (e.g. "!" or ", up to"). Precedence in buildCandidate, top to bottom: (1) span regex matches AND parseEtDateSpan returns dayCount >= 2 -> window = { start: etDayBounds(startEtDate).start, end: etDayBounds(endEtDate).end } with NO expiry extension (orchestrator-specified expected end 2026-10-01T03:59:59.999Z even though expiresAt is 06:00Z); scopeText = truncate(`${sportWords} Games on ${spanText}`, MAX_SCOPE_TEXT_CHARS). (2) existing extractScope/SCOPE_PHRASE_RE branch exactly as today (single dated day, slateWindow). (3) span regex matched a single YEARLESS date (dayCount 1, e.g. "for any NHL Games on September 29th") -> window = extendToExpiry(etDayBounds(startEtDate), expiresAt), same semantics as the existing single-day path. (4) existing parseGameScope branch exactly as today. (5) existing fallback, window null. If parseEtDateSpan returns null, fall through to the next branch (never partially set a window). teamsText handling mirrors the existing sport-wide branch (splitTeams on scopeText). Do not touch sportHints.ts (LOWNBAPB0929 stays unsupported_sport), finePrint.ts, verbatimGuard.ts, reconcile.ts or CR-04 — the "up to a maximum wager. Log in for more details." text must still yield maxStake null + "maxStake" in unparsedCapFields. Update the SCOPE_PHRASE_RE doc comment to mention the new multi-date branch.

    Step D — fanduel.test.ts: new describe block for the 2026-09-29 NHL fixture. Build the list body in the test from the saved detail fixture's own fields (promoCode, title, name, tags, combinedEndDate read from the parsed fixture JSON — not hard-coded guesses), pass the raw fixture string as detailBodies.LONHLPBT0929, and assert the behavior list above. Add the two synthetic list-only cases. GREEN, then refactor if needed.
  </action>
  <verify>
    <automated>npx vitest run src/domain/promos/etTime.test.ts src/ingestion/promos/books/fanduel.test.ts</automated>
  </verify>
  <done>Fixture file exists and parses as a one-element array for LONHLPBT0929; parseEtDateSpan table passes including null cases; LONHLPBT0929 window is 2026-09-29T04:00:00.000Z .. 2026-10-01T03:59:59.999Z with maxStake still unparsed; "this week" promo stays null; all pre-existing etTime/fanduel assertions pass unedited.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Range-aware resolveMemberScope, zod schemas, server actions, and pure UI helpers</name>
  <files>src/domain/promos/memberScope.ts, src/domain/promos/memberScope.test.ts, src/domain/promos/reviewInput.ts, src/app/actions/correct-promo-match.ts, src/app/actions/classify-promo.ts, src/app/actions/promo-review.test.ts, src/domain/promos/correctionOptions.ts, src/domain/promos/correctionOptions.test.ts</files>
  <behavior>
    resolveMemberScope (memberScope.test.ts, it.each table, NOW = 2026-09-27T12:00:00Z as in the existing file):
    - { etDate "2026-09-28", etEndDate "2026-09-29" } -> ok sport_window windowStart "2026-09-28T04:00:00.000Z", windowEnd "2026-09-30T03:59:59.999Z", event null
    - start already over but end in future { "2026-09-26", "2026-09-28" } -> ok, windowStart "2026-09-26T04:00:00.000Z"
    - end < start { "2026-09-29", "2026-09-28" } -> invalid
    - impossible end { "2026-09-28", "2026-09-31" } -> invalid; impossible start with valid end -> invalid
    - end beyond correction window { "2026-09-28", "2026-10-06" } -> invalid; start beyond window -> invalid
    - stale end { "2026-09-20", "2026-09-25" } -> stale with a range message
    - single day: etEndDate omitted and etEndDate === etDate both return exactly the pre-existing result (ok / stale "That day has already passed. Pick another." / invalid) — existing tests stay unedited
    Actions (promo-review.test.ts): correctPromoMatch with a sport_day range calls mockApplyCorrectedMatch with a sport_window scope whose bounds are recomputed server-side from the two date strings; end<start and malformed etEndDate ("2026-9-1", extra key) -> { status: "invalid" } with no apply call; classifyPromo with a range passes the multi-day sport_window to mockApplyClassification.
    correctionOptions.test.ts:
    - throughDayOptions("2026-09-28", now 2026-09-27T12:00:00Z) -> consecutive etDates starting "2026-09-28" and ending at the last day whose ET start <= now + 7 days ("2026-10-04"), each with an etDayLabel label; invalid start -> []
    - scrapedWindowEtDays("2026-09-29T04:00:00.000Z", "2026-10-01T03:59:59.999Z") -> { "2026-09-29", "2026-09-30" }; CFB-style ("2026-09-26T04:00:00.000Z", "2026-09-27T06:00:00.000Z") -> { "2026-09-26", "2026-09-26" }; single day -> same day both
    - prefillSportDay: window start day present in sportDays -> that option's value + endEtDate; start day absent but a later in-window day of the same sport present -> that one; no same-sport day in [start,end] -> null; endEtDate past the last throughDayOptions entry -> clamped to it
  </behavior>
  <action>
    memberScope.ts: extend MemberScopeInput's sport_day variant with optional etEndDate?: string. In the sport_day branch: startBounds = etDayBounds(etDate), endEtDate = input.etEndDate ?? input.etDate, endBounds = etDayBounds(endEtDate); either null -> invalid (WR-12 kept). endEtDate < etDate (string compare is safe after the regex/etDayBounds validation) -> invalid. endBounds.end <= now -> stale; keep the exact existing message "That day has already passed. Pick another." when endEtDate === etDate, and use "Those days have already passed. Pick another." for a real range. startBounds.start OR endBounds.start > now + DEFAULT_WINDOW_DAYS days -> invalid. ok -> { kind: "sport_window", sportKey, windowStart: startBounds.start, windowEnd: endBounds.end }, event null. Bounds are ALWAYS recomputed here from the date strings, never taken from the client. Update the doc comment. Keep the check order: impossible dates, end<start, stale, window.

    reviewInput.ts: add etEndDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() to SportDayScopeInputSchema (strictObject stays strict, so unknown keys still fail). Both CorrectMatchInputSchema and ClassifyScopeInputSchema inherit it.

    correct-promo-match.ts and classify-promo.ts: where the sport_day resolveMemberScope input is built inline, pass etEndDate through (only include the key when defined, so single-day inputs are identical to today). No other logic changes in either action.

    correctionOptions.ts — pure helpers (no I/O, reuse the module's etDateKey and etTime's etDayBounds/etDayLabel):
    (1) export function throughDayOptions(startEtDate: string, now: Date, windowDays = DEFAULT_WINDOW_DAYS): { etDate: string; label: string }[] — consecutive ET calendar dates from startEtDate while etDayBounds(date).start <= now + windowDays days (the same bound resolveMemberScope enforces, so the UI never offers a day the server rejects); date stepping via Date.UTC(y, m-1, d+i) sliced to YYYY-MM-DD; label = etDayLabel(bounds.start); [] if etDayBounds(startEtDate) is null.
    (2) export function scrapedWindowEtDays(windowStart: string, windowEnd: string): { startEtDate: string; endEtDate: string } | null — start = etDateKey(windowStart); end = etDateKey of max(windowStart, windowEnd minus 12h) so slateWindow's up-to-12h after-midnight extension (CFB 06:00Z end) maps back to the named day; null if either ISO is invalid or end < start.
    (3) export function prefillSportDay(window: { sportKey: string; startEtDate: string; endEtDate: string }, sportDays: CorrectionSportDayOption[], now: Date): { value: string; throughEtDate: string } | null — pick the sportDays option with this sportKey and etDate === startEtDate, else the earliest same-sport option with startEtDate <= etDate <= endEtDate; null if none. value is the option's value (CorrectionSportDayOption.value, i.e. `${sportKey}|${etDate}` — the caller adds DAY_PREFIX). throughEtDate = window.endEtDate clamped to [chosen etDate, last throughDayOptions(chosen etDate, now) entry].

    Tests: write the tables first (RED), then implement (GREEN). In promo-review.test.ts reuse the existing etDateOf/plusHours helpers and mocks (mockApplyCorrectedMatch, mockApplyClassification) — read the neighbouring sport_day tests (~lines 597-700 and ~1123-1260) for the exact patterns. Do not edit existing single-day assertions.
  </action>
  <verify>
    <automated>npx vitest run src/domain/promos/memberScope.test.ts src/domain/promos/correctionOptions.test.ts src/app/actions/promo-review.test.ts</automated>
  </verify>
  <done>Range cases pass with server-recomputed bounds; end<start / impossible / past-window -> invalid; stale only when the end day is over; single-day behavior and messages unchanged; throughDayOptions/scrapedWindowEtDays/prefillSportDay tables pass.</done>
</task>

<task type="auto">
  <name>Task 3: Review UI "Through" day selector with scraped-window prefill</name>
  <files>src/domain/promos/dto.ts, src/app/actions/get-promos.ts, src/app/actions/get-promos.test.ts, src/components/promos/CorrectionScopeSelect.tsx, src/components/promos/QueueItemCard.tsx, src/components/promos/ClassifyQueueCard.tsx</files>
  <action>
    dto.ts: add to QueueItemDTO `scrapedWindow: { sportKey: string; startEtDate: string; endEtDate: string } | null` with a doc comment (presentational prefill only; server re-validates everything).

    get-promos.ts toQueueItemDTO: scrapedWindow = when row.parsed.sportKeyHint, row.parsed.windowStart and row.parsed.windowEnd are all non-null and scrapedWindowEtDays(...) is non-null -> { sportKey: sportKeyHint, ...thatResult }; else null. Update get-promos.test.ts expectations only where a full QueueItemDTO toEqual now needs the new key, and add one case: a match row whose parsed window is 2026-09-29T04:00:00.000Z..2026-10-01T03:59:59.999Z with sportKeyHint icehockey_nhl -> scrapedWindow { "icehockey_nhl", "2026-09-29", "2026-09-30" }; a row with null window -> null.

    CorrectionScopeSelect.tsx:
    - ScopeSelectionInput sport_day variant gains optional etEndDate?: string.
    - scopeInputFromValue(value: string, throughEtDate?: string | null): for a day value, include etEndDate ONLY when throughEtDate is a non-empty string different from etDate (single-day payloads stay byte-identical to today). Event values ignore throughEtDate.
    - export function ThroughDaySelect({ id, startEtDate, value, onValueChange, disabled }): Label "Through" + Select whose items come from throughDayOptions(startEtDate, new Date()); the first item (the start day itself) is labelled "{label} (same day)"; value is an etDate string. Use the same Label/Select/SelectTrigger (className "h-10 w-full") primitives as CorrectionScopeSelect.
    - export a small helper dayEtDateFromValue(value: string | null): string | null that returns the etDate part of a DAY_PREFIX value (null otherwise), so both cards share it.

    QueueItemCard.tsx: add throughValue state (string | null). When the CorrectionScopeSelect value changes: if the new value is a day value, set throughValue to its etDate; otherwise null (keep the existing setMarketValue("best") reset). When isSportDaySelected, render ThroughDaySelect (id `correct-through-${item.promoId}`) beside the day dropdown (wrap both in a responsive flex row / grid so it reads "Any NHL game · Tue, Sep 29 (ET)  Through  Wed, Sep 30"). saveMatch passes scopeInputFromValue(eventValue, throughValue); on ok also reset throughValue. Prefill: in the Correct toggle handler, when opening and eventValue is null and item.scrapedWindow is non-null, call prefillSportDay(item.scrapedWindow, correctionOptions.sportDays, new Date()); if non-null set eventValue to `${DAY_PREFIX}${result.value}` and throughValue to result.throughEtDate. Event-kind selection and market/side behavior unchanged.

    ClassifyQueueCard.tsx: same throughValue state shared by the boost and bonus panels (they already share eventValue); render ThroughDaySelect under/beside each CorrectionScopeSelect when a day is selected (ids `classify-through-boost-${id}` / `classify-through-bonus-${id}`); saveBoost/saveBonus use scopeInputFromValue(eventValue, throughValue); resetPanels clears throughValue; openBoostPanel/openBonusPanel apply the same scrapedWindow prefill when eventValue is null.

    No new dependencies. Keep "use client" files free of server imports (they may import from src/domain — existing precedent: ClassifyQueueCard imports etDayLabel).
  </action>
  <verify>
    <automated>npx vitest run && npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>Full Vitest suite, tsc --noEmit and eslint pass; both review cards show a "Through" selector only when a sport day is chosen, defaulting to the same day; a queued promo with a scraped multi-day window opens prefilled with its first and last ET days; single-day saves send the same payload as before (no etEndDate key).</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| FanDuel API -> parser | Untrusted third-party promo text drives window dates |
| browser -> server actions | Member-submitted scope (dates) for correctPromoMatch / classifyPromo |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gcn-01 | Tampering | resolveMemberScope etEndDate | mitigate | zod strictObject + YYYY-MM-DD regex; bounds recomputed server-side via etDayBounds; impossible dates, end<start, past-window start/end rejected as invalid |
| T-gcn-02 | Denial of Service | fanduel span regex | mitigate | bounded token vocabulary, no nested quantifiers (T-pcc-02 discipline); rawText already truncated to 2000 chars |
| T-gcn-03 | Tampering | parser window over-reach | mitigate | fail closed: gaps in "and" lists, descending dates, >7-day spans, missing year source -> null window (falls back to existing behavior / review) |
| T-gcn-04 | Information Disclosure | fixture capture | accept | public logged-out endpoint, no cookies/auth; no PerimeterX header forged (T-03-14-03) |
| T-gcn-05 | Elevation of Privilege | review actions | accept | no change to requireUser()/IDOR discipline; no userId field added to any schema |
</threat_model>

<verification>
- npx vitest run (full suite) passes
- npx tsc --noEmit passes
- npm run lint passes
- LONHLPBT0929 fixture test asserts window 2026-09-29T04:00:00.000Z .. 2026-10-01T03:59:59.999Z and maxStake still unparsed
- git diff shows no changes to src/ingestion/promos/verbatimGuard.ts, reconcile.ts, finePrint.ts, sportHints.ts
</verification>

<success_criteria>
- Multi-day FanDuel promos with explicit dates get a window spanning every named ET day; ambiguous text stays null
- Existing single-day and single-game FanDuel windows are unchanged
- Review queue can save a multi-day sport window in one step, validated and recomputed server-side, prefilled from the scraped window
- Single-day review submissions behave exactly as before
</success_criteria>

<output>
Create `.planning/quick/260929-gcn-multi-day-promo-windows-fanduel-date-par/260929-gcn-SUMMARY.md` when done. State whether the LONHLPBT0929 fixture is a live capture or hand-built. In plain English for the owner, say what happens to the already-stored LONHLPBT0929 row: read how src/ingestion/promos/store.ts handles an already-seen promo and report whether the next scrape replaces its single-day scope or whether it must be corrected by hand in the review queue.
</output>
