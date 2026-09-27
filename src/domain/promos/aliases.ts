/**
 * Curated team-alias table and deterministic name resolution (D-10; 03-
 * RESEARCH.md "Matching & Confidence Scoring" / "Why not a fuzzy library";
 * 03-RECON.md Observed Promos team text as the books show it, e.g. "LA
 * Rams vs. DEN Broncos", "BAL Ravens vs. DAL Cowboys"). The team/alias
 * space is small and fully known ahead of time (5 configured sports, on
 * the order of 30-100 active teams) -- a hand-curated, hand-tested lookup
 * table beats a general fuzzy-string library on both correctness and
 * testability, and cannot produce a "close enough" false positive the way
 * a numeric edit-distance cutoff can. Pure, zero-I/O.
 *
 * Never add a city alias shared by two teams within one league -- the
 * only exception is "LA"/"Los Angeles" and "NY"/"New York", which really
 * are shared by two teams in some leagues (NFL Rams/Chargers, NFL
 * Giants/Jets, MLB Angels/Dodgers, MLB Mets/Yankees); those are
 * deliberately registered on BOTH teams so a bare "LA"/"NY" resolves
 * ambiguously (2 names, caller fails it) while a compound "LA Rams"/"NY
 * Jets" still resolves via the abbreviation+nickname split rule below.
 */

