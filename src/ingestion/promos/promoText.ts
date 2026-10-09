/**
 * Shared team-pair helper for all three parsers. Recon's scope text uses
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
