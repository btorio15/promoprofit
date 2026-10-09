import type { OddsEvent } from "@/domain/odds/schemas";
import { SPORT_KEYS } from "@/config/sports";
import type { ScopeGuess } from "./scope";
import type { ScrapedPromo } from "./scraped";
import type { PromoMarketType, PromoSelection, PromoSide } from "./types";
import { normalizeTeamText, resolveTeam } from "./aliases";
import { resolveSelection } from "./selection";

/**
 * Deterministic 3-(really 4-)signal scope certainty gate (PROMO-04, D-10;
 * 03-RESEARCH.md "Matching & Confidence Scoring", adapted per 03-RECON.md
 * Design Implication 2: real promos name a sport+date or one game, not a
 * pre-specified market). matched requires EVERY applicable signal true:
 * sport resolved, window resolved, (for a named game) both teams resolved
 * to exactly one cached, not-yet-started event in that window, and (only
 * when the book pins a market/side) that selection actually exists as a
 * half-point 2-way market. This all-signals rule IS the auto-accept
 * threshold -- it is deterministic, so there is no numeric score to slide;
 * "tuning" means growing the alias table and hardening window logic
 * (Plan 08 Task 3), never loosening this rule or adding fuzzy matching.
 * Pure, zero-I/O: "now" is always supplied by the caller.
 */

export interface MatchSignals {
  sportMatch: boolean;
  windowMatch: boolean;
  /** true when not applicable (sport-wide promo -- no named game to match). */
  teamMatch: boolean;
  /** true when not applicable (no pinned selection). */
  marketMatch: boolean;
}

export type MatchResult =
  | { status: "matched"; scope: ScopeGuess; pinned: PromoSelection | null; signals: MatchSignals }
  | { status: "unmatched"; signals: MatchSignals; guess: ScopeGuess | null; unresolvedTeamTexts: string[] };

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_WINDOW_DAYS = 7;

function dedupeById(events: readonly OddsEvent[]): OddsEvent[] {
  const byId = new Map<string, OddsEvent>();
  for (const e of events) {
    if (!byId.has(e.id)) byId.set(e.id, e);
  }
  return [...byId.values()];
}

/** Pool: moneyline ∪ extended, deduped, in (now, now+windowDays], sport in SPORT_KEYS, hint-filtered. */
function buildPool(
  events: { moneyline: OddsEvent[]; extended: OddsEvent[] },
  now: Date,
  windowDaysMs: number,
  sportKeyHint: string | null,
): OddsEvent[] {
  const nowMs = now.getTime();
  const maxMs = nowMs + windowDaysMs;
  return dedupeById([...events.moneyline, ...events.extended]).filter((e) => {
    if (!SPORT_KEYS.includes(e.sport_key)) return false;
    if (sportKeyHint !== null && e.sport_key !== sportKeyHint) return false;
    const commence = new Date(e.commence_time).getTime();
    return commence > nowMs && commence <= maxMs;
  });
}

function knownTeamsFromPool(pool: readonly OddsEvent[]): { sportKey: string; name: string }[] {
  const out: { sportKey: string; name: string }[] = [];
  for (const e of pool) {
    out.push({ sportKey: e.sport_key, name: e.home_team });
    out.push({ sportKey: e.sport_key, name: e.away_team });
  }
  return out;
}

function eventMatchesTeamPair(e: OddsEvent, teamA: string, teamB: string): boolean {
  if (teamA === teamB) return false;
  const names = new Set([e.home_team, e.away_team]);
  return names.size === 2 && names.has(teamA) && names.has(teamB);
}

/**
 * College school names ("Georgia") prefix-match several teams ("Georgia
 * Bulldogs", "Georgia Tech Yellow Jackets", "Georgia Southern Eagles"). When
 * either side is ambiguous, keep only the team pairs that actually meet in a
 * cached game (inside the promo's window when it has a valid one). Exactly one
 * surviving pair resolves both sides; anything else leaves both lists as they
 * were, so the caller still fails it as ambiguous -- this never guesses.
 */
