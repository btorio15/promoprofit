---
phase: quick-260930-iaw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/safeAction.ts
  - src/lib/safeAction.test.ts
  - src/components/finder/finderSearchOutcome.ts
  - src/components/finder/finderSearchOutcome.test.ts
  - src/components/finder/FinderForm.tsx
  - src/app/error.tsx
  - src/app/error.test.ts
  - src/components/arb/ArbForm.tsx
  - src/components/finder/OddsStatusBar.tsx
  - src/components/finder/RefreshConfirmDialog.tsx
  - src/components/arb/SearchSpreadsTotalsDialog.tsx
  - src/components/opportunities/MarkPairDoneButton.tsx
  - src/components/promos/DonePairRow.tsx
  - src/components/promos/MarkUsedButton.tsx
  - src/components/promos/FlagMatchButton.tsx
  - src/components/promos/DismissPromoDialog.tsx
  - src/components/promos/QueueItemCard.tsx
  - src/components/promos/ClassifyQueueCard.tsx
autonomous: true
requirements: [QUICK-260930-iaw]

must_haves:
  truths:
    - "When findHedges throws (e.g. NeonDbError: fetch failed), the Bonus bet finder shows an inline 'Couldn't reach the database — try again.' alert instead of blanking the site"
    - "After that failure the form keeps its typed values, and the next successful search clears the alert and shows results"
    - "A thrown server action on the Arbitrage tab, odds refresh, spreads/totals search, mark-done/undo, flag, dismiss, confirm/correct/caps, or classify buttons shows an inline message instead of crashing the page"
    - "Any other uncaught render error under / shows a short plain 'Something went wrong' screen with a Try again button (src/app/error.tsx), never a stack trace or error message"
    - "findHedges' return contract (ok / no_cached_odds / invalid) is unchanged"
  artifacts:
    - path: "src/lib/safeAction.ts"
      provides: "safeAction helper + ACTION_FAILED_MESSAGE constant"
      exports: ["safeAction", "ACTION_FAILED_MESSAGE", "SafeActionResult"]
    - path: "src/components/finder/finderSearchOutcome.ts"
      provides: "pure mapping from a safeAction(findHedges) result to the finder's next UI state"
      exports: ["resolveFinderOutcome"]
    - path: "src/app/error.tsx"
      provides: "App Router error boundary for the root segment"
      contains: "\"use client\""
  key_links:
    - from: "src/components/finder/FinderForm.tsx"
      to: "src/lib/safeAction.ts"
      via: "both findHedges calls wrapped in safeAction"
      pattern: "safeAction\\(.*findHedges"
    - from: "src/app/error.tsx"
      to: "Next.js error boundary"
      via: "default export receiving { error, retry }"
      pattern: "retry"
---

<objective>
Stop a transient database hiccup (a server action throwing, e.g. `NeonDbError: Error connecting to database: TypeError: fetch failed`) from blanking the whole site.

Purpose: Today a thrown `findHedges` inside `startTransition` in FinderForm propagates as an uncaught error through FinderScreen → ToolsScreen → AppShell → Home, and with no `error.tsx` in `src/app` the entire page disappears — even though the DB is back seconds later.

Output: a tiny shared `safeAction` helper; FinderForm (both calls) shows an inline, retryable error; the other un-guarded server-action call sites use the same pattern; a root `src/app/error.tsx` safety net; vitest coverage.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@src/components/finder/FinderForm.tsx
@src/app/actions/find-hedges.ts
@src/app/page.tsx

<interfaces>
<!-- Extracted from the codebase. Use directly; no exploration needed. -->

Existing precedent (already correct — DO NOT touch): src/components/promos/PromosScreen.tsx
runGetPromos wraps `await getPromos(...)` in try/catch, logs `console.error("getPromos failed:", err)`,
then clears stale rows (setResponse(null)) and shows an inline error (WR-10: "must never leave a blank
tab or silently keep stale rows the member might act on"). ArbForm has the same rule (01.1 review
WR-02b: "Never keep showing stakes computed for a previous total next to a field error").
Already guarded (leave alone): OpportunitiesScreen, PromosScreen, SignupOffersScreen, AddPromoForm,
DeletePromoDialog, ExpirePromoDialog.

