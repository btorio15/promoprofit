/**
 * Sport-hint resolution from promo title/description text or FanDuel's
 * `.tags` array. A promo whose sport can't be resolved is either
 * unsupported (the odds cache has no markets to hedge it, e.g. WNBA/soccer/
 * golf) -- reason `unsupported_sport`, always skipped -- or unknown (e.g. a
 * game-named promo where the two team names alone pin the sport once
 * matched against cached events, so no sport hint is needed here).
 * quick-260928-it1: NHL moved from unsupported to supported (icehockey_nhl).
 *
 * Word-boundary regexes throughout so "WNBA" never matches NBA (the "NBA"
 * substring inside "WNBA" is never preceded by a word boundary, since the
 * two letters are adjacent word characters) -- unsupported sports are also
 * checked first as a second layer of the same guarantee.
 */

import { TEAM_ALIASES, resolveTeam } from "@/domain/promos/aliases";

export type SportHint =
  | { kind: "supported"; sportKey: string }
  | { kind: "unsupported"; label: string }
  | { kind: "unknown" };

const UNSUPPORTED_TEXT_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\bwnba\b/i, "WNBA"],
  [/\bsoccer\b/i, "Soccer"],
  [/\bgolf\b/i, "Golf"],
  [/\btennis\b/i, "Tennis"],
  [/\b(?:mma|ufc)\b/i, "MMA/UFC"],
  [/\bhorse racing\b/i, "Horse Racing"],
  [/\bnascar\b/i, "NASCAR"],
];

// Order matters: check the more specific college keys before the bare
// pro-league keys so e.g. "College Football" never falls through to a
// broader match.
const SUPPORTED_TEXT_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\b(?:college football|cfb|ncaaf)\b/i, "americanfootball_ncaaf"],
  [/\b(?:college basketball|ncaab)\b/i, "basketball_ncaab"],
  [/\bnfl\b/i, "americanfootball_nfl"],
  [/\bnba\b/i, "basketball_nba"],
  [/\bmlb\b/i, "baseball_mlb"],
  [/\b(?:nhl|hockey)\b/i, "icehockey_nhl"],
];

export function sportFromText(text: string): SportHint {
  for (const [re, label] of UNSUPPORTED_TEXT_PATTERNS) {
    if (re.test(text)) return { kind: "unsupported", label };
  }
  for (const [re, sportKey] of SUPPORTED_TEXT_PATTERNS) {
    if (re.test(text)) return { kind: "supported", sportKey };
  }
  return { kind: "unknown" };
}

const UNSUPPORTED_TAGS: ReadonlyArray<[string, string]> = [
  ["wnba", "WNBA"],
  ["soccer", "Soccer"],
  ["golf", "Golf"],
  ["tennis", "Tennis"],
  ["mma", "MMA/UFC"],
  ["ufc", "MMA/UFC"],
  ["horse-racing", "Horse Racing"],
  ["nascar", "NASCAR"],
];

// Order matters: "ncaaf"/"ncaab" checked before the bare "nfl"/"nba" tags
// because FanDuel pairs the ambiguous "american-football" tag with the
// specific one (["american-football", "ncaaf"]) -- the specific tag wins.
const SUPPORTED_TAGS: ReadonlyArray<[string, string]> = [
  ["ncaaf", "americanfootball_ncaaf"],
  ["nfl", "americanfootball_nfl"],
  ["ncaab", "basketball_ncaab"],
  ["nba", "basketball_nba"],
  ["mlb", "baseball_mlb"],
  ["nhl", "icehockey_nhl"],
];

export function sportFromTags(tags: readonly string[]): SportHint {
  const lower = new Set(tags.map((t) => t.toLowerCase()));

  for (const [tag, label] of UNSUPPORTED_TAGS) {
    if (lower.has(tag)) return { kind: "unsupported", label };
  }
  for (const [tag, sportKey] of SUPPORTED_TAGS) {
    if (lower.has(tag)) return { kind: "supported", sportKey };
  }
  return { kind: "unknown" };
}

/**
 * Infers a supported sport from a resolved team-name pair, for single-game
 * promos whose own text never names a sport (DraftKings "for the A @ B
 * game on <date>" boosts -- real fixture 1126403, "LA Rams @ DEN Broncos
 * 50% Profit Boost"). A sport only qualifies when BOTH team texts resolve
 * to exactly one team in that sport's TEAM_ALIASES table, and exactly one
 * sport qualifies overall -- this never guesses. There are no ncaaf/ncaab
 * alias tables, so a college matchup always returns "unknown" here; that
 * is fine because the matcher (src/domain/promos/matcher.ts) resolves
 * teamsText against cached events independently of this hint.
 */
export function sportFromTeamPair(teamA: string, teamB: string): SportHint {
  const qualifying: string[] = [];
  for (const sportKey of Object.keys(TEAM_ALIASES)) {
    const aMatches = resolveTeam(teamA, [], sportKey);
    const bMatches = resolveTeam(teamB, [], sportKey);
    if (aMatches.length === 1 && bMatches.length === 1) {
      qualifying.push(sportKey);
    }
  }
  return qualifying.length === 1 ? { kind: "supported", sportKey: qualifying[0] } : { kind: "unknown" };
}
