---
phase: 10
slug: ranked-intro-offers
status: approved
reviewed_at: 2026-11-03
shadcn_initialized: true
preset: base-nova (neutral, lucide) - already initialized, no change
created: 2026-11-03
---

# Phase 10 - UI Design Contract

> Visual and interaction contract for Phase 10. The design system already exists (shadcn base-nova, Tailwind v4, tokens in `src/app/globals.css`, spec'd against current main, NOT the `codex/deepbook-ui` restyle). This phase adds NO new tokens, fonts, colors or ui primitives. Intro-offer rows reuse the owner-approved no-sweat row look (sketch 001 B + notices 1, built in quick 261103-lx2). Sources: 10-CONTEXT.md (D-01..D-18), 09-UI-SPEC.md, sketch 001, `NoSweatRow`, `TrackingStrip`, `SignupOffersScreen`, `DashboardTotals`.

Everything in 09-UI-SPEC.md (spacing, type, color, estimate-never-green rule, amber warnings, 44px touch targets, `num` money figures, aria-label pattern) carries over unchanged. This document only states what is new or different.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn (components.json present, style base-nova, baseColor neutral) |
| Preset | base-nova, unchanged |
| Component library | base-ui via shadcn (`render={...}` prop pattern) |
| Icon library | lucide-react. New this phase: `Gift` (intro offer marker in section heading only). Reuse `Pin`, `ChevronDown`, `Info` (inside NoSweatNoticesPopover), `TriangleAlert`, `Clock`, `Hourglass`, `Undo2`, `Check` |
| Font | Geist Sans for text; Geist Mono via `num` for every money, odds, percent and day-count figure |
| Dark mode | OS `prefers-color-scheme` only. Token classes only, no raw hex |

New ui primitives: none. Use existing `Badge`, `Button`, `Card`, `Alert`, `Collapsible`, `Popover`/`Tooltip` (as in NoSweatNoticesPopover), `Skeleton`, `Checkbox`, `AlertDialog`, `Separator`.

---

## Spacing Scale

Unchanged 4-multiple scale (Tailwind 1 unit = 4px): xs 4, sm 8 (`gap-2`), md 16 (`p-4`), lg 24 (`p-6`), xl 32 (`gap-8` between screen sections), 2xl/3xl not used.

Exceptions (all already in the codebase):
- 12px (`gap-3`) only inside `IntroOfferRow` (copied from NoSweatRow) and the existing SignupOffersScreen cards. All other new containers use `gap-2` or `gap-4`.
- Touch targets: Track button, "See all" link button, step action buttons are `min-h-11` (44px). Ghost `size="sm"` buttons `min-h-10`.
- DashboardTotals keeps its existing `text-xs` captions, `text-lg` values and `p-3 sm:p-4` shell. That is existing code left untouched. The NEW intro row stays inside the four declared sizes (14/16/20 plus none other).

Layout rules:
- "Best intro offers" section: `flex flex-col gap-4`, sits `gap-8` below the last promos section.
- Sign-up offers: ranked list rows `flex flex-col gap-4`; book sections keep `gap-8`.
- Phone-first: single column below `md`; row desktop grid reuses the NoSweatRow template.

---

## Typography

Three sizes (14, 16, 20) and two weights (400, 600) for all NEW UI. Existing DashboardTotals markup (12px captions, 18px values) is untouched existing code and is not part of this contract.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body / row text (`text-base`) | 16px | 400 | 1.5 |
| Label / secondary / helper / badges / notes (`text-sm`) | 14px | 400 | 1.5 |
| Heading (`text-xl`: "Best intro offers", "Sign-up offers", book names, "Intro offers extracted" value is `num text-xl`) | 20px | 600 | 1.2 |
| Estimate figure (`num text-xl`) | 20px | 600 | 1.2 |

Rules:
- All money, odds, percent, "day 2 of 4", "65%" use `num`. Money `formatUsd`, odds `formatAmerican`, percent `formatPct`.
- The row headline `est. +$X` is `num text-xl font-semibold text-foreground` (never `text-primary`), with the `est.` outline Badge and the (i) popover beside it, exactly as NoSweatRow.
- Rate basis line is `text-sm text-muted-foreground`, figures `num`.

---

## Color

Existing tokens only, 60/30/10 unchanged: dominant `--background`, secondary `bg-secondary` rows/cards, accent `--primary` emerald.

Accent reserved for (unchanged list, plus one explicit exclusion):
1. Guaranteed-profit figures and the primary CTA.
2. REAL recorded profit on a settled tracked item.
3. Focus ring, active chips, primary "Track" button.

Phase 10 rules:
- **Every intro-offer figure on Opportunities and Sign-up offers is an estimate: `text-foreground`, never green.** This includes "est. +$X", per-bonus-bet values, and the whole-plan total.
- Waterfall bars follow the lx2 implementation (neutral tokens, hatched estimated bonus bars, solid Net bar, no `text-primary`/`bg-primary`). The qualifying-bet cost (a few cents) and hedge bars are neutral too.
- **"Intro offers extracted" on the Dashboard is real recorded money but is deliberately NOT green.** Use `text-foreground` (`num text-xl font-semibold`) so it cannot be read as part of the green "Extracted all-time" total (D-18, INTRO-10). A caption states it is separate.
- Step checklist in the Tracking card: done step uses a `Check` icon in `text-muted-foreground` inside a neutral circle (`border-border`), not green. The recorded final "Recorded +$X" line on a finished intro-offer card may be `text-primary` (real money, same as the no-sweat Done row) - only on the card's own done state, never on the Dashboard.
- Amber `text-warning` + `TriangleAlert`: "can't price", "terms incomplete" note, expiring-soon bonus bet (under 24h left), rate-basis is never amber. Never destructive red for these.
- Destructive red: only the Stop tracking confirm button text. "Bet lost" stays neutral outline.

---

## Copywriting Contract

Plain English. No jargon, no decision IDs, no "arb", "EV", "median", "snapshot", "installment" in UI text (say "paid out over 4 days"). Money to the cent.

### "Best intro offers" section (Opportunities, below promos)

| Element | Copy |
|---------|------|
| Heading | `Best intro offers` (text-xl font-semibold, `Gift` icon size-5 aria-hidden, count badge not shown) |
| Sub-copy | "New-customer offers at books you don't have yet, best first. These are estimates and don't follow the sort above." |
| Row collapsed line 1 | `Intro offer` badge (outline) · offer title (e.g. "Bet $5, get $200 in bonus bets") · book |
| Row collapsed line 2 | Qualifying bet and hedge columns same as NoSweatRow (`Qualifying bet`, `Hedge`) |
| Headline | `+$132.40` `num text-xl` + `est.` badge + (i) popover |
| Secondary line | "at 68% · you put up $5.00 · worst case −$0.40" (figures `num`; "at 68%" = rate used) |
| Rate basis label (D-08) | Under the secondary line, `text-sm text-muted-foreground`: historical = "Bonus bets valued at 68%, the recent average at this book."; default = "Bonus bets valued at 65%, our starting guess. We need a week of data for this book." |
| Rate basis short chip (collapsed, next to est. badge on phone-width rows) | Badge outline `recent rate` or `starting guess` |
| ROI column | Not shown for intro offers (value ranking, not percent). Replace with day count: "Bonus over" / `4 days` (`num`) when installments, otherwise omitted |
| Primary CTA | `Track offer` (filled primary, `Pin` icon, `min-h-11`) |
| Secondary link | `Open {book}` text link when `link` exists (`text-sm text-foreground underline underline-offset-4`, opens new tab, `rel="noopener noreferrer"`, same as SignupOffersScreen) |
| See all | Outline button `See all intro offers` (`nativeButton={false} render={<Link href="/signup-offers"/>}`, `min-h-11`) shown whenever the full list has more than 3 books, or always if 1-3 as plain link `See the full plan list`. Executor: confirm the Sign-up offers route path from the app router |
| Section empty (no priceable offers, but screen otherwise fine) | Section is not rendered at all (no empty box) |
| Section loading | 3 `Skeleton h-24` rows |
| Section load failure | Inline muted line "Couldn't load intro offers." + `Reload intro offers` ghost button. Never blocks the promos list |
| Aria-label on row trigger | "Show the plan for {book} intro offer. Estimate plus {dollars} dollars {cents} cents at {rate} percent. This is an estimate." |

### Expanded whole plan (shared by Opportunities row and Sign-up offers)

Reuses `NoSweatDetails` structure (two bet chips left, waterfalls right on desktop; stacked on phone). Waterfall content is intro-specific:

| Element | Copy |
|---------|------|
| Plan heading | `The plan` (`text-base font-semibold`) |
| Step 1 | "1. Sign up at {book} and bet {stake} on {selection} {odds}." |
| Step 1b | "2. Hedge {hedgeStake} on {selection} {odds} at {hedgeBook}." |
| Qualifying cost line | "These two bets cost about {cost} together, whichever side wins." |
| Step per bonus bet (one row each, installments included) | "{n}. {amount} bonus bet{, arrives {day}}. Use by {expiry}. Worth about {convertedValue} at {rate}%." + link `Turn it into cash` -> bonus-bet finder, prefilled with book + amount (executor: reuse existing finder deep-link/params; if none exists, link to the finder page with the book preselected) |
| Single bonus total | "Total bonus bets: {total}. Worth about {converted}." |
| Win-only variant (D-06) | Line above waterfalls: "The bonus only arrives if your {book} bet wins. The hedge is sized so you come out ahead either way." Waterfall shows two outcomes: "Bet wins" (bonus bars present, hatched) and "Bet loses" (no bonus bars, small net). |
| Win-or-lose variant | One outcome waterfall ("Either way you get the bonus") |
| No-sweat-first-bet variant (INTRO-04) | Same two outcomes as the feed no-sweat waterfall; refund bar hatched; copy "If your bet loses you get back a {refund} bonus bet." |
| Worst-case line | "Worst case: if the bonus bets turn out to be worth $0, you lose {worstCase}." (muted, under diagram, as lx2) |
| Track helper | Lives in the (i) popover only |

Waterfall rules: bars share one scale; bonus-bet bars are hatched and labelled `bonus bet`; one bar per bonus bet (installments each get a bar in order, expiry in the bar label, e.g. "Day 2 · $50"); Net bar solid neutral; $0 line labelled. If 4+ bonus bars, the labels move to a list under the chart on phone (no truncation of figures).

### (i) notices popover (D-14, single popover per row)

Contents, in order, only the ones that apply (reuse `NoSweatNoticesPopover`; add an `intro` variant prop rather than a new component):

| Notice | Copy |
|--------|------|
| Estimate | "An estimate. It assumes each bonus bet turns into cash at {rate}%, so it can change." |
| One-time (account risk, carried from Phase 9) | "You only get one shot at this at each book. Mix in some normal bets and skip very long odds so your account looks like a regular customer." |
| Min odds / stake | "The offer needs a bet of at least {minStake} at {minOdds} or longer." (only when relevant) |
| Low-profile warnings | Same three amber lines as 09-UI-SPEC |
| Terms incomplete | "We couldn't read every term of this offer, so the numbers are a rough guess. Check the offer on {book} before you bet." |
| Track helper | "Track offer pins this to the top so you can follow each step. It also adds {book} to My Books." |

Row signals: amber dot (`size-2 rounded-full bg-warning`, sr-only "Notice") whenever any warning or terms-incomplete notice exists, as lx2.

### "Pick one" grouping (D-04)

| Element | Copy |
|---------|------|
| Group label on Sign-up offers (book has more than one usable offer) | Within the book's section: top offer first as a normal row; others follow under sub-heading `Other offers at {book}` (`text-sm font-semibold`) with helper "You can only use one of these." and each carries a `Pick one` Badge (outline) |
| Top offer badge | `Best at {book}` Badge (outline) only when others exist |
| On Opportunities | Only the book's best offer is shown, no badge |

### Sign-up offers screen (ranked list, whole-plan view)

| Element | Copy |
|---------|------|
| Page heading | `Sign-up offers` (unchanged) |
| Sub-copy (replaces "For reference only, with no hedge math.") | "New-customer offers at sportsbooks you haven't added yet, best first. Values are estimates." |
| Section order | 1. `Ranked by value` (offers we can price, by total estimated value desc, one expandable row per book offer using the intro row look), 2. `Can't price yet` (can't-price + terms-incomplete offers, ranked last), 3. `Other sign-up offers` (the existing plain informational cards, unchanged look, for deposit-match, racing credit, sweepstakes etc.) |
| Section 1 heading / sub | `Ranked by value` / "Tap an offer to see the full plan, step by step." Headings `text-xl font-semibold`, sub `text-sm text-muted-foreground` |
| Rank number | `num text-sm text-muted-foreground` "#1" at row start on Sign-up offers only (not on Opportunities top 3) |
| Section 2 heading / sub | `Can't price yet` / "We can't work out the bets for these, so there is no estimate." |
| Can't-price note (amber, per row, D-03/INTRO-07) | "Can't price - no odds at {book}." Row shows headline only: badge, book, title, bonus label, expiry, link. No dollar estimate, no Track, never invented odds |
| Terms-incomplete (priced but rough) | Row stays in section 1 but ranked below complete ones; badge `Terms unclear` (outline) + amber dot + popover line above. Est. shown as usual |
| Terms-incomplete (cannot price at all) | Section 2 with note "Can't price - we couldn't read the terms. Check the offer on {book}." |
| Section 3 heading / sub | `Other sign-up offers` / "These don't turn into a hedge we can work out, so they aren't ranked." |
| Show owned toggle | Keep "Show books I already have". Owned-book intro offers appear in section 3 style (informational, `You have this book` badge), never ranked |
| Empty (nothing priceable, other offers exist) | Skip section 1 silently |
| Empty states, load failure, skeleton | Existing copy and patterns unchanged |
| Row CTA | `Track offer` (as above), also `Open {book}` link |

### Tracking strip: intro-offer step checklist (D-15, D-16)

Strip heading `Tracking` and `Pin` unchanged. Strip subtitle becomes: "Bets and offers you've started. Finish each one as you go." (was "No-sweats you've placed. Finish each one when the game is over."). Cards for no-sweats unchanged.

Card shell: same as `TrackedNoSweatCard` (`rounded-lg border border-border bg-secondary p-4`, never collapsible, single column).

| Element | Copy |
|---------|------|
| Title row | `Intro offer` badge + "{book}: {offer title}" |
| Added-to-books confirmation (shown once, in the Track success message and as a muted line on the card for the first view) | "{book} was added to My Books." |
| Estimate line | "Estimated +$132.40 · not counted in your totals until you finish" (muted, figures `num`) |
| Checklist | Vertical ordered list `ol`, `gap-4`. Each step: status circle (`size-6`, empty ring = to do, `Check` = done, `Hourglass`/`Clock` = waiting), title `text-base`, detail `text-sm text-muted-foreground`, action area below the detail |
| Step 1 | Title "Place the qualifying bet and hedge". Detail "Bet {stake} on {selection} {odds} at {book}. Hedge {hedgeStake} on {selection} {odds} at {hedgeBook}." Action: `I placed both` (outline, `min-h-11`); disabled-looking helper if kickoff not reached is NOT used here (they place before the game) |
| Step 2 | Title "How did the bet go?" shown after step 1 and after kickoff. Buttons `Bet won`, `Bet lost`, `Push`, `Game voided` (outline, 2x2 on phone) - reuse the Phase 9 control and the `I bet different amounts` correction panel. Before kickoff: "Game starts {formatKickoff}. Come back after it ends." For win-only offers, helper: "{book} only pays the bonus if your bet wins." After "Bet lost" on a win-only offer: no bonus steps appear, card goes to Done with the real small result. Offers whose qualifying bet does not depend on a game result (win-or-lose) skip this step's gating on win/lose for bonus arrival, but still ask the result so the real money is recorded |
| Step 3..n (one per bonus bet) | Title "{amount} bonus bet from {book}". Detail: "Use by {expiry}. Arrives {day}." Status words: `Waiting for it to arrive` (Hourglass), `Ready to use` (after member taps arrival), `Used` (after conversion). Actions: `It arrived` (outline) then link button `Turn it into cash` (-> bonus-bet finder, prefilled) and `Mark done` (outline) which opens an inline field `What you got back` (prefix `$`, `h-11 num`, helper "Enter the profit you made turning this bonus bet into cash. Use 0 if it expired.") with `Record bonus bet` (primary) / `Keep waiting` (ghost) |
| Expiry urgency | Expiring in under 24h: amber `TriangleAlert` line "Expires in {hours} hours." ; expired and not marked: amber "This bonus bet expired. Mark it done with 0 if you didn't use it." |
| Last step | Title "All done". Appears when every step is complete. Shows "Recorded +$X for this offer" (`num`, `text-primary` allowed here only, `aria-live="polite"`), with breakdown muted line "Qualifying and hedge {a}, bonus bets {b}." and `Undo` (ghost, `Undo2`, aria-label "Go back one step"). The card then moves to the Done area and counts only in "Intro offers extracted" |
| Edit amounts | `I bet different amounts` (existing correction panel) available on step 1/2; labels unchanged from 09 |
| Stop tracking | Same AlertDialog; body: "It goes back to the offers list. Nothing is recorded. {book} stays in My Books." Actions `Keep tracking` / `Stop tracking` |
| Progress summary (card header, right) | `num text-sm` "2 of 5 steps" |
| Waiting reminder | If a bonus bet is `Waiting` more than 24h past its arrival day: amber "Still waiting on this one. It counts as $0.00 until you tell us." |
| Track failure | "Couldn't track this offer. Try again." |
| Track: odds moved | "Odds changed, so the numbers were updated. Check them and tap Track offer again." |
| Track: book add failed (rare) | "Offer tracked, but we couldn't add {book} to My Books. You can add it in Settings." (`Link` to /settings) |
| Step save failure | "Couldn't save that step. Try again." (reuse `ACTION_FAILED_MESSAGE` for thrown errors) |

Steps behave as: one step is "current" (expanded actions, full opacity); completed steps collapse to a single line with `Check`; future steps are shown muted (`text-muted-foreground`) with no actions. Keyboard order follows the list. Each action button manages its own pending state (`useTransition`) and inline `role="alert"` error.

### Dashboard: "Intro offers extracted" (D-18)

| Element | Copy |
|---------|------|
| Placement | NOT a fifth cell in the 4-column cells grid (that grid is one conceptual total). A separate row between the cells grid and the count line, inside the same `DashboardTotals` shell, separated by the existing `border-t border-border pt-3` pattern |
| Label | `Intro offers extracted` (`text-sm text-muted-foreground`) |
| Value | `num text-xl font-semibold text-foreground` (not green) e.g. `$38.60` |
| Caption (`text-sm text-muted-foreground`) | "From {n} finished intro offers. Not included in the totals above or the graph." |
| Zero state | Row not rendered when no intro offer has ever been finished and none is tracked (no empty box) |
| In-progress hint | When some are tracked but none finished: value `$0.00`, caption "{n} in progress. Counted when you finish them." |
| Loading | Existing skeleton; row hidden while loading |
| Aria | Row is part of the `aria-label="Your totals"` section; label+value read as text |

The ProfitGraph, its legend and Statistics gain no intro-offer series. No copy there.

### Destructive and irreversible actions

| Action | Confirmation |
|--------|--------------|
| Stop tracking an intro offer | AlertDialog above. Allowed any time before the card reaches "All done" |
| Any step action (placed, won/lost, arrived, mark done) | No dialog; reversible with `Undo` stepping back exactly one step |
| Track (adds book to My Books) | No dialog; the effect is disclosed in the (i) popover before tap and in the success line after. Removing the book later is the existing Settings flow; Stop tracking does not remove it |

Never write: "guaranteed", "free money", "risk-free", "arbitrage", "multiple accounts", "VPN", "bonus abuse", "median", "snapshot".

---

## Component Inventory and Layout

New components (all compose existing primitives):

| Component | Role | Notes |
|-----------|------|-------|
| `IntroOfferRow` | Collapsible row for both screens | Sibling of `NoSweatRow`; same shell `Collapsible group rounded-lg border border-border bg-secondary`, empty full-card trigger overlay, `pointer-events-none` content, `p-4`, `min-h-11`. Desktop grid `md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1.2fr)_120px_96px_20px]`; the ROI column becomes the "Bonus over {n} days" column. Track button in the collapsed row under the content (as NoSweatRow) and repeated at the bottom of the expanded panel for thumb reach. Props: `variant: "compact" | "ranked"` (ranked adds `#n`) |
| `IntroOfferDetails` | Expanded whole plan | Built on `noSweatWaterfall.ts` (extend with a multi-bar bonus series and win/lose outcomes; keep the pure-helper + vitest pattern) |
| `IntroOffersSection` | "Best intro offers" on Opportunities | Heading, sub-copy, 3 rows, See all |
| `IntroOfferNotices` | Notices | Prefer extending `NoSweatNoticesPopover` with an `intro` variant |
| `TrackedIntroOfferCard` | Step-checklist card | Rendered by `TrackingStrip` beside `TrackedNoSweatCard`; strip props change to a union of card kinds; strip count badge includes both kinds |
| `BonusBetStep` | One bonus-bet step | Used inside the card |
| `IntroTotalsRow` | The "Intro offers extracted" line | Rendered inside `DashboardTotals`, driven by `buildTotalsView` extension (new `intro` field; tone `"neutral"` -> `text-foreground`; add to the `VALUE_CLASS` map) |
| `RateBasisNote` | One-line rate basis | Shared by row and plan |

Opportunities screen order (top to bottom): header/stale-odds line, DashboardTotals, ProfitGraph, TrackingStrip (now with both card kinds), SortSwitch, guaranteed/promo sections, Can't price yet (promos), **Best intro offers (new, last)**. Reason (D-11): below the promos. If the promos "Can't price yet" list exists, intro offers go after it so the promo area stays one block. The SortSwitch caption and sort never affect this section (add an `aria-describedby` hint is not needed; the sub-copy states it).

Sign-up offers: the three sections listed above; the plain informational cards keep their current markup.

Interaction contract:
- Rows expand/collapse via the trigger overlay; (i) popover and Track/Open links must not toggle the row (same stacking as lx2: popover above overlay with `pointer-events-auto`).
- Track: server recompute; on `odds_changed` update in place with the odds-changed message; on success the row leaves the ranked lists via refetch (`onChanged`) and the card appears in the Tracking strip; the added book is no longer in "not yet" lists, which is why the offer disappears from Best intro offers/Ranked list (D-02, D-16).
- Rank is recomputed on every load; no client sorting. "Best intro offers" top 3 and Sign-up offers ranking come from the same server order.
- Stale odds: reuse the `PriceAgeNote` inside the plan ("Odds from {age}.").
- Accessibility: all actions are real buttons/links; warnings are text with icon (never color-only); step list is an `ol` with `aria-current="step"` on the current step; status words are text, not icon-only; `aria-live="polite"` on recorded totals; contrast via tokens in both modes.
- Reduced layout shift: Tracking strip renders nothing when empty; IntroOffersSection reserves no space when it has no rows.

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | none new (existing alert, alert-dialog, badge, button, card, checkbox, collapsible, input, label, popover/tooltip, separator, skeleton) | not required |
| Third-party | none | not applicable |

---

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-11-03 (gsd-ui-checker, 6/6 after one revision)
