import { describe, expect, it } from "vitest";
import { decideDailyRunStatus } from "./dailyRunStatus";

const TARGETS = ["ballybet", "draftkings", "fanduel"];
const d = (s: string) => new Date(s);
const allAt = (iso: string) => Object.fromEntries(TARGETS.map((k) => [k, d(iso)]));

describe("decideDailyRunStatus", () => {
  const now = d("2026-10-01T15:40:00Z");

  it("nothing ran -> both false", () => {
    expect(
      decideDailyRunStatus({ targetBookKeys: TARGETS, latestOkScrapeAtByBook: {}, latestScheduledRefreshAt: null, now }),
    ).toEqual({ scrapeDone: false, observeDone: false });
  });

  it("all target books ok today -> scrapeDone", () => {
    const r = decideDailyRunStatus({
      targetBookKeys: TARGETS,
      latestOkScrapeAtByBook: allAt("2026-10-01T13:20:00Z"),
      latestScheduledRefreshAt: null,
      now,
    });
    expect(r.scrapeDone).toBe(true);
  });

  it("one book failed today (latest ok is yesterday) -> scrapeDone false", () => {
    const r = decideDailyRunStatus({
      targetBookKeys: TARGETS,
      latestOkScrapeAtByBook: {
        ballybet: d("2026-10-01T13:20:00Z"),
        draftkings: d("2026-10-01T13:20:00Z"),
        fanduel: d("2026-09-30T13:20:00Z"),
      },
      latestScheduledRefreshAt: null,
      now,
    });
    expect(r.scrapeDone).toBe(false);
  });

  it("a target book missing from the map -> scrapeDone false", () => {
    const r = decideDailyRunStatus({
      targetBookKeys: TARGETS,
      latestOkScrapeAtByBook: { ballybet: d("2026-10-01T13:20:00Z"), draftkings: d("2026-10-01T13:20:00Z") },
      latestScheduledRefreshAt: null,
      now,
    });
    expect(r.scrapeDone).toBe(false);
  });

  it("an extra non-target book ok today does not cover a missing target", () => {
    const r = decideDailyRunStatus({
      targetBookKeys: TARGETS,
      latestOkScrapeAtByBook: {
        ballybet: d("2026-10-01T13:20:00Z"),
        draftkings: d("2026-10-01T13:20:00Z"),
        betmgm: d("2026-10-01T13:20:00Z"),
      },
      latestScheduledRefreshAt: null,
      now,
    });
    expect(r.scrapeDone).toBe(false);
  });

  it("empty target list never skips", () => {
    const r = decideDailyRunStatus({
      targetBookKeys: [],
      latestOkScrapeAtByBook: allAt("2026-10-01T13:20:00Z"),
      latestScheduledRefreshAt: null,
      now,
    });
    expect(r.scrapeDone).toBe(false);
  });

  it("UTC date matches but Denver date differs -> false", () => {
    const r = decideDailyRunStatus({
      targetBookKeys: TARGETS,
      latestOkScrapeAtByBook: allAt("2026-10-01T05:30:00Z"),
      latestScheduledRefreshAt: null,
      now,
    });
    expect(r.scrapeDone).toBe(false);
  });

  it("MST boundary", () => {
    const winterNow = d("2026-12-01T15:40:00Z");
    const before = decideDailyRunStatus({
      targetBookKeys: TARGETS,
      latestOkScrapeAtByBook: allAt("2026-12-01T06:30:00Z"),
      latestScheduledRefreshAt: null,
      now: winterNow,
    });
    const after = decideDailyRunStatus({
      targetBookKeys: TARGETS,
      latestOkScrapeAtByBook: allAt("2026-12-01T07:30:00Z"),
      latestScheduledRefreshAt: null,
      now: winterNow,
    });
    expect(before.scrapeDone).toBe(false);
    expect(after.scrapeDone).toBe(true);
  });

  it("observeDone follows the Denver day of the latest scheduled refresh", () => {
    const same = decideDailyRunStatus({
      targetBookKeys: TARGETS,
      latestOkScrapeAtByBook: {},
      latestScheduledRefreshAt: d("2026-10-01T13:10:00Z"),
      now,
    });
    const prev = decideDailyRunStatus({
      targetBookKeys: TARGETS,
      latestOkScrapeAtByBook: {},
      latestScheduledRefreshAt: d("2026-09-30T13:10:00Z"),
      now,
    });
    expect(same.observeDone).toBe(true);
    expect(prev.observeDone).toBe(false);
  });

  it("scrapeDone and observeDone are independent", () => {
    const r = decideDailyRunStatus({
      targetBookKeys: TARGETS,
      latestOkScrapeAtByBook: allAt("2026-10-01T13:20:00Z"),
      latestScheduledRefreshAt: null,
      now,
    });
    expect(r).toEqual({ scrapeDone: true, observeDone: false });
  });
});
