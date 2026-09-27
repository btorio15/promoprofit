import { describe, expect, it } from "vitest";
import { describeScrapeStatus } from "./scrapeAge";
import type { ScrapeStatusLineDTO } from "@/domain/promos/dto";

const NOW = new Date("2026-10-01T12:00:00.000Z");

function minutesAgoIso(minutes: number): string {
  return new Date(NOW.getTime() - minutes * 60_000).toISOString();
}

function line(overrides: Partial<ScrapeStatusLineDTO>): ScrapeStatusLineDTO {
  return {
    bookKey: "ballybet",
    bookName: "Bally Bet",
    lastOkAt: null,
    lastRunFailed: false,
    ...overrides,
  };
}

describe("describeScrapeStatus (D-08)", () => {
  it("labels a never-scraped book, not warning", () => {
    const result = describeScrapeStatus(line({ lastOkAt: null, lastRunFailed: false }), NOW);
    expect(result).toEqual({ label: "Bally Bet promos not scraped yet", warning: false });
  });

  it("labels a never-scraped book whose only run failed, warning true", () => {
    const result = describeScrapeStatus(line({ lastOkAt: null, lastRunFailed: true }), NOW);
    expect(result).toEqual({
      label: "Bally Bet promos not scraped yet · last run failed",
      warning: true,
    });
  });

  it("labels a fresh sub-hour scrape as 'N min ago', not warning", () => {
    const result = describeScrapeStatus(
      line({ lastOkAt: minutesAgoIso(25), lastRunFailed: false }),
      NOW,
    );
    expect(result).toEqual({ label: "Bally Bet promos updated 25 min ago", warning: false });
  });

  it("labels a multi-hour scrape as 'Nh ago' and flags a failed latest run as warning", () => {
    const result = describeScrapeStatus(
      line({ lastOkAt: minutesAgoIso(190), lastRunFailed: true }),
      NOW,
    );
    expect(result).toEqual({
      label: "Bally Bet promos updated 3h ago · last run failed",
      warning: true,
    });
  });
});
