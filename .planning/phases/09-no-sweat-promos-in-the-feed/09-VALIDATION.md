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

Per-task map for plans 09-01 .. 09-20.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 09-01-T1/T2 | 09-01 | 1 | FEED-02, FEED-04 | T-09-01 | no_sweat never reaches guaranteed ranking | unit + typecheck | `npx vitest run src/domain/promos/types.test.ts src/db/promos.test.ts && npm run typecheck` | ❌ W0 types.test / ✅ extend | ⬜ pending |
| 09-01-T3 | 09-01 | 1 | FEED-04 | T-09-03 | Stats queries exclude no_sweat | unit | `npx vitest run src/db/profitHistory.test.ts src/domain/stats/dailyHistory.test.ts` | ✅ extend | ⬜ pending |
| 09-02-T1/T2 | 09-02 | 1 | FEED-05, D-21 | T-09-04..07 | Owner-scoped rows, schema-validated snapshots, missing-table degrade | unit | `npx vitest run src/domain/promos/noSweatSnapshot.test.ts src/domain/promos/lowProfile.test.ts src/db/trackedNoSweats.test.ts src/db/lowProfile.test.ts` | ❌ W0 | ⬜ pending |
| 09-02-T3 | 09-02 | 1 | FEED-05 | T-09-08 | [BLOCKING] migration applied with owner OK | CLI | `npm run db:check` | n/a | ⬜ pending |
| 09-03-T1 | 09-03 | 1 | FEED-01 | T-09-11 | new_customer set unchanged | fixture-sweep snapshot | `npx vitest run src/ingestion/promos/exclusions.fixtures.test.ts` | ❌ W0 | ⬜ pending |
| 09-03-T2/T3 | 09-03 | 1 | FEED-01 | T-09-09 | Exclusions first; cash flagged | table-driven unit | `npx vitest run src/ingestion/promos/noSweat.test.ts src/ingestion/promos/exclusions.test.ts src/ingestion/promos/signupOffers.test.ts src/ingestion/promos/books/draftkings.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| 09-04-T1/T2 | 09-04 | 1 | FEED-01 | T-09-12/13 | Public requests only, sanitised fixtures | CLI | `npx tsx scripts/recon-no-sweat.ts` | n/a (manual-ish recon) | ⬜ pending |
| 09-05-T1/T2 | 09-05 | 2 | FEED-02, FEED-04 | T-09-15/16 | Pairs and v1 snapshots never accept no_sweat | unit + typecheck | `npx vitest run src/domain/promos/promoTypeLabel.test.ts src/domain/promos/pairPromos.test.ts src/domain/promos/doneSnapshot.test.ts && npm run typecheck` | ❌ W0 / ✅ extend | ⬜ pending |
| 09-06-T1..T3 | 09-06 | 2 | FEED-03 | T-09-17..19 | Decimal odds compare; estimates labelled | table-driven unit | `npx vitest run src/domain/promos/rankNoSweat.test.ts src/domain/promos/rankNoSweatFeed.test.ts src/domain/promos/noSweatRowDto.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| 09-07-T1 | 09-07 | 2 | FEED-05 | T-09-20/21 | Bounded overrides; refund = min(stake, cap) | TDD unit | `npx vitest run src/domain/promos/noSweatSettle.test.ts src/domain/hedge/conversionRate.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| 09-08-T1..T3 | 09-08 | 2 | FEED-01, FEED-02 | T-09-22..25 | Disagreement -> review at all confidence levels; budget | unit | `npx vitest run src/ingestion/promos/reconcile.test.ts src/ingestion/promos/promoReading.test.ts src/ingestion/promos/verbatimGuard.test.ts src/ingestion/promos/readerPass.test.ts src/ingestion/promos/reviewTriage.test.ts src/domain/promos/scraped.test.ts` | ✅ extend | ⬜ pending |
| 09-20-T1 | 09-20 | 2 | FEED-03 | T-09-55/56 | Refresh covers no-sweat sports only | unit | `npx vitest run src/domain/promos/promoRefreshScope.test.ts src/app/actions/refresh-promos.test.ts` | ✅ extend | ⬜ pending |
| 09-09-T1/T2 | 09-09 | 3 | FEED-02 (D-18) | T-09-26..28 | Dry-run writes nothing; hand-added untouched | unit | `npx vitest run src/ingestion/promos/noSweatAudit.test.ts` | ❌ W0 | ⬜ pending |
| 09-10-T1/T2 | 09-10 | 3 | FEED-01, FEED-02 | T-09-29/30 | N/A | unit (fixture) | `npx vitest run src/ingestion/promos/books/draftkings.test.ts` | ✅ extend + fixture | ⬜ pending |
| 09-11-T1/T2 | 09-11 | 3 | FEED-01 | T-09-31..33 | N/A | unit (fixture or SYNTHETIC) | `npx vitest run src/ingestion/promos/books/fanduel.test.ts src/ingestion/promos/books/ballybet.test.ts` | ✅ extend | ⬜ pending |
| 09-12-T1..T3 | 09-12 | 3 | FEED-03, FEED-04 | T-09-34..36 | Estimates never leak (deep-equal invariant) | integration (mocked db) | `npx vitest run src/domain/promos/trackedCardDto.test.ts src/db/noSweatFeed.test.ts src/app/actions/get-opportunities.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| 09-13-T1/T2 | 09-13 | 3 | FEED-03 | T-09-37/38 | Whole-cent caps; tracked/done guard | unit | `npx vitest run src/domain/promos/addedPromoInput.test.ts src/domain/promos/buildAddedPromo.test.ts src/app/actions src/db/addedPromos.test.ts` | ✅ extend | ⬜ pending |
| 09-19-T1/T2 | 09-19 | 3 | FEED-02 | T-09-39 | Strict classify schema | unit | `npx vitest run src/domain/promos/reviewInput.test.ts src/db/promoReview.test.ts` | ❌ W0 / ✅ extend | ⬜ pending |
| 09-14-T1..T3 | 09-14 | 4 | FEED-05, D-21 | T-09-40..44 | Owner-scoped, server recompute, settle from snapshot only | action test | `npx vitest run src/app/actions/track-no-sweat.test.ts src/app/actions/set-low-profile.test.ts src/domain/promos/doneSnapshot.test.ts src/domain/promos/buildTrackedSnapshot.test.ts` | ❌ W0 | ⬜ pending |
| 09-15-T1/T2 | 09-15 | 5 | FEED-03, D-20, D-22 | T-09-45..47 | Estimates never green; risk copy policy | unit + lint | `npx vitest run src/components/promos/noSweatRowView.test.ts && npm run typecheck && npm run lint` | ❌ W0 | ⬜ pending |
| 09-17-T1..T3 | 09-17 | 5 | FEED-03, FEED-02 | T-09-50 | Server re-validates | typecheck + lint | `npm run typecheck && npm run lint` | n/a | ⬜ pending |
| 09-16-T1/T2 | 09-16 | 6 | FEED-05 | T-09-48/49 | Buttons gated by server pastKickoff | unit + lint | `npx vitest run src/components/opportunities/trackedCardView.test.ts && npm run typecheck && npm run lint` | ❌ W0 | ⬜ pending |
| 09-18-T1/T2 | 09-18 | 7 | FEED-01..05 | T-09-52/53 | Owner-approved backfill; phone check | full suite + manual | `npm test && npm run typecheck && npm run lint` | n/a | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/ingestion/promos/noSweat.test.ts` — detector order, widened wording, cash detection, parlay-first
- [ ] `src/ingestion/promos/exclusions.fixtures.test.ts` — expected reason map generated BEFORE changing the first-bet regex
- [ ] DraftKings no-sweat fixture (live fetch or labelled reconstruction) under `src/test/fixtures/promos/`
- [ ] `src/domain/promos/rankNoSweatFeed.test.ts`, `noSweatSettle.test.ts`, `noSweatSnapshot.test.ts`
- [ ] `src/app/actions/track-no-sweat.test.ts`, `set-low-profile.test.ts`
- [ ] `src/ingestion/promos/noSweatAudit.test.ts`
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
