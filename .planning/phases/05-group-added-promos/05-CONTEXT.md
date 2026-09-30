# Phase 5: Group-Added Promos - Context

**Gathered:** 2026-09-29
**Status:** Ready for planning

<domain>
## Phase Boundary

A member can hand-add a promo they see in their own sportsbook app (profit boost or bonus bet), and it immediately feeds their own Promos list and Opportunities screen with the same exact hedge math as scraped promos. They can edit, expire, or delete promos they added. Requirements: PROMO-01, PROMO-05, and PROMO-02 **as revised by the owner: added promos are personal only (no sharing)**.

Not in this phase: sharing added promos with the group, new promo types (second-chance, deposit match — out of scope), changes to scraping.

</domain>

<decisions>
## Implementation Decisions

### Scope change
- **D-01:** **No shared promos — added promos are personal only.** Owner: "no shared promos. just personal". A promo a member adds is visible only to that member (their Promos list, Opportunities, totals). No shared/private toggle. PROMO-02 is revised accordingly (REQUIREMENTS.md and ROADMAP.md updated 2026-09-29).

### Add promo form
- **D-02:** The **"Add promo" button lives at the top of Promos > Active**.
- **D-03:** **One screen whose fields change with the promo type.** Book + type (profit boost / bonus bet) at the top; only that type's fields show below.
- **D-04:** Game selection uses the **Phase 3 search/date-range picker (ScopePicker: "One game" search box or "All {league} games" with From/Through days)** — never a long dropdown (owner feedback 2026-09-29, quick task 260929-hht). Roadmap success criterion 1's "dropdown" wording is superseded.
- **D-05:** **Profit boost required fields: book, boost % *or* boosted odds, game(s), max stake.** Optional: max winnings (with its kind), min odds, market/side pin, expiry. Expiry defaults to the start of the last game in scope. (No boost goes live without a max stake — same rule as scraped boosts, CR-04.)
- **D-06:** **Boost % or boosted odds — either one**, via a toggle ("Boost %" / "Boosted odds"); the profit-boost engine already handles both.
- **D-07:** **Bonus bet required fields: book, amount, expiry.** Game/league/date range optional (unrestricted means the app picks the best conversion across cached games); optional min odds.
- **D-08:** **Only the member's own books** appear in the book list.
- **D-09:** **Live immediately on save** — no review queue for hand-added promos (a boost still needs max stake, enforced by D-05).

### Edit / expire / delete (Claude's defaults, owner accepted)
- **D-10:** Only the member who added a promo can edit, expire, or delete it (only they can see it — D-01). Changes show in Promos and Opportunities immediately.
- **D-11:** **Deleting a promo that was already marked done keeps its Done entry and profit** in Total profit extracted (the Done snapshot is self-contained); deletion must not cascade away completion history.

### Duplicates with scraped promos (Claude's defaults, owner accepted)
- **D-12:** A hand-added promo stays **separate** from scraped promos — never merged. When the form can see an obvious match (same book + type + amount/boost % + overlapping scope among the member's visible scraped promos), it shows a small non-blocking note: "This looks like a promo already in your list."

### Claude's Discretion
- Exact form layout, validation messages, how added promos are marked in lists (e.g. a small "Added by you" tag), edit flow (same form prefilled), expire vs delete controls, empty/error states — follow 03-UI-SPEC / 04-UI-SPEC patterns and plain-English copy.
- Data model for ownership (e.g. `added_by_user_id` / source on `promos`, or a separate table) — research/planning decides; if the schema changes, a drizzle migration is required, and applying it to the live Neon database needs the owner's explicit OK at execution time (a blocking, non-autonomous task).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Scope & requirements
- `.planning/ROADMAP.md` §Phase 5 — goal and success criteria (criterion 1 "dropdown" superseded by D-04; criterion 2 sharing superseded by D-01)
- `.planning/REQUIREMENTS.md` — PROMO-01, PROMO-02 (revised), PROMO-05
- `.planning/PROJECT.md` — correctness-to-the-cent constraint, private small group

### Prior decisions & contracts
- `.planning/phases/03-promo-scraping-review/03-CONTEXT.md`, `03-UI-SPEC.md` — promo model, caps, CR-04 max-stake rule, review/correction flows
- `.planning/phases/04-opportunities-feed/04-CONTEXT.md`, `04-UI-SPEC.md` — Opportunities sources, book filtering (D-16..D-18), mark-done/pairs, tabs
- `.planning/quick/260929-hht-review-game-picker-searchable-multi-game/260929-hht-PLAN.md` + SUMMARY — ScopePicker (search + league date range) to reuse
- `.planning/quick/260929-gcn-multi-day-promo-windows-fanduel-date-par/260929-gcn-SUMMARY.md` — multi-day sport_window + etEndDate
- `.planning/quick/260929-igk-mark-done-snapshots-promo-done-tab-total/260929-igk-SUMMARY.md` — Done snapshots (D-11 must preserve them)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/promos/ScopePicker.tsx`, `src/domain/promos/scopeDraft.ts`, `gameSearch.ts`, `correctionOptions.ts` — game search + league/date range, payload builders.
- `src/domain/promos/memberScope.ts` (`resolveMemberScope`: event | sport_day with etEndDate, server-side validation).
- `src/app/actions/enter-promo-caps.ts`, `correct-promo-match.ts`, `reviewInput.ts` — zod input + cap validation patterns for member-entered numbers.
- `src/domain/hedge/profitBoost.ts`, `bonusBet.ts`, `src/domain/promos/rankPromoHedges.ts` — math already supports boost % and published boosted price, caps, min odds.
- `src/app/actions/get-promos.ts`, `get-opportunities.ts`, `src/db/feedContext.ts` — where member-visible promos are loaded; added promos must join these for their owner only.

### Established Patterns
- `promos` rows are scrape-shaped today (`source_url` NOT NULL, `dedupe_key`, scrape lifecycle); hand-added promos need an owner and must not be touched by the scrape lifecycle (expiry/refresh/dedupe).
- `requireUser()` first; per-user data filtered by session user id; decimal.js for money; strict zod inputs without userId.
- Opportunities/Promos only show the member's own books.

### Integration Points
- Promos > Active header (Add promo button + form), promo row actions (edit / expire / delete for own added promos), getPromos / getOpportunities visibility filter, Done snapshots on delete.

</code_context>

<specifics>
## Specific Ideas

- Owner wants hand-adding to cover promos the scrapers miss (app-only / logged-in promos), for themselves.
- Game picking must be quick on a phone: search a team, or pick a league and a date range.

</specifics>

<deferred>
## Deferred Ideas

- **Sharing added promos with the group** (original PROMO-02 shared/private) — dropped by owner for now; could return as a later phase.
- Carried from Phase 4: Kalshi/Polymarket source (out of scope), scheduled scrape fix (infrastructure open item), Phase 4 code-review warnings WR-01..WR-04 (`/gsd-code-review 4 --fix`).

</deferred>

---

*Phase: 05-group-added-promos*
*Context gathered: 2026-09-29*
