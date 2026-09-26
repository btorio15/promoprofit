import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SENTINEL_KEY = "test-key-SENTINEL";

function makeSportsResponse(): Response {
  return new Response(
    JSON.stringify([
      { key: "basketball_nba", group: "Basketball", title: "NBA", active: true },
      { key: "icehockey_nhl", group: "Hockey", title: "NHL", active: false },
    ]),
    { status: 200 },
  );
}

function makeOddsResponse(
  headers: Record<string, string> = {
    "x-requests-remaining": "480",
    "x-requests-used": "20",
    "x-requests-last": "1",
  },
): Response {
  return new Response(
    JSON.stringify([
      {
        id: "evt1",
        sport_key: "basketball_nba",
        commence_time: "2026-10-01T00:00:00Z",
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
                  { name: "Denver Nuggets", price: -275 },
                  { name: "Utah Jazz", price: 300 },
                ],
              },
            ],
          },
        ],
      },
    ]),
    { status: 200, headers },
  );
}

describe("client (Odds API v4 wrapper)", () => {
  const originalKey = process.env.ODDS_API_KEY;

  beforeEach(() => {
    process.env.ODDS_API_KEY = SENTINEL_KEY;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalKey === undefined) {
      delete process.env.ODDS_API_KEY;
    } else {
      process.env.ODDS_API_KEY = originalKey;
    }
  });

  it("throws before any fetch when ODDS_API_KEY is missing", async () => {
    delete process.env.ODDS_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { listSports } = await import("./client");
    await expect(listSports()).rejects.toThrow("ODDS_API_KEY is not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("listSports validates and returns the sport list (zero-credit call)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeSportsResponse());
    vi.stubGlobal("fetch", fetchMock);

    const { listSports } = await import("./client");
    const sports = await listSports();

    expect(sports).toHaveLength(2);
    expect(sports[0].key).toBe("basketball_nba");
    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/v4/sports/");
    expect(calledUrl).toContain(`apiKey=${SENTINEL_KEY}`);
  });

  it("fetchSportOdds builds the correct request params and parses quota headers", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOddsResponse());
    vi.stubGlobal("fetch", fetchMock);

    const { fetchSportOdds } = await import("./client");
    const { events, quota } = await fetchSportOdds("basketball_nba", {
      bookmakerKeys: ["draftkings", "fanduel"],
      commenceTimeFrom: new Date("2026-09-25T00:00:00.000Z"),
      commenceTimeTo: new Date("2026-10-02T00:00:00.000Z"),
    });

    expect(events).toHaveLength(1);
    expect(events[0].home_team).toBe("Denver Nuggets");
    expect(quota).toEqual({ remaining: 480, used: 20, last: 1 });

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("/v4/sports/basketball_nba/odds/");
    expect(calledUrl).toContain("bookmakers=draftkings%2Cfanduel");
    expect(calledUrl).toContain("markets=h2h");
    expect(calledUrl).toContain("oddsFormat=american");
    expect(calledUrl).toContain("dateFormat=iso");
    // no milliseconds in the formatted date params
    expect(calledUrl).toContain("commenceTimeFrom=2026-09-25T00%3A00%3A00Z");
    expect(calledUrl).toContain("commenceTimeTo=2026-10-02T00%3A00%3A00Z");
  });

  it("fetchSportOdds defaults to markets=h2h when markets is not given (SC1: no extra credits)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOddsResponse());
    vi.stubGlobal("fetch", fetchMock);

    const { fetchSportOdds } = await import("./client");
    await fetchSportOdds("basketball_nba", {
      bookmakerKeys: ["draftkings"],
      commenceTimeFrom: new Date("2026-09-25T00:00:00.000Z"),
      commenceTimeTo: new Date("2026-10-02T00:00:00.000Z"),
    });

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    expect(calledUrl).toContain("markets=h2h");
    expect(calledUrl).not.toContain("spreads");
  });

  it("fetchSportOdds requests markets=h2h,spreads,totals when markets is given", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeOddsResponse());
    vi.stubGlobal("fetch", fetchMock);

    const { fetchSportOdds } = await import("./client");
    await fetchSportOdds("basketball_nba", {
      bookmakerKeys: ["draftkings"],
      commenceTimeFrom: new Date("2026-09-25T00:00:00.000Z"),
      commenceTimeTo: new Date("2026-10-02T00:00:00.000Z"),
      markets: ["h2h", "spreads", "totals"],
    });

    const calledUrl = String(fetchMock.mock.calls[0][0]);
    const decodedUrl = decodeURIComponent(calledUrl);
    expect(decodedUrl).toContain("markets=h2h,spreads,totals");
  });

  it("parseQuotaHeaders returns null for absent headers", async () => {
    const { parseQuotaHeaders } = await import("./client");
    const headers = new Headers();
    expect(parseQuotaHeaders(headers)).toEqual({ remaining: null, used: null, last: null });
  });

  it("throws OddsApiError with status on a non-2xx response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);

    const { listSports, OddsApiError } = await import("./client");
    await expect(listSports()).rejects.toBeInstanceOf(OddsApiError);

    fetchMock.mockResolvedValue(new Response("nope", { status: 401 }));
    try {
      await listSports();
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(OddsApiError);
      expect((err as InstanceType<typeof OddsApiError>).status).toBe(401);
    }
  });

  it("throws OddsApiError('Odds API returned an unexpected response shape') on a schema mismatch", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ not: "an array" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { listSports } = await import("./client");
    await expect(listSports()).rejects.toThrow("Odds API returned an unexpected response shape");
  });

  it("never leaks the API key in a thrown error message", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const { listSports, fetchSportOdds } = await import("./client");

    try {
      await listSports();
      expect.unreachable();
    } catch (err) {
      expect(String(err)).not.toContain(SENTINEL_KEY);
    }

    try {
      await fetchSportOdds("basketball_nba", {
        bookmakerKeys: ["draftkings"],
        commenceTimeFrom: new Date(),
        commenceTimeTo: new Date(),
      });
      expect.unreachable();
    } catch (err) {
      expect(String(err)).not.toContain(SENTINEL_KEY);
    }
  });
});
