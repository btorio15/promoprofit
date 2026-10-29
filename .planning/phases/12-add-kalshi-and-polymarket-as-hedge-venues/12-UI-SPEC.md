---
phase: 12
slug: add-kalshi-and-polymarket-as-hedge-venues
status: draft
shadcn_initialized: true
preset: base-nova (neutral, cssVariables)
created: 2026-10-29
---

# Phase 12 — UI Design Contract

> Additive contract. The existing design system is LOCKED: this phase adds elements to existing surfaces and introduces no new tokens, fonts, colors or components.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (detected: `components.json`) |
| Preset | base-nova, baseColor neutral, CSS variables in `src/app/globals.css` |
| Component library | base-ui (`@base-ui/react`) via shadcn `ui/` |
| Icon library | lucide |
| Font | Geist Sans / Geist Mono (`next/font`) |

Reused components only: `Badge` (outline), `Tooltip`, `Alert`/`AlertDescription`, `Checkbox`, `Label`, `Separator`. No new shadcn blocks.

---

## Spacing Scale

Existing Tailwind scale; no new values.

| Token | Value | Usage in this phase |
|-------|-------|---------------------|
| xs | 4px | Gap between badge and leg text |
| sm | 8px | Gap between stacked badges / note under leg |
| md | 16px | Gap between BookPicker rows (`gap-4`), group spacing inside a group |
| lg | 24px | Gap between "Sportsbooks" and "Prediction markets" groups |
| xl | 32px | unchanged |
| 2xl | 48px | unchanged |
| 3xl | 64px | unchanged |

Exceptions: BookPicker rows keep the existing `min-h-10` (40px) tap target. Badge keeps its built-in `h-5`.

---

## Typography

Existing roles only; no new sizes or weights.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body (leg text, hedge book name) | 14px (`text-sm`) | 400 | 1.5 |
| Label (badges, "price may move" note, availability note) | 12px (`text-xs`) | 500 for badges, 400 for notes | 1.5 |
| Heading (group heading "Prediction markets") | 14px (`text-sm`) | 500 | 1.2 |
| Display | not used in this phase | — | — |

Market leg numerics (contracts, cents, fee, American price) use the same text style as existing hedge stake text; do not introduce mono.

---

## Color

Existing tokens; nothing new.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `--background` (white / oklch .145) | Page surface |
| Secondary (30%) | `--card`, `--muted` | Cards, rows, note backgrounds |
| Accent (10%) | `--primary` #059669 (dark #10b981) | Unchanged: profit figures, primary buttons, checked checkbox |
| Destructive | `--destructive` #dc2626 | Not used in this phase |

Accent reserved for: existing profit figures, primary buttons, and the checked state of the market checkboxes (inherited from `Checkbox`). Market badges and notes MUST NOT use accent or destructive; they use `outline` Badge and `text-muted-foreground`.

---

## Component Contract

### 1. Market hedge leg (ResultRow, ArbRow, PromoRow, PairCard, Done snapshots)

Replaces the "stake @ odds" hedge text only when the hedge venue is a prediction market. Book name column shows the venue name ("Kalshi", "Polymarket") exactly like a sportsbook name (`text-sm text-muted-foreground`); no logos, no special icon.

Leg text format (single line, wraps on mobile):

`buy {N} {YES|NO} @ {P}¢ (${cost} + ${fee} fee) ≈ {American}`

Example: `buy 42 YES @ 61¢ ($25.62 + $0.42 fee) ≈ −156`

Rules:
- Whole-number N; P is whole cents (or one decimal only if the venue quotes it); cost and fee both to the cent; American price uses the true minus sign "−" already used by the app's odds formatter.
- `$cost` = N × P; fee is the exact decimal.js fee, shown even when $0.00 ("$0.00 fee") so the format never changes.
- The displayed total outlay on the card (where the card shows hedge stake) = cost + fee.
- Done snapshots render the same string from the stored count, price and fee, never recomputed.
- On mobile (<md) the string sits under the existing "Hedge" label and wraps; no truncation.

### 2. "Settlement differs" badge