/** sportKey -> canonical Odds API team name -> aliases (nickname, city when unique, standard abbreviation, common short forms). */
export const TEAM_ALIASES: Readonly<Record<string, Readonly<Record<string, readonly string[]>>>> = {
  americanfootball_nfl: {
    "Arizona Cardinals": ["Cardinals", "Arizona", "ARI"],
    "Atlanta Falcons": ["Falcons", "Atlanta", "ATL"],
    "Baltimore Ravens": ["Ravens", "Baltimore", "BAL"],
    "Buffalo Bills": ["Bills", "Buffalo", "BUF"],
    "Carolina Panthers": ["Panthers", "Carolina", "CAR"],
    "Chicago Bears": ["Bears", "Chicago", "CHI"],
    "Cincinnati Bengals": ["Bengals", "Cincinnati", "CIN"],
    "Cleveland Browns": ["Browns", "Cleveland", "CLE"],
    "Dallas Cowboys": ["Cowboys", "Dallas", "DAL"],
    "Denver Broncos": ["Broncos", "Denver", "DEN"],
    "Detroit Lions": ["Lions", "Detroit", "DET"],
    "Green Bay Packers": ["Packers", "Green Bay", "GB"],
    "Houston Texans": ["Texans", "Houston", "HOU"],
    "Indianapolis Colts": ["Colts", "Indianapolis", "IND"],
    "Jacksonville Jaguars": ["Jaguars", "Jacksonville", "JAX"],
    "Kansas City Chiefs": ["Chiefs", "Kansas City", "KC"],
    "Las Vegas Raiders": ["Raiders", "Las Vegas", "LV"],
    "Los Angeles Chargers": ["Chargers", "LA", "Los Angeles", "LAC"],
    "Los Angeles Rams": ["Rams", "LA", "Los Angeles", "LAR"],
    "Miami Dolphins": ["Dolphins", "Miami", "MIA"],
    "Minnesota Vikings": ["Vikings", "Minnesota", "MIN"],
    "New England Patriots": ["Patriots", "New England", "NE", "Pats"],
    "New Orleans Saints": ["Saints", "New Orleans", "NO"],
    "New York Giants": ["Giants", "NY", "New York", "NYG"],
    "New York Jets": ["Jets", "NY", "New York", "NYJ"],
    "Philadelphia Eagles": ["Eagles", "Philadelphia", "PHI", "Philly"],
    "Pittsburgh Steelers": ["Steelers", "Pittsburgh", "PIT"],
    "San Francisco 49ers": ["49ers", "San Francisco", "SF", "Niners"],
    "Seattle Seahawks": ["Seahawks", "Seattle", "SEA"],
    "Tampa Bay Buccaneers": ["Buccaneers", "Tampa Bay", "TB", "Bucs"],
    "Tennessee Titans": ["Titans", "Tennessee", "TEN"],
    "Washington Commanders": ["Commanders", "Washington", "WAS"],
  },
  basketball_nba: {
    "Atlanta Hawks": ["Hawks", "Atlanta", "ATL"],
    "Boston Celtics": ["Celtics", "Boston", "BOS"],
    "Brooklyn Nets": ["Nets", "Brooklyn", "BKN"],
    "Charlotte Hornets": ["Hornets", "Charlotte", "CHA"],
    "Chicago Bulls": ["Bulls", "Chicago", "CHI"],
    "Cleveland Cavaliers": ["Cavaliers", "Cleveland", "CLE", "Cavs"],
    "Dallas Mavericks": ["Mavericks", "Dallas", "DAL", "Mavs"],
    "Denver Nuggets": ["Nuggets", "Denver", "DEN"],
    "Detroit Pistons": ["Pistons", "Detroit", "DET"],
    "Golden State Warriors": ["Warriors", "Golden State", "GSW"],
    "Houston Rockets": ["Rockets", "Houston", "HOU"],
    "Indiana Pacers": ["Pacers", "Indiana", "IND"],
    "LA Clippers": ["Clippers", "LAC"],
    "Los Angeles Lakers": ["Lakers", "LA", "Los Angeles", "LAL"],
    "Memphis Grizzlies": ["Grizzlies", "Memphis", "MEM"],
    "Miami Heat": ["Heat", "Miami", "MIA"],
    "Milwaukee Bucks": ["Bucks", "Milwaukee", "MIL"],
    "Minnesota Timberwolves": ["Timberwolves", "Minnesota", "MIN", "Wolves"],
    "New Orleans Pelicans": ["Pelicans", "New Orleans", "NOP"],
    "New York Knicks": ["Knicks", "NY", "New York", "NYK"],
    "Oklahoma City Thunder": ["Thunder", "Oklahoma City", "OKC"],
    "Orlando Magic": ["Magic", "Orlando", "ORL"],
    "Philadelphia 76ers": ["76ers", "Philadelphia", "PHI", "Sixers"],
    "Phoenix Suns": ["Suns", "Phoenix", "PHX"],
    "Portland Trail Blazers": ["Trail Blazers", "Blazers", "Portland", "POR"],
    "Sacramento Kings": ["Kings", "Sacramento", "SAC"],
    "San Antonio Spurs": ["Spurs", "San Antonio", "SAS"],
    "Toronto Raptors": ["Raptors", "Toronto", "TOR"],
    "Utah Jazz": ["Jazz", "Utah", "UTA"],
    "Washington Wizards": ["Wizards", "Washington", "WAS"],
  },
  baseball_mlb: {
    "Arizona Diamondbacks": ["Diamondbacks", "Arizona", "ARI", "D-backs"],
    "Atlanta Braves": ["Braves", "Atlanta", "ATL"],
    "Baltimore Orioles": ["Orioles", "Baltimore", "BAL", "O's"],
    "Boston Red Sox": ["Red Sox", "Boston", "BOS"],
    "Chicago Cubs": ["Cubs", "CHC"],
    "Chicago White Sox": ["White Sox", "CWS"],
    "Cincinnati Reds": ["Reds", "Cincinnati", "CIN"],
    "Cleveland Guardians": ["Guardians", "Cleveland", "CLE"],
    "Colorado Rockies": ["Rockies", "Colorado", "COL"],
    "Detroit Tigers": ["Tigers", "Detroit", "DET"],
    "Houston Astros": ["Astros", "Houston", "HOU"],
    "Kansas City Royals": ["Royals", "Kansas City", "KC"],
    "Los Angeles Angels": ["Angels", "LA", "Los Angeles", "LAA"],
    "Los Angeles Dodgers": ["Dodgers", "LA", "Los Angeles", "LAD"],
    "Miami Marlins": ["Marlins", "Miami", "MIA"],
    "Milwaukee Brewers": ["Brewers", "Milwaukee", "MIL"],
    "Minnesota Twins": ["Twins", "Minnesota", "MIN"],
    "New York Mets": ["Mets", "NY", "New York", "NYM"],
    "New York Yankees": ["Yankees", "NY", "New York", "NYY"],
    Athletics: ["A's", "Oakland", "ATH"],
    "Philadelphia Phillies": ["Phillies", "Philadelphia", "PHI", "Philly"],
    "Pittsburgh Pirates": ["Pirates", "Pittsburgh", "PIT"],
    "San Diego Padres": ["Padres", "San Diego", "SD"],
    "San Francisco Giants": ["Giants", "San Francisco", "SF"],
    "Seattle Mariners": ["Mariners", "Seattle", "SEA"],
    "St. Louis Cardinals": ["Cardinals", "St. Louis", "St Louis", "STL"],
    "Tampa Bay Rays": ["Rays", "Tampa Bay", "TB"],
    "Texas Rangers": ["Rangers", "Texas", "TEX"],
    "Toronto Blue Jays": ["Blue Jays", "Toronto", "TOR"],
    "Washington Nationals": ["Nationals", "Washington", "WAS", "Nats"],
  },
};

