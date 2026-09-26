---
phase: 2
slug: private-access-my-books
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-26
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.2 (already configured) |
| **Config file** | `vitest.config.ts` — `include: ["src/**/*.test.ts"]`, `@` alias to `src/` |
| **Quick run command** | `npx vitest run <changed test file(s)>` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run <changed test file(s)>`
- **After every plan wave:** Run `npm test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

*Filled in by the planner/executor once task IDs exist. Requirement → test mapping from RESEARCH.md:*

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | DASH-04 | T-2-auth | Login rejects wrong password, locks after N failed attempts, accepts valid credentials; invite redemption rejects expired/used/invalid tokens | unit | `npx vitest run src/app/actions/login.test.ts src/app/actions/redeem-invite.test.ts` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | DASH-02 | — | Saved book selection (`user_books`) is returned unchanged on a subsequent read | unit | `npx vitest run src/db/queries.test.ts` | ✅ (new cases ❌ W0) | ⬜ pending |
| TBD | TBD | TBD | BONUS-02 | T-2-authz | `findHedges`/`findArbs` never return a leg at a book outside the session user's selected books; logged-out calls are rejected | unit | `npx vitest run src/app/actions/find-hedges.test.ts src/app/actions/find-arbs.test.ts` | ✅ (new cases ❌ W0) | ⬜ pending |
| TBD | TBD | TBD | CALC-06 | — | N/A | manual | — | — | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/actions/login.test.ts` — DASH-04 login success/failure/lockout
- [ ] `src/app/actions/redeem-invite.test.ts` — DASH-04 invite validation states
- [ ] `src/db/queries.test.ts` — extend with `getUserBookKeys` / `saveUserBooks` cases (DASH-02)
- [ ] `src/app/actions/find-hedges.test.ts`, `find-arbs.test.ts` — extend mocks to inject a session-scoped book set and a logged-out session (BONUS-02, D-20)

*No new test framework needed — Vitest + existing `vi.mock`/`vi.hoisted` pattern covers all automatable cases.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Finder shows the same account-risk advisory as the Arbitrage tab | CALC-06 | No component-render harness (RTL/jsdom) exists; adding one for a static string is disproportionate | Log in, open the bonus-bet finder, run a search, confirm the advisory Alert appears near hedge results with text identical to the Arbitrage tab |
| Unauthenticated page visits redirect to `/login` via `proxy.ts`; no signup path exists | DASH-04 | Requires running Next.js request pipeline | In a private window, visit `/`, `/settings`, `/arbitrage` → each redirects to `/login`; confirm no signup link/route |
| Book selection persists across sessions | DASH-02 | End-to-end cookie + DB round-trip | Select books in settings, log out, log back in, confirm selection unchanged and finder only shows those books |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
