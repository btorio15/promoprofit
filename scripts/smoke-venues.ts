/**
 * Phase 12 Wave 0 probe: do kalshi / polymarket_us (us_ex region) come back
 * from The Odds API on our key, is the price the ask, are bet limits
 * returned, and what does Kalshi's own public REST look like?
 *
 * Usage: npm run venues:smoke [-- sportKey] [--dry-run] [--out=path.json]
 * --dry-run makes NO credit-spending Odds API request (free /sports and the
 * free unauthenticated Kalshi public calls still run).
 */
import { z } from "zod";
import { writeFileSync } from "node:fs";
import { configuredOddsKeys } from "../src/ingestion/odds/oddsKeys";
import { listSports, fetchSportOdds } from "../src/ingestion/odds/client";
import { SPORT_KEYS } from "../src/config/sports";
import type { OddsEvent } from "../src/domain/odds/schemas";

const WINDOW_DAYS = 7;
const VENUE_KEYS = ["kalshi", "polymarket_us"];
// Fixed hosts only (T-12-10). Tried in order; the first that answers wins.
const KALSHI_BASES = [
  "https://external-api.kalshi.com/trade-api/v2",
  "https://api.elections.kalshi.com/trade-api/v2",
] as const;

const report: Record<string, unknown> = {};
const lines: string[] = [];
function out(msg = "") {
  console.log(msg);
  lines.push(msg);
}

/** Implied probability in cents, half-up, from American odds (integer math). */
function impliedCents(american: number): number {
  const a = Math.abs(american);
  const num = american < 0 ? a * 100 : 100 * 100;
  const den = american < 0 ? a + 100 : american + 100;
  // half-up: floor((2*num + den) / (2*den))
  return Math.floor((2 * num + den) / (2 * den));
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const SeriesSchema = z.looseObject({
  series: z.array(z.looseObject({ ticker: z.string(), title: z.string().optional() })).nullable().optional(),
});
const MarketsSchema = z.looseObject({
  markets: z.array(z.looseObject({ ticker: z.string() })),
  cursor: z.string().optional(),
});
const OrderbookSchema = z.looseObject({
  orderbook_fp: z
    .looseObject({
      yes_dollars: z.array(z.tuple([z.string(), z.string()])).nullable().optional(),
      no_dollars: z.array(z.tuple([z.string(), z.string()])).nullable().optional(),
    })
    .optional(),
});

async function kalshiGet(base: string, path: string): Promise<unknown> {
  const res = await fetch(`${base}${path}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path.split("?")[0]}`);
  return res.json();
}

const SPORT_HINTS: Record<string, RegExp> = {
  americanfootball_nfl: /nfl/i,
  americanfootball_ncaaf: /ncaaf|college football/i,
  basketball_nba: /nba/i,
  basketball_ncaab: /ncaab|college basketball/i,
  baseball_mlb: /mlb/i,
  icehockey_nhl: /nhl/i,
};

// Expected game-winner series tickers (checked against the live /series list).
const PREFERRED_SERIES: Record<string, string> = {
  americanfootball_nfl: "KXNFLGAME",
  americanfootball_ncaaf: "KXNCAAFGAME",
  basketball_nba: "KXNBAGAME",
  basketball_ncaab: "KXNCAABGAME",
  baseball_mlb: "KXMLBGAME",
  icehockey_nhl: "KXNHLGAME",
};

function lastWord(team: string): string {
  const parts = team.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? "").toLowerCase();
}

