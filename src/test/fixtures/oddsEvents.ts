import type { OddsEvent } from "@/domain/odds/schemas";

const DAY_MS = 24 * 60 * 60 * 1000;

function plusDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

/**
 * Odds-API-shaped fixture events for the finder's end-to-end test and the
 * market-filter/ranking unit tests. commence_time is always relative to the
 * `now` passed in, so the 7-day window (D-03) behaves deterministically.
 */
export function buildFixtureEvents(now: Date): OddsEvent[] {
  return [
    // (a) NBA Nuggets (home) vs Jazz (away), +1 day — three free-tier books, all 2-way.
    {
      id: "nba-nuggets-jazz",
      sport_key: "basketball_nba",
      sport_title: "NBA",
      commence_time: plusDays(now, 1),
      home_team: "Denver Nuggets",
      away_team: "Utah Jazz",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Utah Jazz", price: 300 },
                { name: "Denver Nuggets", price: -400 },
              ],
            },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Utah Jazz", price: 250 },
                { name: "Denver Nuggets", price: -275 },
              ],
            },
          ],
        },
        {
          key: "betmgm",
          title: "BetMGM",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Utah Jazz", price: 280 },
                { name: "Denver Nuggets", price: -330 },
              ],
            },
          ],
        },
      ],
    },

    // (b) MLB Dodgers (home) vs Rockies (away), +2 days.
    {
      id: "mlb-dodgers-rockies",
      sport_key: "baseball_mlb",
      sport_title: "MLB",
      commence_time: plusDays(now, 2),
      home_team: "Los Angeles Dodgers",
      away_team: "Colorado Rockies",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Colorado Rockies", price: 290 },
                { name: "Los Angeles Dodgers", price: -300 },
              ],
            },
          ],
        },
        {
          key: "hardrockbet",
          title: "Hard Rock Bet",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Colorado Rockies", price: 240 },
                { name: "Los Angeles Dodgers", price: -310 },
              ],
            },
          ],
        },
      ],
    },

    // (c) NFL Packers (home) vs Panthers (away), +3 days — tieRisk sport.
    {
      id: "nfl-packers-panthers",
      sport_key: "americanfootball_nfl",
      sport_title: "NFL",
      commence_time: plusDays(now, 3),
      home_team: "Green Bay Packers",
      away_team: "Carolina Panthers",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Carolina Panthers", price: 380 },
                { name: "Green Bay Packers", price: -500 },
              ],
            },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Carolina Panthers", price: 330 },
                { name: "Green Bay Packers", price: -420 },
              ],
            },
          ],
        },
      ],
    },

    // (d) NBA Celtics (home) vs Heat (away), +9 days — outside the 7-day window (D-03), excluded.
    {
      id: "nba-celtics-heat",
      sport_key: "basketball_nba",
      sport_title: "NBA",
      commence_time: plusDays(now, 9),
      home_team: "Boston Celtics",
      away_team: "Miami Heat",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Miami Heat", price: 150 },
                { name: "Boston Celtics", price: -180 },
              ],
            },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Miami Heat", price: 140 },
                { name: "Boston Celtics", price: -165 },
              ],
            },
          ],
        },
      ],
    },

    // (e) NBA Lakers (home) vs Warriors (away), +1 day — draftkings h2h has a
    // 3rd "Draw" outcome (dropped by the market filter); fanduel's valid
    // 2-way market survives. With bonus book draftkings this game is
    // skipped entirely (no draftkings quote survives the filter).
    {
      id: "nba-lakers-warriors",
      sport_key: "basketball_nba",
      sport_title: "NBA",
      commence_time: plusDays(now, 1),
      home_team: "Los Angeles Lakers",
      away_team: "Golden State Warriors",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Golden State Warriors", price: 120 },
                { name: "Los Angeles Lakers", price: -140 },
                { name: "Draw", price: 1000 },
              ],
            },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Golden State Warriors", price: 115 },
                { name: "Los Angeles Lakers", price: -135 },
              ],
            },
          ],
        },
      ],
    },
  ];
}
