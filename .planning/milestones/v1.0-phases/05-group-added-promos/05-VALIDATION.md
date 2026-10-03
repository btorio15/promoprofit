---
phase: 5
slug: group-added-promos
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-29
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^5.0.2 (node environment, no DOM) |
| **Config file** | `vitest.config.ts` (`include: src/**/*.test.ts`, `@` alias) |
| **Quick run command** | `npx vitest run <path/to/file.test.ts>` |
| **Full suite command** | `npm test && npm run typecheck && npm run lint` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <touched test files>`
- **After every plan wave:** Run `npm test && npm run typecheck && npm run lint`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

Task IDs are assigned by the planner; each row below must be claimed by at least one task's `<automated>` verify.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | PROMO-01 | T-5-input | Strict schema, no userId field; book must be one of the user's books | unit | `npx vitest run src/domain/promos/addedPromoInput.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PROMO-01 | — | N/A | unit | `npx vitest run src/domain/promos/buildAddedPromo.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PROMO-01 | T-5-input | `requireUser()` first; insert uses session user as owner | unit (mocked db) | `npx vitest run src/app/actions/add-promo.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PROMO-01 | — | N/A | unit | `npx vitest run src/domain/promos/rankPromoHedges.test.ts src/domain/promos/scope.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | PROMO-02 | T-5-visibility | No viewer → scraped only; viewer sees own added promos, never another member's | unit | `npx vitest run src/db/promos.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PROMO-02 | T-5-visibility | Feed/promos/member state pass session user id | unit | `npx vitest run src/app/actions/get-promos.test.ts src/app/actions/get-opportunities.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | PROMO-02 | T-5-visibility | Others' added-promo observations excluded from available profit | unit | `npx vitest run src/db/promoTracking.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | PROMO-02 | — | Scraper expire-unseen never touches added promos | unit | ingestion store regression test | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PROMO-05 | T-5-idor | Ownership in UPDATE WHERE; other user → generic not found; soft delete | unit (mocked db) | `npx vitest run src/app/actions/added-promo-actions.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | PROMO-05 | — | Delete keeps Done row and extracted profit | unit | `npx vitest run src/domain/promos/doneSnapshot.test.ts` | ✅ extend | ⬜ pending |
| TBD | TBD | TBD | D-12 | — | Duplicate hint never blocks | unit | `npx vitest run src/domain/promos/duplicateHint.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | Schema | — | N/A | static | `npm run typecheck` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/domain/promos/addedPromoInput.test.ts` — PROMO-01 input schema
- [ ] `src/domain/promos/buildAddedPromo.test.ts` — PROMO-01 row builder
- [ ] `src/domain/promos/duplicateHint.test.ts` — D-12
- [ ] `src/db/promos.test.ts` — PROMO-02 visibility predicate (or pure helper)
- [ ] `src/app/actions/add-promo.test.ts` — PROMO-01 action
- [ ] `src/app/actions/added-promo-actions.test.ts` — PROMO-05 edit/expire/delete
- [ ] Ingestion store regression test — expire-unseen excludes added promos

*Framework install: none needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Migration `drizzle/0010_*.sql` is additive and applied | PROMO-02 | Touches the live Neon DB; needs owner OK | Inspect SQL, owner approves, `npm run db:migrate`, then `npm run db:check` |
| Add/edit form, "Added by you" badge, Expire/Delete dialogs match UI-SPEC | PROMO-01, PROMO-05 | No DOM test infra | At phone width (360px): add a boost and a bonus bet, confirm they appear in Promos and Opportunities; edit, expire, delete one each |
| Another member cannot see your added promo | PROMO-02 | Needs two real sessions | Log in as a second user, confirm the promo is absent from Promos and Opportunities |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
