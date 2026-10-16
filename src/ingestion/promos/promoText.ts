/**
 * Shared team-pair helpers for all three parsers (one game: splitTeams; a
 * list of games: splitGames). Recon's scope text uses
 * one of a handful of separators between the two team names; this never
 * guesses at team aliasing/matching (Plan 08's job) -- it only splits the
 * raw text into two trimmed strings, or returns null when the scope text
 * names no specific game (sport-wide/date-wide promos).
 */

const TEAM_DELIMITERS = [" vs. ", " vs ", " @ ", " at "];

/** Longest a single team name may be (longest real one, e.g. "Milwaukee Bucks" / "Texas A&M Aggies", is well under this). */
const MAX_TEAM_NAME_CHARS = 40;

/** Sentence punctuation or digit-percent wording never appears inside a real team name. */
const NON_TEAM_CHARS_RE = /[!?;:\n%$]/;

/** True when the text looks like a team name rather than a fragment of a sentence. */
export function isPlausibleTeamName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_TEAM_NAME_CHARS && !NON_TEAM_CHARS_RE.test(trimmed);
}

/** A league/sport label a book appends after the team ("Georgia @ Alabama College Football game"). */
const TRAILING_SPORT_RE =
  /\s+(?:college\s+football|college\s+basketball|ncaaf|ncaab|cfb|nfl|mlb|nhl|nba|wnba|football|baseball|hockey|basketball)$/i;

export function stripTrailingSport(name: string): string {
  const stripped = name.replace(TRAILING_SPORT_RE, "").trim();
  return stripped.length > 0 ? stripped : name;
}

export function splitTeams(scopeText: string): [string, string] | null {
  for (const delimiter of TEAM_DELIMITERS) {
    const index = scopeText.indexOf(delimiter);
    if (index === -1) continue;

    const first = stripTrailingSport(scopeText.slice(0, index).trim());
    const second = stripTrailingSport(scopeText.slice(index + delimiter.length).trim());
    if (isPlausibleTeamName(first) && isPlausibleTeamName(second)) {
      return [first, second];
    }
  }

  return null;
}

/** Most games one promo may list (matches ScopeGuessSchema / ScrapedPromoSchema). */
const MAX_LISTED_GAMES = 12;

/** Separators between games in a list; comma forms first so ", and" is one cut. */
const GAME_LIST_SEPARATOR_RE = /,\s+and\s+|,\s+or\s+|,\s+|\s+and\s+|\s+or\s+|\s+&\s+/i;

/** Trailing "[NFL] game(s) [on <date>]" a book appends after the list. */
const TRAILING_GAMES_RE =
  /\s+(?:(?:college\s+football|college\s+basketball|ncaaf|ncaab|cfb|nfl|mlb|nhl|nba|wnba|football|baseball|hockey|basketball)\s+)?games?(?:\s+on\s+[^\n]{1,60})?$/i;

/**
 * Splits "A @ B or C @ D" / "A @ B, C @ D and E @ F" (optionally prefixed
 * "the" and suffixed "NFL games on 10/18/2026") into team pairs. Fails closed:
 * null unless there are at least 2 pieces and EVERY piece is a plausible pair.
 * A single game stays with splitTeams. Does not dedupe (the matcher does).
 */
export function splitGames(scopeText: string): [string, string][] | null {
  let text = scopeText.trim().replace(/^the\s+/i, "");
  text = text.replace(TRAILING_GAMES_RE, "").trim();
  if (text.length === 0 || text.length > 400) return null;

  const pieces = text.split(GAME_LIST_SEPARATOR_RE).map((piece) => piece.trim());
  if (pieces.length < 2 || pieces.length > MAX_LISTED_GAMES) return null;

  const pairs: [string, string][] = [];
  for (const piece of pieces) {
    const pair = splitTeams(piece);
    if (pair === null) return null;
    pairs.push(pair);
  }
  return pairs;
}

/**
 * True when the text contains 2+ team-pair delimiters (" @ ", " vs. ", " vs ").
 * Deliberately NOT " at " ("at 8:20 PM"). Used to stop a promo that names
 * several games from ever being saved league-wide.
 */
export function mentionsSeveralGames(text: string): boolean {
  const matches = text.match(/ @ | vs\. | vs /gi);
  return matches !== null && matches.length >= 2;
}
