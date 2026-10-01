---
phase: 05-group-added-promos
verified: 2026-09-30T00:00:00Z
status: passed
score: 3/3 must-haves verified (automated); 2/2 human checks passed (05-HUMAN-UAT.md, 2026-10-01)
overrides_applied: 0
human_verification:
  - test: "Sign in as two different members. Member A adds a promo. Check Promos list and Opportunities feed as Member B."
    expected: "Member B never sees A's promo (list, feed, Done rows, counts); A sees it with 'Added by you' badge."
    why_human: "No two-session test infra; SQL visibility logic verified by code/unit tests only."
  - test: "Use add/edit/expire/delete form and row actions at phone width (about 375px)."
    expected: "Form, ScopePicker, dialogs and row actions are usable; expire/delete/edit update the feed immediately after action."
    why_human: "No DOM test infra; layout and revalidation feel are visual."
---

# Phase 5: Group-added promos Verification Report

**Goal:** Any member can hand-add a promo and manage the ones they added (personal only), feeding the same opportunities feed.
**Status:** human_needed (all automated checks pass)
**Re-verification:** No

## Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Member can add a promo (book, type, boost %/boosted price, market, max stake, max winnings, expiry) by picking real upcoming games; appears in Promos list and feed | VERIFIED | `src/app/actions/add-promo.ts` (requireUser first, owner = session userId, per-user cap, revalidatePath("/")); `buildAddedPromo.ts` inserts status active, autoMatched false, addedByUserId; `BonusBetFields`/`BoostFields` include ScopePicker, ExpiryField, maxStake, maxWinnings(+kind); `PromosScreen` mounts `AddPromoForm`; feed reads via `getActivePromos(now, userId)` in `feedContext.ts`, `get-promos.ts`, `get-add-promo-options.ts`. |
| 2 | A promo a user adds is visible only to them | VERIFIED (code) / human for two-session | `promoVisibilityCondition` in `src/db/promos.ts`: viewer undefined gives scraped only (secure default), else null OR own id; included in `activePromoWhere` and `getProfitObservationsSince`. Every non-test caller of `getActivePromos` passes a userId, except `promoObservations.ts` (defaults to scraped-only, safe). Migration 0010 adds `added_by_user_id` FK and index; owner confirmed applied to Neon. Review/flag actions gated on status pending_review or auto_matched=true, so cannot touch added promos. |
| 3 | User can edit, expire, delete their own promos; change reflected immediately | VERIFIED | `edit-promo.ts`, `expire-promo.ts`, `delete-promo.ts`: requireUser first, userId never from input, each calls `revalidatePath("/")`. `addedPromos.ts`: ownership (`added_by_user_id`) in every WHERE (update/expire/soft-delete/prefill); delete is soft (`status='deleted'`, completions survive) plus scoped observation cleanup; edit locks book/type and drops id/dedupeKey/owner/status. `AddedPromoActions` wired in `PromoRow`. |

**Score:** 3/3

## Requirements Coverage

| Requirement | Source Plans | Status | Evidence |
|---|---|---|---|
| PROMO-01 | 05-01, 03, 04, 05, 06, 10 | SATISFIED | Truth 1 |
| PROMO-02 | 05-01, 02, 03 | SATISFIED | Truth 2 (personal-only per revised 2026-09-29 wording) |
| PROMO-05 | 05-07, 08, 09 | SATISFIED | Truth 3 |

All three phase IDs appear in plan frontmatter and REQUIREMENTS.md. No orphaned requirements. (REQUIREMENTS.md checkboxes/traceability still read Pending; update on phase close.)

## Behavioral Spot-Checks

| Check | Result |
|---|---|
| `npx vitest run` | 90 files / 1353 tests pass (re-run) |
| Build/typecheck/lint | Reported exit 0 by orchestrator (not re-run) |
| Live DB column | Reported `db:check` ok by orchestrator (not re-run) |

## Anti-Patterns

No TBD/FIXME/XXX found in phase-touched files. Known deviations (A3 boosted-odds needs one game + side pin; <=$0.02 rounding difference; empty-state "Add it yourself" line in all variants) accepted per orchestrator, non-blocking.

## Gaps Summary

None. Only the two human checks above remain (two-session cross-user invisibility; phone-width UI).

_Verifier: Claude (gsd-verifier)_