function narrowByOpponent(
  resolvedA: string[],
  resolvedB: string[],
  pool: readonly OddsEvent[],
  windowInfo: ReturnType<typeof computeWindowValidity>,
): { resolvedA: string[]; resolvedB: string[] } {
  const unchanged = { resolvedA, resolvedB };
  if (resolvedA.length === 0 || resolvedB.length === 0) return unchanged;
  if (resolvedA.length === 1 && resolvedB.length === 1) return unchanged;

  const inWindow = (e: OddsEvent) => {
    if (!(windowInfo.given && windowInfo.valid)) return true;
    const c = new Date(e.commence_time).getTime();
    return c >= windowInfo.start!.getTime() && c <= windowInfo.end!.getTime();
  };

  const pairs = new Set<string>();
  let found: [string, string] | null = null;
  for (const e of pool) {
    if (!inWindow(e)) continue;
    for (const a of resolvedA) {
      for (const b of resolvedB) {
        if (eventMatchesTeamPair(e, a, b)) {
          pairs.add(`${a}\u0000${b}`);
          found = [a, b];
        }
      }
    }
  }
  if (pairs.size !== 1 || found === null) return unchanged;
  return { resolvedA: [found[0]], resolvedB: [found[1]] };
}

function earliestByCommence(events: readonly OddsEvent[]): OddsEvent {
  return [...events].sort(
    (a, b) => new Date(a.commence_time).getTime() - new Date(b.commence_time).getTime(),
  )[0];
}

function eventScopeGuessOf(e: OddsEvent): ScopeGuess {
  return {
    kind: "event",
    eventId: e.id,
    sportKey: e.sport_key,
    homeTeam: e.home_team,
    awayTeam: e.away_team,
    commenceTime: e.commence_time,
  };
}

/** Window validity: both bounds set, start < end, end still in the future, and no longer than windowDays. */
function computeWindowValidity(
  windowStart: string | null,
  windowEnd: string | null,
  now: Date,
  windowDaysMs: number,
): { given: boolean; valid: boolean; start: Date | null; end: Date | null } {
  if (windowStart === null || windowEnd === null) {
    return { given: false, valid: false, start: null, end: null };
  }
  const start = new Date(windowStart);
  const end = new Date(windowEnd);
  const valid =
    start.getTime() < end.getTime() &&
    end.getTime() > now.getTime() &&
    end.getTime() - start.getTime() <= windowDaysMs;
  return { given: true, valid, start, end };
}

/** side from the resolved selection team (home/away) or literal "over"/"under" text. */
function determineSide(selectionText: string, event: OddsEvent): PromoSide | null {
  const normalized = normalizeTeamText(selectionText);
  if (normalized === "over") return "over";
  if (normalized === "under") return "under";

  const knownTeams = [
    { sportKey: event.sport_key, name: event.home_team },
    { sportKey: event.sport_key, name: event.away_team },
  ];
  const resolved = resolveTeam(selectionText, knownTeams, event.sport_key);
  if (resolved.length !== 1) return null;
  return resolved[0] === event.home_team ? "home" : "away";
}

function sourceEventsFor(
  events: { moneyline: OddsEvent[]; extended: OddsEvent[] },
  marketType: PromoMarketType,
  eventId: string,
): OddsEvent[] {
  if (marketType !== "moneyline") return events.extended;
  return events.moneyline.some((e) => e.id === eventId) ? events.moneyline : events.extended;
}

/** marketMatch=true (not applicable) when unpinned; false when pinned but no single event is fixed. */
function evaluatePinned(
  pinned: ScrapedPromo["pinned"],
  finalCandidate: OddsEvent | null,
  events: { moneyline: OddsEvent[]; extended: OddsEvent[] },
): { marketMatch: boolean; selection: PromoSelection | null } {
  if (pinned === null) return { marketMatch: true, selection: null };
  if (finalCandidate === null) return { marketMatch: false, selection: null };

  const side = determineSide(pinned.selectionText, finalCandidate);
  if (side === null) return { marketMatch: false, selection: null };

  const selection: PromoSelection = {
    eventId: finalCandidate.id,
    marketType: pinned.marketType,
    line: pinned.line,
    side,
  };
  const resolved = resolveSelection(sourceEventsFor(events, pinned.marketType, finalCandidate.id), selection);
  return { marketMatch: resolved !== null, selection: resolved !== null ? selection : null };
}

