---
phase: 2
slug: private-access-my-books
status: complete
nyquist_compliant: true
wave_0_complete: true
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
| 02-01-T1 | 02-01 | 1 | DASH-04 | T-02-01, T-02-02 | Invite redemption rejects expired/used/malformed tokens with one generic message; concurrent double-redemption of one invite creates at most one account | unit | `npx vitest run src/app/actions/redeem-invite.test.ts` | ✅ | ✅ green |
| 02-01-T2 | 02-01 | 1 | DASH-04 | T-02-04, T-02-05, T-02-07 | Session cookie is sealed (encrypted+signed) with a >=32-char secret; invite tokens are stored only as a SHA-256 hash with a 7-day expiry | unit | `npx vitest run src/lib/session.test.ts src/lib/auth/inviteToken.test.ts` | ✅ | ✅ green |
| 02-02-T1/T2 | 02-02 | 2 | DASH-04 | T-02-09, T-02-10 | Login rejects wrong password, locks after 5 failed attempts for 15 minutes, accepts valid credentials; unknown-email and wrong-password attempts return the identical generic error | unit | `npx vitest run src/app/actions/login.test.ts src/lib/auth/lockout.test.ts` | ✅ | ✅ green |
| 02-03-T1 | 02-03 | 2 | DASH-04 | T-02-16 | `refreshOdds`/`refreshSpreadsTotals` reject a logged-out caller via `requireUser()` before any lock, API, or credit-spend call | unit | `npx vitest run src/app/actions/refresh-odds.test.ts src/app/actions/refresh-spreads-totals.test.ts` | ✅ | ✅ green |
| 02-04-T1/T2 | 02-04 | 3 | DASH-02 | T-02-21, T-02-22 | Saved book selection (`user_books`) is returned unchanged on a subsequent read; `saveBooks` rejects empty/unknown/unusable book keys and scopes strictly to the session user | unit | `npx vitest run src/db/queries.test.ts src/app/actions/save-books.test.ts` | ✅ | ✅ green |
| 02-05-T1/T2 | 02-05 | 4 | BONUS-02 | T-02-26, T-02-27, T-02-28 | `findHedges`/`findArbs` never return a leg (or arb "Multiple books" tie entry) at a book outside the session user's selected books; logged-out calls are rejected before any cache read | unit | `npx vitest run src/app/actions/find-hedges.test.ts src/app/actions/find-arbs.test.ts` | ✅ | ✅ green |
| 02-03-T3 | 02-03 | 2 | CALC-06 | — | The bonus-bet finder renders the same account-risk advisory copy as the Arbitrage tab, from one shared component (`RiskAdvisory.tsx`), not two duplicated copies | grep + manual | `grep -rl "known pattern sportsbooks use to detect" src` (confirms single source: `src/components/RiskAdvisory.tsx`); owner walkthrough step 4 confirms the rendered result | ✅ (grep green) | ✅ green (owner walkthrough approved 2026-09-26) |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/app/actions/login.test.ts` — DASH-04 login success/failure/lockout
- [x] `src/app/actions/redeem-invite.test.ts` — DASH-04 invite validation states
- [x] `src/db/queries.test.ts` — extend with `getUserBookKeys` / `saveUserBooks` cases (DASH-02)
- [x] `src/app/actions/find-hedges.test.ts`, `find-arbs.test.ts` — extend mocks to inject a session-scoped book set and a logged-out session (BONUS-02, D-20)

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

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [x] Feedback latency < 30s
- [x] `nyquist_compliant: true` set in frontmatter

**Automated gate (2026-09-26):** `npm test` (272/272 passed), `npm run typecheck`, `npm run lint`, `npm run build`, `npm run db:check` all exit 0 on the live Neon database.

**Approval:** approved 2026-09-26 (owner walkthrough)
