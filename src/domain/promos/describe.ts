import type { ScrapedPromo } from "./scraped";
import type { ScopeGuess } from "./scope";
import { getSportLabel } from "@/config/sports";
import { etDayLabel } from "./etTime";
import { formatAmerican, formatKickoff, formatUsd } from "@/lib/format";

/**
 * Human-readable queue-card copy (03-UI-SPEC.md "Queue item card"). Pure,
 * zero-I/O -- describePromo/scopeGuessLabel never touch the DB or the
 * clock. Money goes through formatUsd, odds through formatAmerican, so
 * these strings never pass a raw number/decimal string through a native
 * template literal directly.
 */

/** "50.00" -> "50%" (drop a trailing ".00"); "12.50" -> "12.50%" (keep 2dp otherwise). */
function formatBoostPercent(value: string): string {
  const trimmed = value.endsWith(".00") ? value.slice(0, -3) : value;
  return `${trimmed}%`;
}

function signedPoint(point: number): string {
  return point >= 0 ? `+${point}` : `−${Math.abs(point)}`;
}

/** "{selectionText} moneyline" / "{selectionText} spread {±line}" / "{selectionText} total {line}". */
function pinnedLabel(pinned: NonNullable<ScrapedPromo["pinned"]>): string {
  switch (pinned.marketType) {
    case "moneyline":
      return `${pinned.selectionText} moneyline`;
    case "spread":
      return `${pinned.selectionText} spread ${pinned.line !== null ? signedPoint(pinned.line) : ""}`.trim();
    case "total":
      return `${pinned.selectionText} total ${pinned.line ?? ""}`.trim();
  }
}

/**
 * A queue card's summary-line description of the promo's scope as the book
 * states it (03-UI-SPEC.md): "50% profit boost · all NFL games on
 * 9/27/2026" / "Boosted to +150 · Denver Broncos moneyline · {scopeText}" /
 * "$25.00 bonus bet · any NBA game".
 */
export function describePromo(parsed: ScrapedPromo): string {
  if (parsed.promoType === "profit_boost") {
    if (parsed.boostedOddsAmerican !== null && parsed.pinned !== null) {
      return `Boosted to ${formatAmerican(parsed.boostedOddsAmerican)} · ${pinnedLabel(parsed.pinned)} · ${parsed.scopeText}`;
    }
    const percent = formatBoostPercent(parsed.boostPercent ?? "0.00");
    return `${percent} profit boost · ${parsed.scopeText}`;
  }

  return `${formatUsd(parsed.bonusAmount ?? "0.00")} bonus bet · ${parsed.scopeText}`;
}

const ET_DAY_KEY_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const ET_MONTH_DAY_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
});

const ET_DAY_NUMBER_FORMATTER = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  day: "numeric",
});

/** "any {sport} game, Sun, Sep 27 (ET)" (single ET day) or "any {sport} game, Sep 25–27 (ET)" (multi-day). */
function sportWindowLabel(sportKey: string, windowStart: string, windowEnd: string): string {
  const sportLabel = getSportLabel(sportKey);
  const startDate = new Date(windowStart);
  const endDate = new Date(windowEnd);
  const startKey = ET_DAY_KEY_FORMATTER.format(startDate);
  const endKey = ET_DAY_KEY_FORMATTER.format(endDate);

  if (startKey === endKey) {
    return `any ${sportLabel} game, ${etDayLabel(windowStart)} (ET)`;
  }

  return `any ${sportLabel} game, ${ET_MONTH_DAY_FORMATTER.format(startDate)}–${ET_DAY_NUMBER_FORMATTER.format(endDate)} (ET)`;
}

/**
 * A best-guess/matched scope's own label, WITHOUT the "Best guess: " prefix
 * (the caller adds that): "{away} @ {home}, {kickoff}" for an event guess,
 * or the sport+ET-window phrasing above for a sport_window guess.
 */
export function scopeGuessLabel(guess: ScopeGuess): string {
  if (guess.kind === "event") {
    return `${guess.awayTeam} @ ${guess.homeTeam}, ${formatKickoff(guess.commenceTime)}`;
  }
  return sportWindowLabel(guess.sportKey, guess.windowStart, guess.windowEnd);
}