function matchSportWide(parsed: ScrapedPromo, now: Date, windowDaysMs: number): MatchResult {
  const windowInfo = computeWindowValidity(parsed.windowStart, parsed.windowEnd, now, windowDaysMs);
  const sportMatch = parsed.sportKeyHint !== null;
  const windowMatch = windowInfo.valid;
  const teamMatch = true; // not applicable

  const { marketMatch } = evaluatePinned(parsed.pinned, null, { moneyline: [], extended: [] });
  const signals: MatchSignals = { sportMatch, windowMatch, teamMatch, marketMatch };

  if (sportMatch && windowMatch && marketMatch) {
    const scope: ScopeGuess = {
      kind: "sport_window",
      sportKey: parsed.sportKeyHint as string,
      windowStart: parsed.windowStart as string,
      windowEnd: parsed.windowEnd as string,
    };
    return { status: "matched", scope, pinned: null, signals };
  }

  const guess: ScopeGuess | null =
    parsed.sportKeyHint !== null && windowInfo.valid
      ? {
          kind: "sport_window",
          sportKey: parsed.sportKeyHint,
          windowStart: parsed.windowStart as string,
          windowEnd: parsed.windowEnd as string,
        }
      : null;

  return { status: "unmatched", signals, guess, unresolvedTeamTexts: [] };
}

function matchGameNamed(
  parsed: ScrapedPromo,
  events: { moneyline: OddsEvent[]; extended: OddsEvent[] },
  now: Date,
  windowDaysMs: number,
): MatchResult {
  const pool = buildPool(events, now, windowDaysMs, parsed.sportKeyHint);
  const knownTeams = knownTeamsFromPool(pool);

  const [textA, textB] = parsed.teamsText;
  const windowInfo = computeWindowValidity(parsed.windowStart, parsed.windowEnd, now, windowDaysMs);
  const { resolvedA, resolvedB } = narrowByOpponent(
    resolveTeam(textA, knownTeams, parsed.sportKeyHint),
    resolveTeam(textB, knownTeams, parsed.sportKeyHint),
    pool,
    windowInfo,
  );

  const unresolvedTeamTexts: string[] = [];
  if (resolvedA.length !== 1) unresolvedTeamTexts.push(textA);
  if (resolvedB.length !== 1) unresolvedTeamTexts.push(textB);

  if (unresolvedTeamTexts.length > 0) {
    return {
      status: "unmatched",
      signals: { sportMatch: false, windowMatch: false, teamMatch: false, marketMatch: false },
      guess: null,
      unresolvedTeamTexts,
    };
  }

  const teamA = resolvedA[0];
  const teamB = resolvedB[0];
  const candidateEvents = pool.filter((e) => eventMatchesTeamPair(e, teamA, teamB));
  const teamMatch = candidateEvents.length > 0;

  let filteredCandidates = candidateEvents;
  if (windowInfo.given && windowInfo.valid) {
    const startMs = windowInfo.start!.getTime();
    const endMs = windowInfo.end!.getTime();
    filteredCandidates = candidateEvents.filter((e) => {
      const c = new Date(e.commence_time).getTime();
      return c >= startMs && c <= endMs;
    });
  }
  const windowMatch = filteredCandidates.length === 1 && (!windowInfo.given || windowInfo.valid);
  const finalCandidate = windowMatch ? filteredCandidates[0] : null;

  const sportMatch = parsed.sportKeyHint !== null || finalCandidate !== null;

  const { marketMatch, selection } = evaluatePinned(parsed.pinned, finalCandidate, events);

  const signals: MatchSignals = { sportMatch, windowMatch, teamMatch, marketMatch };
  const matched = teamMatch && windowMatch && sportMatch && marketMatch;

  if (matched && finalCandidate !== null) {
    return { status: "matched", scope: eventScopeGuessOf(finalCandidate), pinned: selection, signals };
  }

  const guess = candidateEvents.length > 0 ? eventScopeGuessOf(earliestByCommence(candidateEvents)) : null;
  return { status: "unmatched", signals, guess, unresolvedTeamTexts: [] };
}

export function matchPromo(
  parsed: ScrapedPromo,
  events: { moneyline: OddsEvent[]; extended: OddsEvent[] },
  opts: { now: Date; windowDays?: number },
): MatchResult {
  const windowDaysMs = (opts.windowDays ?? DEFAULT_WINDOW_DAYS) * DAY_MS;

  if (parsed.teamsText.length === 0) {
    return matchSportWide(parsed, opts.now, windowDaysMs);
  }

  return matchGameNamed(parsed, events, opts.now, windowDaysMs);
}
