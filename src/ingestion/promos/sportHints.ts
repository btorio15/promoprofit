/**
 * Sport-hint resolution from promo title/description text or FanDuel's
 * `.tags` array. A promo whose sport can't be resolved is either
 * unsupported (the odds cache has no markets to hedge it, e.g. WNBA/NHL/
 * soccer/golf) -- reason `unsupported_sport`, always skipped -- or unknown
 * (e.g. a game-named promo where the two team names alone pin the sport
 * once matched against cached events, so no sport hint is needed here).
 *
 * Word-boundary regexes throughout so "WNBA" never matches NBA (the "NBA"
 * substring inside "WNBA" is never preceded by a word boundary, since the
 * two letters are adjacent word characters) -- unsupported sports are also
 * checked first as a second layer of the same guarantee.
 */

export type SportHint =
  | { kind: "supported"; sportKey: string }
  | { kind: "unsupported"; label: string }
  | { kind: "unknown" };

const UNSUPPORTED_TEXT_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\bwnba\b/i, "WNBA"],
  [/\bnhl\b/i, "NHL"],
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
  ["nhl", "NHL"],
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
