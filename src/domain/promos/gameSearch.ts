import { TEAM_ALIASES, normalizeTeamText } from "./aliases";
import { getSportLabel } from "@/config/sports";
import { etDayLabel } from "./etTime";
import type { CorrectionEventOption } from "./correctionOptions";

/**
 * quick-260929-hht: pure game search + grouping for the review picker.
 * Owner: "it just needs to be easier to search for a game or define a date
 * range. one dropdown doesnt work". Zero-I/O; the search text is built once in
 * listCorrectionOptions and never leaves the client.
 */

/** Lowercase, accent-stripped, punctuation-free, single-spaced. */
export function normalizeSearchText(text: string): string {
  const stripped = text.normalize("NFD").replace(/[̀-ͯ]/g, "");
  return normalizeTeamText(stripped)
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Normalized, de-duplicated words: team names, exact-key aliases, league label. */
export function eventSearchText(sportKey: string, homeTeam: string, awayTeam: string): string {
  const table = TEAM_ALIASES[sportKey];
  const parts = [
    homeTeam,
    awayTeam,
    ...(table?.[homeTeam] ?? []),
    ...(table?.[awayTeam] ?? []),
    getSportLabel(sportKey),
  ];
  const words = new Set<string>();
  for (const part of parts) {
    for (const word of normalizeSearchText(part).split(" ")) {
      if (word) words.add(word);
    }
  }
  return [...words].join(" ");
}

const STOP_TOKENS = new Set(["vs", "v", "at"]);

/** Keeps events where every query token is a prefix of some searchText word. Order preserved. */
export function searchEventOptions<T extends { searchText: string }>(
  events: readonly T[],
  query: string,
): T[] {
  const tokens = normalizeSearchText(query)
    .split(" ")
    .filter((t) => t !== "" && !STOP_TOKENS.has(t));
  if (tokens.length === 0) return [...events];

  return events.filter((event) => {
    const words = event.searchText.split(" ");
    return tokens.every((token) => words.some((word) => word.startsWith(token)));
  });
}

export interface EventDayGroup {
  etDate: string;
  dayLabel: string;
  events: CorrectionEventOption[];
}

export interface EventLeagueGroup {
  sportKey: string;
  sportLabel: string;
  days: EventDayGroup[];
}

/** Groups (already sport-then-commence sorted) events by league, then ET day, in input order. */
export function groupEventOptions(events: readonly CorrectionEventOption[]): EventLeagueGroup[] {
  const leagues = new Map<string, EventLeagueGroup>();

  for (const event of events) {
    let league = leagues.get(event.sportKey);
    if (!league) {
      league = { sportKey: event.sportKey, sportLabel: event.sportLabel, days: [] };
      leagues.set(event.sportKey, league);
    }
    let day = league.days.find((d) => d.etDate === event.etDate);
    if (!day) {
      day = { etDate: event.etDate, dayLabel: etDayLabel(event.commenceTime), events: [] };
      league.days.push(day);
    }
    day.events.push(event);
  }

  return [...leagues.values()];
}
