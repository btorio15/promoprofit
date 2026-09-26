import type { OddsEvent } from "@/domain/odds/schemas";

const DAY_MS = 24 * 60 * 60 * 1000;

function plusDays(now: Date, days: number): string {
  return new Date(now.getTime() + days * DAY_MS).toISOString();
}

/**
 * cached_odds-shaped (h2h only) fixture events for findArbs's moneyline-arb
 * path (SC1). commence_time is always relative to the `now` passed in, same
 * convention as src/test/fixtures/oddsEvents.ts.
 */
export function buildArbFixtureEvents(now: Date): OddsEvent[] {
  return [
    // (a) NBA: away Utah Jazz +120 at fanduel, home Denver Nuggets -105 at
    // betmgm is the unique best cross-book pair (impliedSum 436/451,
    // ~0.966740); draftkings quotes worse on both sides and every other
    // cross-book combination is >= 1 (verified by hand). At a $200 total
    // stake this yields stakeA "94.00"/stakeB "106.00"/guaranteedProfit
    // "6.80" (whole dollars) and stakeA "94.03"/stakeB "105.96"/
    // guaranteedProfit "6.87" (exact cents).
    {
      id: "nba-jazz-nuggets-arb",
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
                { name: "Utah Jazz", price: 100 },
                { name: "Denver Nuggets", price: -120 },
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
                { name: "Utah Jazz", price: 120 },
                { name: "Denver Nuggets", price: -110 },
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
                { name: "Utah Jazz", price: 110 },
                { name: "Denver Nuggets", price: -105 },
              ],
            },
          ],
        },
      ],
    },

    // (b) NFL: draftkings has the individually-best price on BOTH sides
    // (away +200, home -150) -- but D-06 forbids pairing a book with
    // itself, so the actual best pair crosses books: draftkings-away
    // (+200) with fanduel-home (-160), impliedSum ~0.948718. This proves
    // rankArbs doesn't accidentally let the same book fill both legs.
    {
      id: "nfl-dolphins-jets-arb",
      sport_key: "americanfootball_nfl",
      sport_title: "NFL",
      commence_time: plusDays(now, 2),
      home_team: "New York Jets",
      away_team: "Miami Dolphins",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "h2h",
              outcomes: [
                { name: "Miami Dolphins", price: 200 },
                { name: "New York Jets", price: -150 },
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
                { name: "Miami Dolphins", price: 180 },
                { name: "New York Jets", price: -160 },
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
                { name: "Miami Dolphins", price: 160 },
                { name: "New York Jets", price: -170 },
              ],
            },
          ],
        },
      ],
    },

    // (c) MLB: no arb -- every cross-book combination has an implied sum
    // >= 1 (verified by hand: draftkings-away/fanduel-home = 1.055556,
    // fanduel-away/draftkings-home = 1.033259).
    {
      id: "mlb-rockies-dodgers-noarb",
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
                { name: "Colorado Rockies", price: 100 },
                { name: "Los Angeles Dodgers", price: -120 },
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
                { name: "Colorado Rockies", price: 105 },
                { name: "Los Angeles Dodgers", price: -125 },
              ],
            },
          ],
        },
      ],
    },
  ];
}

/**
 * cached_extended_odds-shaped fixture events (h2h absent, spreads/totals
 * present with point fields) for findArbs's spreads/totals merge path
 * (D-08, D-15, D-16).
 */
export function buildArbExtendedFixtureEvents(now: Date): OddsEvent[] {
  return [
    // (d) NCAAF half-point spread arb: away Tech University +3.5 (tied at
    // draftkings and betmgm, both price +105) against home State
    // University -3.5 at fanduel (-102). impliedSum ~0.992856 for either
    // (draftkings-away, fanduel-home) or (betmgm-away, fanduel-home) --
    // findBestArbPair's alphabetical tiebreak picks betmgm as sideA, and
    // the other tied book (draftkings) surfaces as a "Multiple books" tie
    // on side A (D-07). A separate whole-number-line spread market
    // (home -3 / away +3) below must never surface as an arb (D-08).
    {
      id: "ncaaf-spread-arb-d",
      sport_key: "americanfootball_ncaaf",
      sport_title: "NCAAF",
      commence_time: plusDays(now, 2),
      home_team: "State University",
      away_team: "Tech University",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "spreads",
              outcomes: [
                { name: "Tech University", price: 105, point: 3.5 },
                { name: "State University", price: -125, point: -3.5 },
              ],
            },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "spreads",
              outcomes: [
                { name: "Tech University", price: 100, point: 3.5 },
                { name: "State University", price: -102, point: -3.5 },
              ],
            },
          ],
        },
        {
          key: "betmgm",
          title: "BetMGM",
          markets: [
            {
              key: "spreads",
              outcomes: [
                { name: "Tech University", price: 105, point: 3.5 },
                { name: "State University", price: -110, point: -3.5 },
              ],
            },
          ],
        },
      ],
    },

    // (e) NCAAB Over/Under 44.5 arb: draftkings Over 44.5 (+105) against
    // fanduel Under 44.5 (-102), impliedSum ~0.992856. draftkings also
    // quotes a whole-number spread (home -3 / away +3) on the same event,
    // which extractTwoWaySpreadsAndTotals must exclude entirely (D-08) --
    // no arb row should ever be produced for it, tied or otherwise.
    {
      id: "ncaab-total-arb-e",
      sport_key: "basketball_ncaab",
      sport_title: "NCAAB",
      commence_time: plusDays(now, 2),
      home_team: "Home College",
      away_team: "Away College",
      bookmakers: [
        {
          key: "draftkings",
          title: "DraftKings",
          markets: [
            {
              key: "totals",
              outcomes: [
                { name: "Over", price: 105, point: 44.5 },
                { name: "Under", price: -125, point: 44.5 },
              ],
            },
            {
              key: "spreads",
              outcomes: [
                { name: "Away College", price: -110, point: 3 },
                { name: "Home College", price: -110, point: -3 },
              ],
            },
          ],
        },
        {
          key: "fanduel",
          title: "FanDuel",
          markets: [
            {
              key: "totals",
              outcomes: [
                { name: "Over", price: 100, point: 44.5 },
                { name: "Under", price: -102, point: 44.5 },
              ],
            },
          ],
        },
      ],
    },
  ];
}