- `<Badge variant="outline" className="cursor-default">Settlement differs</Badge>` wrapped in `Tooltip`, identical structure to "Tie risk"; placed in the same spot, directly after the hedge venue name. Both badges may appear together (stack inline with `gap-1`, wrap allowed).
- Tooltip text explains the specific case, one or two sentences, plain language, ending with the consequence. Template: `{When}, {book does X} but {venue does Y}. {Consequence for the member}.`
  - Tie example: "If the game ends in a tie, the book refunds your bet but this contract resolves NO. You could lose the contract cost."
  - Postponement/overtime variants follow the same template; copy lives in one config table keyed by sport/market/venue (single source, like `config/sports.ts`).
- Badged rows rank and total normally (D-09); no dimming, no color change.
- Touch: tooltip must also open on tap/focus (as Tie risk does today).

### 3. Liquidity notes

- "Price may move" (common case, Odds API price only): inline muted note directly below the leg text: `text-xs text-muted-foreground`, copy: "Price may move. Check the order book before buying." No badge, no icon.
- "Thin market" (only when native depth exists and need > available): `Badge variant="outline"` after the venue name, text `Thin market: only {N} contracts at {P}¢`, with Tooltip: "You need {M} contracts. Buying more will cost more than the price shown." Only one of the two liquidity treatments shows per leg (thin market replaces the price-may-move note).
- Neither blocks or hides the row.

### 4. My Books picker (`BookPicker`, onboarding + Settings)

- `BookPicker` renders two groups from the same component: unlabeled "Sportsbooks" list first (unchanged), then a `Separator` and a group heading `Prediction markets` (`text-sm font-medium`), `gap-6` between groups, rows keep `gap-4`. Group heading for sportsbooks is added only when the market group is present: "Sportsbooks" with the same style.
- Rows: same full-width `Label` + `Checkbox`, display name only ("Kalshi", "Polymarket"). Default unchecked in onboarding and for existing members (opt-in).
- Availability note: appears directly under the ticked row (not a toast, not a dialog), renders when that market is checked, hides when unchecked. Style: `text-xs text-muted-foreground`, indented to align with the label text (checkbox width + `gap-2`). Copy, verbatim: "Regulated by the CFTC, not Colorado's gaming division. Check it's available to you."
- Group helper line under the heading (always visible, `text-xs text-muted-foreground`): "Optional. Used only to hedge your sportsbook promos."
- Never mention VPNs, location tricks or extra accounts anywhere.
- Onboarding keeps its current minimum-selection rule counting sportsbooks only; markets alone cannot satisfy it (D-04, every opportunity needs a sportsbook leg).
- `SettingsBookCapsForm` (low-profile caps): market venues do not appear there (D-16).

### 5. States

| State | Behavior |
|-------|----------|
| No market ticked | No market legs anywhere; no new UI visible |
| Market leg, no depth data | Leg text + "Price may move" note |
| Market leg, thin | Leg text + Thin market badge |
| Tie/settlement mismatch | Settlement differs badge (may combine with Tie risk) |
| Stale prices | Existing price-age display unchanged |

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primary CTA | none new (existing "Save books" / onboarding continue unchanged) |
| Group heading | Prediction markets |
| Group helper | Optional. Used only to hedge your sportsbook promos. |
| Availability note | Regulated by the CFTC, not Colorado's gaming division. Check it's available to you. |
| Market leg | buy 42 YES @ 61¢ ($25.62 + $0.42 fee) ≈ −156 |
| Settlement badge | Settlement differs (tooltip explains specific case) |
| Thin market badge | Thin market: only {N} contracts at {P}¢ |
| Price note | Price may move. Check the order book before buying. |
| Empty state | no new empty state; if no market beats sportsbooks, rows look exactly as today |
| Error state | no new errors; a venue missing from a refresh simply yields no market hedge, existing refresh error copy applies |
| Destructive confirmation | none in this phase |

---

## Accessibility

- Badges are tooltip triggers with the same keyboard focus behavior as Tie risk; tooltip content must not be the only place the fact lives for the leg's core numbers.
- Availability note linked to its checkbox via `aria-describedby`.
- Information never conveyed by color alone (all badges/notes are text).

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | badge, tooltip, alert, checkbox, label, separator (all already installed) | not required |
| Third-party | none | not applicable |

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
