# Phase 1: Core Hedge Calculator - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-25
**Phase:** 1-Core Hedge Calculator
**Areas discussed:** Hedge strategy, Odds input & format, Results display, Page layout & tandem entry

---

## Hedge strategy

| Question | Options | Selected |
|----------|---------|----------|
| Hedge stake sizing | Equal profit / Equal + skew slider / You decide | Equal profit |
| Boost promo-side stake | Suggest max, editable / I always enter it | Suggest max, editable |
| Max-winnings cap binding | Auto-reduce stake + explain / Warn only | Auto-reduce stake + explain |
| Partial bonus-bet use | Single amount only / Track remaining | Single amount only |

---

## Odds input & format

| Question | Options | Selected |
|----------|---------|----------|
| Odds formats | American only / American + decimal toggle / Auto-detect | American only |
| Boost input | Both, toggle / Boost % only / Boosted price only | Both, toggle |
| Boost % application | To profit / Let me pick per promo | To profit |
| Validation | Live inline errors / Lenient | Live inline errors |

---

## Results display

| Question | Options | Selected |
|----------|---------|----------|
| Headline number | Guaranteed profit $ / Conversion-ROI % | Guaranteed profit $ |
| Breakdown | Per-outcome table / Just the two stakes | Per-outcome table |
| Precision | Cents / Cents + copy button | Cents |
| Advisory placement | Small footnote / Dismissible banner | Small footnote |

---

## Page layout & tandem entry

| Question | Options | Selected |
|----------|---------|----------|
| Organization | Two-leg form / Tabs | Two-leg form |
| Leg labels | Optional labels / Book dropdown required / No labels | Optional labels |
| No-push enforcement | Market-type select w/ whole-line warning / Footnote only / Moneyline only | Market-type select w/ whole-line warning |
| Persistence | URL state / Nothing / Local storage | URL state |

---

## Claude's Discretion

- Scaffold/test setup, styling, copy wording, optimal-stake algorithm under combined caps (must satisfy equal-profit and cap decisions).

## Deferred Ideas

- Profit skew slider, decimal odds, one-tap stake copy, remaining bonus-balance tracking.
