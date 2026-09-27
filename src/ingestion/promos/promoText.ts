/**
 * Shared team-pair helper for all three parsers. Recon's scope text uses
 * one of a handful of separators between the two team names; this never
 * guesses at team aliasing/matching (Plan 08's job) -- it only splits the
 * raw text into two trimmed strings, or returns null when the scope text
 * names no specific game (sport-wide/date-wide promos).
 */

const TEAM_DELIMITERS = [" vs. ", " vs ", " @ ", " at "];

export function splitTeams(scopeText: string): [string, string] | null {
  for (const delimiter of TEAM_DELIMITERS) {
    const index = scopeText.indexOf(delimiter);
    if (index === -1) continue;

    const first = scopeText.slice(0, index).trim();
    const second = scopeText.slice(index + delimiter.length).trim();
    if (first.length > 0 && second.length > 0) {
      return [first, second];
    }
  }

  return null;
}
