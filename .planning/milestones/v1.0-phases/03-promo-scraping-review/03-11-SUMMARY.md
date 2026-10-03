---
phase: 03-promo-scraping-review
plan: 11
subsystem: infra
tags: [go-live, github-actions, neon, walkthrough, checkpoint]

# Dependency graph
requires:
  - phase: 03-promo-scraping-review
    provides: "03-01..03-10, 03-12..03-15: scrapers, matcher, review queue, cap entry, flag-back, active promo hedges"
provides:
  - "Live repo btorio15/promoprofit (main) with the Scrape promos workflow active"
  - "Actions secrets DATABASE_URL, ODDS_API_KEY, ANTHROPIC_API_KEY set (values never printed)"
  - "Green workflow_dispatch runs writing one scrape_runs row per book (ballybet, draftkings, fanduel) to Neon from CI"
  - "Owner walkthrough sign-off (conditional — see Deviations)"
affects: [04-opportunities-feed, 05-group-added-promos]

tech-stack:
  added: []
  patterns: []

key-files:
  created: []
  modified:
    - .github/workflows/scrape-promos.yml

key-decisions:
  - "Owner approved the walkthrough as 'approved, queue steps later': review-queue steps are checked against the next scrape that queues a promo (the plan's allowed conditional approval for steps with no data)"
  - "Cron is plain UTC `7 14,18,23 * * *` (8:07am/12:07pm/5:07pm MDT); the timezone key and cron-minute reshuffles are not retried"

requirements-completed: [CALC-02, CALC-03, PROMO-04]
requirements-pending: [PROMO-03]

# Metrics
duration: multi-session (2026-09-27 .. 2026-09-29)
completed: 2026-09-29
---

# Phase 3 Plan 11: Go Live Summary

**Scraper live on GitHub Actions via manual dispatch, writing to Neon for all three books; owner walkthrough approved with review-queue steps deferred; scheduled (cron) runs still never fire.**

## Task 1 — Approve push + DATABASE_URL secret
Approved by the owner. Repo `btorio15/promoprofit` (public), default branch `main`.

## Task 2 — Secrets, push, dispatch, verify CI writes
- Secrets set: `DATABASE_URL`, `ODDS_API_KEY`, `ANTHROPIC_API_KEY`.
- Manual `workflow_dispatch` runs are green and write a `scrape_runs` row per book. Most recent: run 36605865367 (2026-09-29 17:34 UTC, 1m4s) — ballybet ok (19 found), draftkings ok (21 found, 2 kept), fanduel ok (12 found, 1 kept, 1 to review); morning odds refresh spent 4 credits (395 remaining).
- **Scheduled runs: never fired.** `gh api repos/btorio15/promoprofit/actions/runs?event=schedule` → `total_count: 0` as of 2026-09-29 18:56 UTC. Tried: `timezone: America/Denver` + `0 8,12,17`; then `7 8,12,17`; then plain UTC `7 14,18,23` (pushed 2026-09-29 01:47 UTC — the 14:07 and 18:07 UTC slots both passed with no run); then disabling and re-enabling the workflow at 17:32 UTC to force re-registration (18:07 slot still did not fire). Commits are linked to the `btorio15` account, Actions is enabled, workflow state is `active`. No run is created at all (not even a skipped one), so this is scheduler registration on GitHub's side, not the job.

## Task 3 — Owner end-to-end walkthrough
Owner reply (2026-09-29): **"approved, queue steps later"**.
- Checked live: scrape freshness lines, active promo feed and total, boost row detail (scope, best-of-N, opt-in hint, min odds, cap note), stake-precision toggle, Mark used / Undo, other-book dimming, Confirmed/Corrected-by attribution, Sign-up offers tab.
- Deferred (queue was empty at walkthrough time): Confirm, Correct, Enter cap details, Dismiss, "Needs a look" classify card, Auto-matched flag-back. To be checked on the next scrape that queues a promo.

## Deviations / walkthrough findings fixed during the checkpoint
- **260929-gcn** — FanDuel "any NHL Games on September 29th and September 30th" was not turned into a window, and the review Correct flow only allowed one day, so promo 14 lost its Sept 30 games. Fixed: multi-date FanDuel windows + review "Through" day. Promo 14's window extended by hand (owner-approved) to 2026-10-01T03:59:59.999Z.
- **260929-hht** — Owner: the review "find a game" control was one mile-long dropdown. Replaced with a two-mode picker: team-name search for one game, league + From/Through date range. UI-only, server contract unchanged. Phone check pending with the deferred queue steps.
- FanDuel max wagers ("up to a maximum wager. Log in for more details.") are only visible logged in — cap entry by a member remains the designed path (CR-04 unchanged).

## Open items
- PROMO-03 "on a schedule": pending until a `schedule` event run exists. Per the handoff, next escalation is GitHub support or an external trigger of `workflow_dispatch` — do not reshuffle cron again.
- Deferred walkthrough steps (above) on the next queued promo.
- Phase 5 note: roadmap success criterion 1 says "picking a real upcoming event from a dropdown" — use the 260929-hht search/date-range picker instead.
