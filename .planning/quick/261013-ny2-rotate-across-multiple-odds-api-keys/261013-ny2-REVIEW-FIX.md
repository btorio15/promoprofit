---
phase: 261013-ny2
fixed_at: 2026-10-13
review_path: .planning/quick/261013-ny2-rotate-across-multiple-odds-api-keys/261013-ny2-REVIEW.md
iteration: 1
findings_in_scope: 7
fixed: 6
skipped: 1
status: partial
---

# Code Review Fix Report (quick 261013-ny2)

Skipped by decision (no change needed): IN-01 (owner-requested). WR-01 accepted: note appended to CONTEXT.md and SUMMARY.md (uncommitted docs).

## Fixed
- WR-04 (9588134): legacyKeyId returns ODDS_API_KEY's fingerprint only if configured, else the first configured key. Tests updated/added.
- WR-02 + WR-03 (4d30f6f, requires human verification for logic): per-key meter whenever key_id column exists and >= 1 key; single key keeps nullable "unknown"; new `bestKeyRemaining` in OddsStatus drives level and CreditBanner text; combined total still shown. Tests: removed key, 60+60 vs 70, WR-04 via status.
- IN-02 + IN-03 (a85e634): apiKey required in fetchSportOdds/fetchEventOdds (empty key throws), header comment fixed, listSports keeps explicit CLI default; odds-smoke passes explicit key and prints a spend warning.

Verification: full vitest (1785 pass), typecheck, lint all green.