async function kalshiRecon(sportKey: string, events: OddsEvent[]) {
  const recon: Record<string, unknown> = {};
  report.kalshi = recon;
  let base: string | null = null;
  let seriesList: { ticker: string; title?: string }[] = [];
  for (const b of KALSHI_BASES) {
    try {
      const parsed = SeriesSchema.parse(await kalshiGet(b, "/series?category=Sports"));
      base = b;
      seriesList = (parsed.series ?? []) as { ticker: string; title?: string }[];
      break;
    } catch (e) {
      out(`Kalshi base ${b} failed: ${errMsg(e)}`);
    }
  }
  recon.base_url = base;
  if (!base) {
    out("Kalshi recon: no reachable base URL.");
    return;
  }
  out(`\nKalshi base URL OK: ${base}`);
  out(`Sports series returned: ${seriesList.length}`);
  const gameLike = seriesList.filter((s) => /game|winner|moneyline|vs/i.test(`${s.ticker} ${s.title ?? ""}`));
  const mapped: Record<string, { ticker: string; title?: string }[]> = {};
  for (const [sk, re] of Object.entries(SPORT_HINTS)) {
    if (!SPORT_KEYS.includes(sk)) continue;
    mapped[sk] = gameLike.filter((s) => re.test(`${s.ticker} ${s.title ?? ""}`)).slice(0, 8);
    out(`  ${sk}: ${mapped[sk].map((s) => `${s.ticker} (${s.title ?? ""})`).join("; ") || "(none)"}`);
  }
  recon.series_candidates = mapped;
  const preferred: Record<string, string | null> = {};
  for (const [sk, t] of Object.entries(PREFERRED_SERIES)) {
    preferred[sk] = seriesList.some((s) => s.ticker === t) ? t : null;
  }
  recon.preferred_series_present = preferred;
  out(`Preferred game series present: ${JSON.stringify(preferred)}`);

  const hint = SPORT_HINTS[sportKey];
  const pref = PREFERRED_SERIES[sportKey];
  const prefHit = seriesList.find((s) => s.ticker === pref);
  const best = prefHit ?? (mapped[sportKey] ?? [])[0] ?? gameLike.find((s) => hint?.test(`${s.ticker} ${s.title ?? ""}`));
  if (!best) {
    out(`No game-winner series found for ${sportKey}.`);
    return;
  }
  out(`\nUsing series ${best.ticker} for ${sportKey}`);
  recon.series_used = best.ticker;
  let markets: z.infer<typeof MarketsSchema>["markets"] = [];
  try {
    markets = MarketsSchema.parse(
      await kalshiGet(base, `/markets?series_ticker=${encodeURIComponent(best.ticker)}&status=open&limit=200`),
    ).markets;
  } catch (e) {
    out(`Kalshi /markets failed: ${errMsg(e)}`);
    return;
  }
  out(`Open markets: ${markets.length}`);
  recon.market_fields = markets[0] ? Object.keys(markets[0]) : [];
  recon.market_samples = markets.slice(0, 3);
  for (const m of markets.slice(0, 3)) out(`  market: ${JSON.stringify(m)}`);

  // Cross-check Odds API kalshi quotes against native asks.
  let matched = 0;
  let within = 0;
  const samples: unknown[] = [];
  const withKalshi = events.filter((e) => e.bookmakers.some((b) => b.key === "kalshi")).slice(0, 5);
  for (const ev of withKalshi) {
    const book = ev.bookmakers.find((b) => b.key === "kalshi");
    const h2h = book?.markets.find((m) => m.key === "h2h");
    if (!h2h) continue;
    for (const o of h2h.outcomes) {
      const w = lastWord(o.name);
      const m = markets.find((mk) => {
        const hay = `${String(mk.title ?? "")} ${String(mk.yes_sub_title ?? "")}`.toLowerCase();
        return w && hay.includes(w);
      });
      if (!m) continue;
      try {
        const ob = OrderbookSchema.parse(await kalshiGet(base, `/markets/${encodeURIComponent(m.ticker)}/orderbook`));
        const no = ob.orderbook_fp?.no_dollars ?? [];
        const bestNo = no[no.length - 1];
        if (!bestNo) continue;
        const yesAskCents = Math.round((1 - Number(bestNo[0])) * 100);
        const oddsCents = impliedCents(o.price);
        matched += 1;
        if (Math.abs(yesAskCents - oddsCents) <= 1) within += 1;
        const sample = {
          event: `${ev.away_team} @ ${ev.home_team}`,
          outcome: o.name,
          ticker: m.ticker,
          odds_api_cents: oddsCents,
          native_yes_ask_dollars_field: m.yes_ask_dollars ?? null,
          native_yes_ask_cents_from_orderbook: yesAskCents,
          ask_size: bestNo[1],
        };
        samples.push(sample);
        out(`  ${JSON.stringify(sample)}`);
      } catch (e) {
        out(`  orderbook failed for ${m.ticker}: ${errMsg(e)}`);
      }
    }
  }
  recon.samples = samples;
  recon.matched = matched;
  recon.within_1c = within;
  out(`kalshi price matches ask: ${within} of ${matched} matched markets (within 1c)`);
}