FinderForm today:
- state: response (FindHedgesResponse | null), hasSearched, lastValidValues, maxHedgeAmountError
- submit: startTransition(async () => { const result = await findHedges(payload); if invalid -> set field errors; else setLastValidValues(payload); setHasSearched(true); setResponse(result) })
- recompute effect (recomputeKey): startTransition(async () => { const result = await findHedges(lastValidValues); if (result.status !== "invalid") setResponse(result) })
- render: showSkeleton = isPending && !hasPreviousResults → skeleton; !hasSearched → EmptyState; no_cached_odds → EmptyState; ok → ResultsList
- field error styling: <p className="text-sm text-destructive">

FindHedgesResponse (src/domain/finder/types): union with status "ok" | "no_cached_odds" | "invalid" (invalid carries fieldErrors: Record<string, string[] | undefined>).

src/components/ui/alert.tsx exports Alert (variant "default" | "destructive", role="alert"), plus AlertTitle / AlertDescription (check the file's exports; use whatever it exports).
src/components/ui/button.tsx exports Button.

Outcome unions the catch branches synthesize into:
- RefreshOutcome (src/ingestion/odds/refresh.ts) includes { status: "error"; message: string } — OddsStatusBar.handleOutcome maps it to banner kind "error".
- ExtendedRefreshOutcome (src/ingestion/odds/refreshExtended.ts) — ArbForm.handleSearchOutcome does setSearchBanner({ kind: outcome.status, message }) with SearchBanner kind "blocked" | "busy" | "error" | "info". Confirm the union has an "error" variant with message before synthesizing it; otherwise set the banner directly.
- PromoReviewResponse (src/app/actions/confirm-promo-match.ts): "ok" | "invalid" (optional fieldErrors) | { status: "stale"; message } | { status: "conflict"; message } ... — QueueItemCard/ClassifyQueueCard handleOutcome fall through to setMessage(outcome.message).
- MarkPairDoneResponse, MarkDoneResponse, UndoDoneResponse, UndoPairDoneResponse — the buttons already have an errorMessage state.

Next.js 16.3.6 error boundary (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md):
- 'use client' default export receiving { error: Error & { digest?: string }; retry: () => void } (retry is STABLE since v16.3.0 — use `retry`, not `unstable_retry`; `reset` also exists but docs say prefer retry, which re-fetches the segment's server data).
- error.tsx does not wrap the root layout; src/app/layout.tsx does no data fetching (fonts + TooltipProvider only), so NO global-error.tsx is needed.

Test infra: vitest, environment "node", include ["src/**/*.test.ts"] (only .ts, no jsdom / testing-library installed). Component rendering precedent: src/app/settings-navigation.test.ts uses React.createElement + renderToStaticMarkup from react-dom/server with vi.mock. Do NOT add jsdom/@testing-library (no package installs in this task).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: safeAction helper + FinderForm inline DB-error handling (both findHedges calls)</name>
  <files>src/lib/safeAction.ts, src/lib/safeAction.test.ts, src/components/finder/finderSearchOutcome.ts, src/components/finder/finderSearchOutcome.test.ts, src/components/finder/FinderForm.tsx</files>
  <behavior>
    - safeAction(() => Promise.resolve(x), "label") resolves { ok: true, value: x }
    - safeAction(() => Promise.reject(new Error("fetch failed")), "label") resolves { ok: false } (never rejects) and calls console.error once with a message containing the label
    - safeAction rethrows Next.js framework control-flow errors (redirect / notFound — an error whose `digest` is a string starting with "NEXT_REDIRECT" or "NEXT_HTTP_ERROR_FALLBACK") instead of swallowing them, so requireUser's login redirect still works
    - finderSearchOutcome test: with `vi.mock("@/app/actions/find-hedges")` making findHedges reject with an Error named NeonDbError ("Error connecting to database: TypeError: fetch failed"), `resolveFinderOutcome(await safeAction(() => findHedges(payload), "findHedges"))` returns { kind: "error", message: ACTION_FAILED_MESSAGE } (exactly "Couldn't reach the database — try again.")
    - resolveFinderOutcome of an ok result with status "invalid" returns { kind: "invalid", fieldErrors }; with status "ok" or "no_cached_odds" returns { kind: "response", response }
  </behavior>
  <action>
Create src/lib/safeAction.ts (no "use client"/"use server" directive; plain module usable from client components):
- export const ACTION_FAILED_MESSAGE = "Couldn't reach the database — try again." (em dash, as the owner wrote it).
- export type SafeActionResult<T> = { ok: true; value: T } | { ok: false }.
- export async function safeAction<T>(call: () => Promise<T>, label: string): Promise<SafeActionResult<T>> — awaits call(); on throw, first rethrow if the error is a Next framework control-flow error (object with string `digest` starting with "NEXT_REDIRECT" or "NEXT_HTTP_ERROR_FALLBACK"; a local isFrameworkControlError(err) predicate — do not import next internals), otherwise console.error(`${label} failed:`, err) (matches PromosScreen's "getPromos failed:" logging) and return { ok: false }. Never surface the error message to the UI (it can contain connection details).
Tests in src/lib/safeAction.test.ts cover the three behaviors above (spy console.error with vi.spyOn and mockImplementation to keep output quiet).

Create src/components/finder/finderSearchOutcome.ts exporting resolveFinderOutcome(result: SafeActionResult<FindHedgesResponse>) returning a discriminated union FinderOutcome = { kind: "error"; message: string } | { kind: "invalid"; fieldErrors: (the invalid variant's fieldErrors type) } | { kind: "response"; response: Exclude<FindHedgesResponse, {status:"invalid"}> }. Pure, no React. This exists so the "FinderForm shows the inline error when findHedges rejects" path is testable in the node-only vitest setup (no jsdom in the project). Test file src/components/finder/finderSearchOutcome.test.ts: vi.mock("@/app/actions/find-hedges", ...) with a vi.fn findHedges; import the mocked findHedges; cover the rejecting case (the NeonDbError scenario from the observed dev log) and the invalid / ok / no_cached_odds mappings.

Update src/components/finder/FinderForm.tsx:
- Add state actionError: string | null (initial null).
- Submit transition: const outcome = resolveFinderOutcome(await safeAction(() => findHedges(payload), "findHedges")). kind "invalid" → existing field-error loop unchanged. kind "error" → setActionError(outcome.message), setHasSearched(true), setResponse(null) (per project precedent WR-10 / WR-02b: never leave stakes from a different search next to an error; the form's typed values are untouched because they live in react-hook-form + persisted limit-hedge state), and do NOT update lastValidValues. kind "response" → setActionError(null), setLastValidValues(payload), setHasSearched(true), setResponse(outcome.response) (existing behavior).
- Recompute effect: same wrapping; "error" → setActionError(message) and setResponse(null); "response" → setActionError(null), setResponse(outcome.response); "invalid" → ignore as today. Keep the existing eslint-disable comment.
- Render: in the results region, after the showSkeleton branch and before the !hasSearched branch, add: actionError && !isPending → an Alert (variant="destructive", from @/components/ui/alert) containing the message text (use AlertDescription if exported, else plain text). Do not show a stack trace or the raw error. The alert disappears while a retry is pending (skeleton shows since response is null) and is cleared on the next successful search.
- Keep the docstring style: add a one-line comment referencing quick-260930-iaw explaining why the calls are wrapped (a thrown action inside startTransition otherwise escapes to the page and blanks the site).
- Do not change find-hedges.ts or FindHedgesResponse.
  </action>
  <verify>
    <automated>npx vitest run src/lib/safeAction.test.ts src/components/finder/finderSearchOutcome.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>Both findHedges calls in FinderForm go through safeAction; a rejected findHedges maps to the inline "Couldn't reach the database — try again." alert (proven by finderSearchOutcome.test.ts); tests pass and tsc reports 0 errors.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Root error boundary + guard Arbitrage/odds-refresh action calls</name>
  <files>src/app/error.tsx, src/app/error.test.ts, src/components/arb/ArbForm.tsx, src/components/finder/OddsStatusBar.tsx, src/components/finder/RefreshConfirmDialog.tsx, src/components/arb/SearchSpreadsTotalsDialog.tsx</files>
  <behavior>
    - renderToStaticMarkup(React.createElement(RouteError, { error: Object.assign(new Error("NeonDbError: secret-host.neon.tech password=x"), { digest: "123" }), retry: () => {} })) contains "Something went wrong" and "Try again"
    - the same markup does NOT contain the error message text ("secret-host", "NeonDbError") nor the word "stack"
  </behavior>
  <action>
Create src/app/error.tsx: "use client" first line; default export function RouteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) — use `retry` (stable in Next 16.3.x per node_modules/next docs; not `unstable_retry`). useEffect logs console.error(error) (dev visibility only). Render a centered, simple block matching the app's look (e.g. wrapper div with mx-auto w-full max-w-[1080px] px-4 py-16 flex flex-col items-start gap-4, as other screens use max-w-[1080px]): a heading "Something went wrong", a short muted paragraph "We couldn't load this page — usually a brief connection hiccup. Try again in a moment." and a Button (from @/components/ui/button) labeled "Try again" with onClick={() => retry()}. Never render error.message, error.stack or error.digest. No global-error.tsx (root layout does no data fetching — documented in a one-line comment in error.tsx).
Create src/app/error.test.ts per <behavior> using React.createElement + renderToStaticMarkup (precedent: src/app/settings-navigation.test.ts). useEffect does not run during static render, so no console spy is needed.

Guard the remaining un-caught action calls in the odds/arb surfaces with safeAction from src/lib/safeAction.ts (ACTION_FAILED_MESSAGE for the text):
- ArbForm.runFindArbs (auto-runs on mount, so a throw today blanks the Arbitrage tab): wrap findArbs; on { ok: false } — after the existing stale-request check (requestId !== requestIdRef.current → return) — setResponse(null) (WR-02b: no stale stakes next to an error) and surface ACTION_FAILED_MESSAGE inline. Reuse the existing error display the cheapest correct way: add a small loadError string state rendered as an Alert variant="destructive" where results would render (cleared on the next successful findArbs); do not stuff it into serverFieldError (that marks the stake field invalid).
- ArbForm.startSearch: wrap refreshSpreadsTotals({ confirmed: false }); on failure setSearchBanner({ kind: "error", message: ACTION_FAILED_MESSAGE }) and call router.refresh() only if the existing error path already does (mirror handleSearchOutcome's error branch).
- OddsStatusBar.startRefresh: wrap refreshOdds({ confirmed: false }); on failure setBanner({ kind: "error", message: ACTION_FAILED_MESSAGE }).
- RefreshConfirmDialog.confirmRefresh and SearchSpreadsTotalsDialog confirm handler: wrap the action; on failure call onOutcome({ status: "error", message: ACTION_FAILED_MESSAGE }) — confirm that the outcome union's "error" variant needs only status + message (adjust fields to satisfy the type if it has more; tsc is the check). This routes the failure into the parent's existing error banner so the dialog closes normally.
Do not change any action's server-side contract.
  </action>
  <verify>
    <automated>npx vitest run src/app/error.test.ts && npx tsc --noEmit</automated>
  </verify>
  <done>src/app/error.tsx exists using `retry`, renders a plain message + Try again button, and never leaks error details (test proves it); ArbForm's findArbs and search, OddsStatusBar refresh, and both confirm dialogs no longer let a thrown action escape; tsc 0 errors.</done>
</task>

<task type="auto">
  <name>Task 3: Guard promo/opportunity mark-done, undo, flag, dismiss, and review-queue action calls</name>
  <files>src/components/opportunities/MarkPairDoneButton.tsx, src/components/promos/DonePairRow.tsx, src/components/promos/MarkUsedButton.tsx, src/components/promos/FlagMatchButton.tsx, src/components/promos/DismissPromoDialog.tsx, src/components/promos/QueueItemCard.tsx, src/components/promos/ClassifyQueueCard.tsx</files>
  <action>
Apply the same safeAction pattern (src/lib/safeAction.ts) to every remaining server-action await inside startTransition in these files; each already has an inline message state, so the change is a few lines each and keeps the existing UI:
- MarkPairDoneButton.confirm: wrap markPairDoneAction; on failure setOpen(false) and setErrorMessage(ACTION_FAILED_MESSAGE) (it already has SAVE_FAILED_MESSAGE for the save_failed status — keep that for save_failed; use ACTION_FAILED_MESSAGE for a thrown call). Do not call onChanged on failure.
- DonePairRow.undo: wrap unmarkPairDoneAction; on failure setErrorMessage(ACTION_FAILED_MESSAGE).
- MarkUsedButton.run: wrap both unmarkPromoUsedAction and markPromoUsedAction; on failure setErrorMessage(ACTION_FAILED_MESSAGE) and return.
- FlagMatchButton.flagMatch: wrap flagPromoMatch; on failure setFlagMessage(ACTION_FAILED_MESSAGE).
- DismissPromoDialog.confirmDismiss: wrap dismissPromo; on failure call onOutcome({ status: "stale", message: ACTION_FAILED_MESSAGE }) — the parents' handleOutcome falls through to setMessage(outcome.message), matching how DeletePromoDialog/ExpirePromoDialog already synthesize an outcome in their catch. Add a one-line comment noting the synthesized status is only a carrier for the message.
- QueueItemCard: wrap confirmPromoMatch, correctPromoMatch and enterPromoCaps; on failure setMessage(ACTION_FAILED_MESSAGE) (do not call handleOutcome/onChanged).
- ClassifyQueueCard: wrap both classifyPromo calls; on failure setMessage(ACTION_FAILED_MESSAGE).
Use the label argument of safeAction as the action's function name (e.g. "markPairDoneAction") for console logs. Do not touch OpportunitiesScreen, PromosScreen, SignupOffersScreen, AddPromoForm, DeletePromoDialog, ExpirePromoDialog (already guarded) or auth/settings forms (out of this task's scope).
Then run the full suite, typecheck and lint.
  </action>
  <verify>
    <automated>npx vitest run && npx tsc --noEmit && npm run lint && ! grep -rnE "^\s*const outcome = await (markPairDoneAction|unmarkPairDoneAction|markPromoUsedAction|unmarkPromoUsedAction|flagPromoMatch|dismissPromo|confirmPromoMatch|correctPromoMatch|enterPromoCaps|classifyPromo|refreshOdds|refreshSpreadsTotals)\(" src/components</automated>
  </verify>
  <done>No component awaits one of those server actions outside safeAction (grep gate empty); full vitest suite passes; tsc 0 errors; lint clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| server action → browser | Errors thrown by server actions (DB driver errors) cross into client components and error boundaries |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-iaw-01 | Information disclosure | src/app/error.tsx, inline alerts | mitigate | Only fixed strings (ACTION_FAILED_MESSAGE, "Something went wrong") are rendered; error.message/stack/digest never rendered; error.test.ts asserts a secret-looking message is absent from markup |
| T-iaw-02 | Elevation of privilege | safeAction swallowing requireUser redirects | mitigate | safeAction rethrows Next control-flow errors (digest NEXT_REDIRECT / NEXT_HTTP_ERROR_FALLBACK) so auth redirects still fire; covered by safeAction.test.ts |
| T-iaw-03 | Denial of service | transient DB outage blanking the whole app | mitigate | Inline catches per call site + root error boundary with retry |
</threat_model>

<verification>
- npx vitest run (all green, including new safeAction, finderSearchOutcome, error tests)
- npx tsc --noEmit (0 errors)
- npm run lint (clean)
- No DB writes, migrations, or Odds API calls are made by this work or its tests.
</verification>

<success_criteria>
- A thrown findHedges shows "Couldn't reach the database — try again." inline in the finder, form values stay, next success clears it.
- Arbitrage, odds refresh, and promo/opportunity action buttons show inline errors instead of crashing.
- src/app/error.tsx catches anything else under / with a plain message and Try again (retry).
- findHedges and all other action return contracts unchanged.
</success_criteria>

<output>
Create `.planning/quick/260930-iaw-stop-db-hiccups-from-crashing-the-site/260930-iaw-SUMMARY.md` when done
</output>
