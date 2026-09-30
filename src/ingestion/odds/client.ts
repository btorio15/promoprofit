/**
 * Thin, quota-aware Odds API v4 REST client (ODDS-01, ODDS-05). Server-only:
 * reads ODDS_API_KEY from process.env at call time (never NEXT_PUBLIC_), and
 * never lets the key reach a thrown error message or the browser bundle
 * (T-01-13). Every response is validated with the shared Zod schemas before
 * being trusted (T-01-14).
 */
import {
  SportListSchema,
  OddsEventListSchema,
  OddsEventSchema,
  type Sport,
  type OddsEvent,
} from "@/domain/odds/schemas";

const BASE_URL = "https://api.the-odds-api.com/v4";

export interface QuotaHeaders {
  remaining: number | null;
  used: number | null;
  last: number | null;
}

export class OddsApiError extends Error {
  status: number | null;

  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "OddsApiError";
    this.status = status;
  }
}

function getApiKey(): string {
  const key = process.env.ODDS_API_KEY;
  if (!key) {
    throw new Error("ODDS_API_KEY is not set");
  }
  return key;
}

function parseIntHeader(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Parses the Odds API's x-requests-* quota headers; an absent header -> null. */
export function parseQuotaHeaders(headers: Headers): QuotaHeaders {
  return {
    remaining: parseIntHeader(headers.get("x-requests-remaining")),
    used: parseIntHeader(headers.get("x-requests-used")),
    last: parseIntHeader(headers.get("x-requests-last")),
  };
}

/** YYYY-MM-DDTHH:MM:SSZ (no milliseconds), per the Odds API's dateFormat=iso contract. */
function formatDateParam(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** GET /v4/sports/ -- zero-credit cost. Used for D-04's in-season check. */
export async function listSports(): Promise<Sport[]> {
  const apiKey = getApiKey();
  const url = new URL(`${BASE_URL}/sports/`);
  url.searchParams.set("apiKey", apiKey);

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new OddsApiError("Odds API request failed for /sports");
  }

  if (!res.ok) {
    throw new OddsApiError("Odds API returned an error for /sports", res.status);
  }

  const body = await res.json();
  const parsed = SportListSchema.safeParse(body);
  if (!parsed.success) {
    throw new OddsApiError("Odds API returned an unexpected response shape", res.status);
  }

  return parsed.data;
}

export interface FetchSportOddsOptions {
  bookmakerKeys: string[];
  commenceTimeFrom: Date;
  commenceTimeTo: Date;
  /** Defaults to ["h2h"] (SC1: the normal refresh never requests extra markets). */
  markets?: readonly string[];
}

/**
 * GET /v4/sports/{sportKey}/odds/ -- markets defaults to h2h only (D-02),
 * american odds, bookmakers= the given CO book keys (D-15). Cost =
 * [number of markets] x ceil(bookmakers/10) credits (D-14) -- e.g. 3x a
 * normal refresh when markets is ["h2h","spreads","totals"].
 */
export async function fetchSportOdds(
  sportKey: string,
  opts: FetchSportOddsOptions,
): Promise<{ events: OddsEvent[]; quota: QuotaHeaders }> {
  const apiKey = getApiKey();
  const url = new URL(`${BASE_URL}/sports/${sportKey}/odds/`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("bookmakers", opts.bookmakerKeys.join(","));
  url.searchParams.set("markets", (opts.markets ?? ["h2h"]).join(","));
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("dateFormat", "iso");
  url.searchParams.set("commenceTimeFrom", formatDateParam(opts.commenceTimeFrom));
  url.searchParams.set("commenceTimeTo", formatDateParam(opts.commenceTimeTo));

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new OddsApiError(`Odds API request failed for /sports/${sportKey}/odds`);
  }

  const quota = parseQuotaHeaders(res.headers);

  if (!res.ok) {
    throw new OddsApiError(`Odds API returned an error for /sports/${sportKey}/odds`, res.status);
  }

  const body = await res.json();
  const parsed = OddsEventListSchema.safeParse(body);
  if (!parsed.success) {
    throw new OddsApiError("Odds API returned an unexpected response shape", res.status);
  }

  return { events: parsed.data, quota };
}

export interface FetchEventOddsOptions {
  bookmakerKeys: string[];
  markets: readonly string[];
}

/**
 * GET /v4/sports/{sportKey}/events/{eventId}/odds -- the per-event endpoint
 * required for additional markets such as alternate_spreads. Cost = unique
 * markets returned x ceil(bookmakers/10); an empty response costs 0, so
 * 1 credit per event with the 7 free-tier books. A 404 (event gone) yields
 * event: null rather than an error. Error messages never include the URL
 * or the api key (T-01-13).
 */
export async function fetchEventOdds(
  sportKey: string,
  eventId: string,
  opts: FetchEventOddsOptions,
): Promise<{ event: OddsEvent | null; quota: QuotaHeaders }> {
  const apiKey = getApiKey();
  const url = new URL(`${BASE_URL}/sports/${sportKey}/events/${encodeURIComponent(eventId)}/odds`);
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("bookmakers", opts.bookmakerKeys.join(","));
  url.searchParams.set("markets", opts.markets.join(","));
  url.searchParams.set("oddsFormat", "american");
  url.searchParams.set("dateFormat", "iso");

  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store" });
  } catch {
    throw new OddsApiError(`Odds API request failed for /sports/${sportKey}/events/odds`);
  }

  const quota = parseQuotaHeaders(res.headers);

  if (res.status === 404) {
    return { event: null, quota };
  }
  if (!res.ok) {
    throw new OddsApiError(`Odds API returned an error for /sports/${sportKey}/events/odds`, res.status);
  }

  const body = await res.json();
  const parsed = OddsEventSchema.safeParse(body);
  if (!parsed.success) {
    throw new OddsApiError("Odds API returned an unexpected response shape", res.status);
  }

  return { event: parsed.data, quota };
}
