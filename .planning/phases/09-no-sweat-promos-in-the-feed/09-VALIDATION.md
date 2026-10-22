---
phase: 9
slug: no-sweat-promos-in-the-feed
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-10-22
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (node env, alias `@`) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run <touched test file(s)>` (+ `npm run typecheck` when types/switches change) |
| **Full suite command** | `npm test && npm run typecheck && npm run lint` |
| **Estimated runtime** | ~60 seconds |

---

## Sampling Rate

- **After every task commit:** Run the touched test file(s) via `npx vitest run <path>`, plus `npm run typecheck` when promo types or switches change
- **After every plan wave:** Run `npm test && npm run typecheck`
- **Before `/gsd:verify-work`:** Full suite + typecheck + lint must be green, including the four FEED-04 "estimates never leak" invariants
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Requirement-level map from `09-RESEARCH.md` § Validation Architecture. The planner assigns task IDs.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | 2 | FEED-01 | — | N/A | unit (fixture) | `npx vitest run src/ingestion/promos/books/draftkings.test.ts` | ❌ W0 fixture | ⬜ pending |
| TBD | TBD | 1 | FEED-01 | — | N/A | table-driven unit | `npx vitest run src/ingestion/promos/exclusions.test.ts src/ingestion/promos/noSweat.test.ts src/ingestion/promos/signupOffers.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 0 | FEED-01 | — | N/A | fixture-sweep snapshot | `npx vitest run src/ingestion/promos/exclusions.fixtures.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | FEED-02 | — | Disagreement → review at all confidence levels | unit | `npx vitest run src/ingestion/promos/reconcile.test.ts src/ingestion/promos/promoReading.test.ts src/ingestion/promos/verbatimGuard.test.ts src/ingestion/promos/readerPass.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | 0 | FEED-02 | — | no_sweat never reaches guaranteed ranking | unit + typecheck | `npx vitest run src/db/promos.test.ts && npm run typecheck` | ✅ extend | ⬜ pending |
| TBD | TBD | 4 | FEED-02 | — | Dry-run writes nothing | unit | `npx vitest run scripts/audit-no-sweat.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | FEED-03 | — | N/A | table-driven unit | `npx vitest run src/domain/promos/rankNoSweatFeed.test.ts src/domain/promos/rankNoSweat.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| TBD | TBD | 2 | FEED-03 | — | N/A | integration (mocked db) | `npx vitest run src/app/actions/get-opportunities.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | 4 | FEED-04 | — | Estimates never leak | integration/unit | `npx vitest run src/app/actions/get-opportunities.test.ts src/db/memberFeedRecording.test.ts src/db/memberObservations.test.ts src/db/promoObservations.test.ts src/db/profitHistory.test.ts src/domain/promos/pairPromos.test.ts src/domain/promos/dashboardTotals.test.ts src/domain/promos/profitSeries.test.ts` | ✅ extend / ❌ W0 | ⬜ pending |
| TBD | TBD | 2 | FEED-05 | — | Owner-scoped, server recompute, settle from snapshot only | action test | `npx vitest run src/app/actions/track-no-sweat.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | 1 | FEED-05 | — | N/A | table-driven unit | `npx vitest run src/domain/promos/noSweatSettle.test.ts src/domain/promos/doneSnapshot.test.ts src/db/promoTracking.test.ts src/domain/hedge/conversionRate.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| TBD | TBD | 2 | D-21 | — | Strict schema, owner-scoped | unit | `npx vitest run src/app/actions/set-low-profile.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/ingestion/promos/noSweat.test.ts` — detector order, widened wording, cash detection, parlay-first
- [ ] `src/ingestion/promos/exclusions.fixtures.test.ts` — expected reason map generated BEFORE changing the first-bet regex
- [ ] DraftKings no-sweat fixture (live fetch or labelled reconstruction) under `src/test/fixtures/promos/`
- [ ] `src/domain/promos/rankNoSweatFeed.test.ts`, `noSweatSettle.test.ts`, `noSweatSnapshot.test.ts`
- [ ] `src/app/actions/track-no-sweat.test.ts`, `set-low-profile.test.ts`
- [ ] `scripts/audit-no-sweat.test.ts`
- [ ] Update mocks in `get-opportunities.test.ts`, `get-promos.test.ts`, `refresh-*.test.ts` for new `@/db/*` exports
- [ ] Shared test builders for `ActiveNoSweatPromo` and a tracked snapshot

No new framework install needed.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| FanDuel / Bally live no-sweat wording | FEED-01 | Depends on live sites; no fixtures yet | Recon task saves fixtures + note; if none found, disclose "fixture pending" in verification |
| Track → Bet won / Bet lost / Push flow on phone | FEED-05 | End-to-end UI across game start time | Owner tracks a real no-sweat, settles after kickoff, checks green line updates on settle day |
| "est." label, rate, worst case and low-profile warnings readable on iPhone | FEED-03, D-20..D-22 | Visual | Owner iPhone check of the Opportunities feed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
