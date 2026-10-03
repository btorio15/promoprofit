---
phase: 5
slug: group-added-promos
status: verified
threats_open: 0
asvs_level: 1
created: 2026-09-30
---

# Phase 5 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| Browser → server actions | add/edit/expire/delete/mark-used promo actions receive member-supplied input | promo terms (book, type, amounts, scope, pin, expiry); untrusted |
| Member ↔ member | added promos are private to their creator; feeds, totals and Done are per-viewer | promo rows, profit observations, completions; private per member |
| Scraper job → promos table | scheduled expire-unseen must not touch member-added promos | promo status |
| App → live Neon DB | migration 0010 and DATABASE_URL | schema; credential (secret) |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-5-visibility | Information disclosure | getActivePromos + all callers, getPromoCompletions, duplicateCandidates | mitigate | `promoVisibilityCondition` in SQL WHERE (src/db/promos.ts:257-276), no viewer → `isNull(addedByUserId)`; every caller passes session user id (get-promos.ts:114,116; get-add-promo-options.ts:40; refresh-spreads-totals.ts:51,61; feedContext.ts:72-73; memberPromoState.ts:43); completions filtered by userId (promoTracking.ts:28-50); duplicates filter `!addedByYou` + own books | closed |
| T-5-01 | Information disclosure | schema FK on user deletion | mitigate | `onDelete: "cascade"` (schema.ts:245; drizzle/0010_added_promos.sql:2) | closed |
| T-5-02 | Tampering / DoS | scraper expire-unseen | mitigate | `isNull(promos.addedByUserId)` in buildExpireUnseenStatement (store.ts:554); regression test passes | closed |
| T-5-03 | Tampering | migration 0010 on live Neon | mitigate | additive-only SQL (ADD COLUMN / CONSTRAINT / CREATE INDEX); applied to live Neon only after owner approval (recorded 2026-09-30 in STATE/handoff) | closed |
| T-5-04 | Information disclosure | getProfitObservationsSince | mitigate | required viewerUserId, inner join promos + promoVisibilityCondition (promoTracking.ts:165-176); sole caller passes viewer (feedContext.ts:42) | closed |
| T-5-05 | Elevation of privilege | mark-promo-used | mitigate | viewer-scoped getActivePromos → other member's id resolves `not_active` (memberPromoState.ts:43-45); requireUser + session id (mark-promo-used.ts:27,37,65) | closed |
| T-5-07 | Information disclosure | DATABASE_URL | mitigate | read only in src/db/client.ts:14; never logged | closed |
| T-5-input | Tampering / Spoofing | add/edit promo actions + schemas | mitigate | requireUser() first, owner = user.userId; strictObject schemas with no userId; bounded strings/numbers; boost % (0,1000], odds |x| in [100,100000], required maxStake (addedPromoInput.ts); edit re-validated via prepareAddedPromoValues | closed |
| T-5-08 | Tampering | forged bookKey | mitigate | bookKey must be in getUsableUserBooks(userId) (addedPromoPipeline.ts); form options from same; books FK | closed |
| T-5-09 | Tampering | scope / pinned selection | mitigate | server-side resolveMemberScope against cached events; resolveSelection re-resolves pins (MSG_PIN_GONE if not); PinnedSelectionInputSchema | closed |
| T-5-10 | Denial of service | mass creation / oversized payloads | mitigate | ADDED_PROMO_MAX_ACTIVE = 100 (addedPromoInput.ts:20) enforced via countOwnActiveAddedPromos (addedPromos.ts:24-36); schema bounds | closed |
| T-5-11 | Integrity | money math in builder | mitigate | Decimal toFixed(2) only (buildAddedPromo.ts:95-108); no parseFloat/Number( | closed |
| T-5-13 | Integrity | cap kind mapping | mitigate | `z.enum(["total_payout","boost_extra"])`; engine cap tests pass | closed |
| T-5-idor | Tampering / EoP / Info disclosure | expire/delete/edit + Done-row actions | mitigate | owner + status (and bookKey/promoType for edit) in UPDATE/SELECT WHERE (addedPromos.ts:48-54, 61-72, 92-96, 137-146); row-count check; strict {promoId} input | closed |
| T-5-14 | Information disclosure | not-found responses | mitigate | single generic MSG_NOT_AVAILABLE for missing / other member's / deleted ids | closed |
| T-5-15 | Repudiation / data loss | Done history | mitigate | soft delete only (`status: "deleted"`), no `db.delete(promos)` in src; completions untouched; tests pass | closed |
| T-5-16 | Tampering | observation cleanup | mitigate | delete scoped by ownership `inArray` subquery (addedPromos.ts:73-82, 150-160) | closed |
| T-5-17 | Tampering | locked book/type on edit | mitigate | edit compares to stored row (MSG_LOCKED) and UPDATE WHERE includes bookKey/promoType; editable set strips bookKey/promoType/status/addedByUserId | closed |
| T-5-06 | Tampering (XSS) | badge/line rendering | accept | static copy as React text | closed |
| T-5-12 | Tampering (XSS) | stored title/scopeText | accept | server-generated from templates + cached team names; React text only | closed |
| T-5-18 | Tampering | duplicate-promo hint | accept | client-side advisory; server never reads it | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-5-01 | T-5-06 | Badge/line text is static copy rendered as React text; no `dangerouslySetInnerHTML` anywhere in src (only a comment in ClassifyQueueCard.tsx:35) | plan-time disposition; re-confirmed by audit | 2026-09-30 |
| AR-5-02 | T-5-12 | Stored title/scopeText are server-generated from fixed templates and cached team names, rendered as React text | plan-time disposition; re-confirmed by audit | 2026-09-30 |
| AR-5-03 | T-5-18 | Duplicate-promo hint is advisory and client-side; server re-validates everything in prepareAddedPromoValues and never reads the hint | plan-time disposition; re-confirmed by audit | 2026-09-30 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-30 | 21 | 21 | 0 | gsd-security-auditor (sonnet), /gsd-secure-phase 5 — targeted vitest 28 files / 449 tests passed |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-30