/** Trims, lowercases, strips periods, collapses whitespace, drops a leading "the ". */
export function normalizeTeamText(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\s+/g, " ")
    .replace(/^the\s+/, "")
    .trim();
}

function inScope<T extends { sportKey: string }>(items: readonly T[], sportKey: string | null): readonly T[] {
  return sportKey === null ? items : items.filter((t) => t.sportKey === sportKey);
}

function aliasTablesInScope(
  sportKey: string | null,
): Array<{ sportKey: string; canonical: string; aliases: readonly string[] }> {
  const sportKeys = sportKey !== null ? [sportKey] : Object.keys(TEAM_ALIASES);
  const out: Array<{ sportKey: string; canonical: string; aliases: readonly string[] }> = [];
  for (const sk of sportKeys) {
    const table = TEAM_ALIASES[sk];
    if (!table) continue;
    for (const [canonical, aliases] of Object.entries(table)) {
      out.push({ sportKey: sk, canonical, aliases });
    }
  }
  return out;
}

/** Step 1: exact normalized match against knownTeams in scope. */
function exactMatch(
  normalized: string,
  knownTeams: readonly { sportKey: string; name: string }[],
  sportKey: string | null,
): string[] {
  const scoped = inScope(knownTeams, sportKey);
  const matches = new Set<string>();
  for (const t of scoped) {
    if (normalizeTeamText(t.name) === normalized) matches.add(t.name);
  }
  return [...matches];
}

/** Step 2: TEAM_ALIASES lookup of the whole normalized text. */
function aliasLookup(normalized: string, sportKey: string | null): string[] {
  const matches = new Set<string>();
  for (const { canonical, aliases } of aliasTablesInScope(sportKey)) {
    if (aliases.some((a) => normalizeTeamText(a) === normalized)) {
      matches.add(canonical);
    }
  }
  return [...matches];
}

/**
 * Step 4: a known team (in scope) whose normalized name starts with
 * `${normalized} ` or ends with ` ${normalized}`. All matches are
 * returned (not just when there's exactly one) -- ambiguity (length > 1)
 * is a caller-visible failure signal, never silently narrowed to [].
 */
function affixMatch(
  normalized: string,
  knownTeams: readonly { sportKey: string; name: string }[],
  sportKey: string | null,
): string[] {
  if (normalized.length === 0) return [];
  const scoped = inScope(knownTeams, sportKey);
  const matches = new Set<string>();
  for (const t of scoped) {
    const n = normalizeTeamText(t.name);
    if (n.startsWith(`${normalized} `) || n.endsWith(` ${normalized}`)) matches.add(t.name);
  }
  return [...matches];
}

/**
 * Step 3: abbreviation+nickname split. "<token> <rest>" resolves when
 * <rest> alone resolves to exactly one team and <token> alone resolves to
 * a set that includes that same team (covers both a token that's globally
 * unambiguous, like "DEN", and one that's a shared alias like "LA" that's
 * only unambiguous once paired with the nickname).
 */
function splitMatch(
  text: string,
  knownTeams: readonly { sportKey: string; name: string }[],
  sportKey: string | null,
): string[] {
  const parts = text.trim().split(/\s+/);
  if (parts.length < 2) return [];

  const token = parts[0];
  const rest = parts.slice(1).join(" ");

  const restMatches = resolveTeam(rest, knownTeams, sportKey);
  if (restMatches.length !== 1) return [];
  const team = restMatches[0];

  const tokenMatches = resolveTeam(token, knownTeams, sportKey);
  if (tokenMatches.includes(team)) return [team];

  return [];
}

/**
 * Resolves scraped team text to zero or more canonical Odds API team
 * names, in strict priority order (exact match > alias lookup >
 * abbreviation+nickname split > unique-affix), returning the first
 * step's result once any step matches. The caller must treat a result of
 * length !== 1 as a failure (0 = unknown, 2+ = ambiguous) -- this function
 * never guesses. No fuzzy/edit-distance matching (RESEARCH.md Don't Hand-
 * Roll, Anti-Pattern 2).
 */
export function resolveTeam(
  text: string,
  knownTeams: readonly { sportKey: string; name: string }[],
  sportKey: string | null,
): string[] {
  const normalized = normalizeTeamText(text);
  if (normalized.length === 0) return [];

  const exact = exactMatch(normalized, knownTeams, sportKey);
  if (exact.length > 0) return exact;

  const alias = aliasLookup(normalized, sportKey);
  if (alias.length > 0) return alias;

  const split = splitMatch(text, knownTeams, sportKey);
  if (split.length > 0) return split;

  return affixMatch(normalized, knownTeams, sportKey);
}