async function main() {
  console.warn(
    "WARNING: this script spends REAL Odds API credits on the FIRST configured key and does NOT record them in credit_usage (the meter will not see this spend).",
  );
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run");
  const outPath = argv.find((a) => a.startsWith("--out="))?.slice("--out=".length);
  const requestedSport = argv.find((a) => !a.startsWith("--"));

  const apiKey = configuredOddsKeys()[0]?.key ?? "";
  if (!apiKey && !dryRun) {
    console.error("ODDS_API_KEY is not set");
    process.exit(1);
    return;
  }

  let sportKey = requestedSport;
  if (apiKey) {
    try {
      const sports = await listSports(apiKey);
      const active = sports.filter((s) => s.active && SPORT_KEYS.includes(s.key));
      out(`Active D-01 sports: ${active.map((s) => s.key).join(", ") || "(none)"}`);
      sportKey = requestedSport ?? active[0]?.key;
    } catch (e) {
      out(`listSports failed: ${errMsg(e)}`);
    }
  } else {
    out("No Odds API key configured; skipping /sports (dry-run).");
  }
  if (!sportKey) {
    console.error("No sportKey available.");
    process.exit(1);
    return;
  }
  report.sport_key = sportKey;

  const now = new Date();
  const to = new Date(now.getTime() + WINDOW_DAYS * 24 * 60 * 60 * 1000);
  let events: OddsEvent[] = [];

  out(`\nRequest: GET /v4/sports/${sportKey}/odds/ bookmakers=${VENUE_KEYS.join(",")} markets=h2h includeBetLimits=true window=${WINDOW_DAYS}d oddsFormat=american`);
  if (dryRun) {
    out("estimated cost: 1 credit (1 market x 1 bookmaker bucket)");
    out("--dry-run: skipping the credit-spending Odds API call.");
  } else {
    try {
      const res = await fetchSportOdds(
        sportKey,
        { bookmakerKeys: VENUE_KEYS, commenceTimeFrom: now, commenceTimeTo: to, markets: ["h2h"], includeBetLimits: true },
        apiKey,
      );
      events = res.events;
      out(`Quota: last=${res.quota.last} remaining=${res.quota.remaining} used=${res.quota.used}`);
      report.quota = res.quota;
      let k = 0;
      let p = 0;
      for (const ev of events) {
        out(`\n${ev.away_team} @ ${ev.home_team} (${ev.commence_time})`);
        const present = ev.bookmakers.map((b) => b.key);
        if (present.includes("kalshi")) k += 1;
        if (present.includes("polymarket_us")) p += 1;
        for (const b of ev.bookmakers) {
          out(`  bookmaker ${b.key}`);
          const { key: _k, title: _t, markets: _m, last_update: _l, ...bookExtra } = b;
          if (Object.keys(bookExtra).length) out(`    extra bookmaker fields: ${JSON.stringify(bookExtra)}`);
          for (const m of b.markets) {
            const { key: _mk, outcomes: _o, last_update: _ml, ...mktExtra } = m;
            if (Object.keys(mktExtra).length) out(`    extra market fields: ${JSON.stringify(mktExtra)}`);
            for (const o of m.outcomes) {
              const { name, price, point: _p, ...extra } = o;
              out(`    ${m.key} ${name}: ${price} (${impliedCents(price)}c)${Object.keys(extra).length ? ` extra=${JSON.stringify(extra)}` : ""}`);
            }
          }
        }
      }
      out(`\nevents=${events.length} with_kalshi=${k} with_polymarket_us=${p}`);
      report.counts = { events: events.length, kalshi: k, polymarket_us: p };
    } catch (e) {
      out(`Odds API call failed: ${errMsg(e)}`);
    }
  }

  try {
    await kalshiRecon(sportKey, events);
  } catch (e) {
    out(`Kalshi recon failed: ${errMsg(e)}`);
  }

  if (outPath) {
    writeFileSync(outPath, JSON.stringify({ ...report, printed: lines }, null, 2));
    out(`\nReport written to ${outPath}`);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("venues:smoke failed:", errMsg(err));
  process.exit(1);
});
