import { describe, expect, it } from "vitest";
import {
  etDayBounds,
  etDayLabel,
  etDayWindow,
  parseEtDateSpan,
  parseEtDateTime,
  slateWindow,
} from "./etTime";

describe("parseEtDateSpan", () => {
  const EXP = "2026-10-01T06:00:00Z";

  it.each<[string, string, string | null, { startEtDate: string; endEtDate: string; dayCount: number }]>([
    ["and list", "September 29th and September 30th, 2026", EXP, { startEtDate: "2026-09-29", endEtDate: "2026-09-30", dayCount: 2 }],
    ["single dated day", "September 29th, 2026", EXP, { startEtDate: "2026-09-29", endEtDate: "2026-09-29", dayCount: 1 }],
    ["single yearless day (year from expiry)", "September 29th", EXP, { startEtDate: "2026-09-29", endEtDate: "2026-09-29", dayCount: 1 }],
    ["hyphen range", "September 29th - September 30th", EXP, { startEtDate: "2026-09-29", endEtDate: "2026-09-30", dayCount: 2 }],
    ["en dash range with year", "September 29th – September 30th, 2026", EXP, { startEtDate: "2026-09-29", endEtDate: "2026-09-30", dayCount: 2 }],
    ["through range", "September 29th through October 1st, 2026", "2026-10-02T06:00:00Z", { startEtDate: "2026-09-29", endEtDate: "2026-10-01", dayCount: 3 }],
    ["thru range yearless", "September 29th thru October 1st", "2026-10-02T06:00:00Z", { startEtDate: "2026-09-29", endEtDate: "2026-10-01", dayCount: 3 }],
    ["comma + and list", "September 29th, September 30th and October 1st, 2026", EXP, { startEtDate: "2026-09-29", endEtDate: "2026-10-01", dayCount: 3 }],
    ["year boundary", "December 31st and January 1st, 2027", null, { startEtDate: "2026-12-31", endEtDate: "2027-01-01", dayCount: 2 }],
    ["trailing comma and 'up to' tail junk", "September 29th, 2026, up to", EXP, { startEtDate: "2026-09-29", endEtDate: "2026-09-29", dayCount: 1 }],
    ["trailing connector and comma", "September 29th, 2026, and", EXP, { startEtDate: "2026-09-29", endEtDate: "2026-09-29", dayCount: 1 }],
    ["trailing exclamation", "September 29th and September 30th, 2026!", EXP, { startEtDate: "2026-09-29", endEtDate: "2026-09-30", dayCount: 2 }],
  ])("%s", (_name, text, expiresAt, expected) => {
    // "up to" is not date vocabulary; the fanduel span regex stops before it,
    // so only connector/punctuation tails reach this helper.
    const input = text.replace(/, up to$/, ",");
    expect(parseEtDateSpan(input, expiresAt)).toEqual(expected);
  });

  it.each<[string, string, string | null]>([
    ["gap in and-list", "September 29th and October 5th, 2026", EXP],
    ["descending", "September 30th and September 29th, 2026", EXP],
    ["range needs end > start", "September 29th through September 29th", EXP],
    ["impossible dates (WR-12)", "February 30th and February 31st, 2026", EXP],
    ["yearless with no expiry", "September 29th and September 30th", null],
    ["span over 7 days", "September 29th through October 20th, 2026", EXP],
    ["garbage words", "this week", EXP],
    ["empty", "", EXP],
  ])("null: %s", (_name, text, expiresAt) => {
    expect(parseEtDateSpan(text, expiresAt)).toBeNull();
  });
});

describe("parseEtDateTime", () => {
  it("converts an ET midnight wall-time to UTC (EDT, UTC-4)", () => {
    expect(parseEtDateTime("September 27, 2026 at 12:00 AM ET")).toBe(
      "2026-09-27T04:00:00.000Z",
    );
  });

  it("converts a late-night ET wall-time to UTC, rolling to the next UTC day", () => {
    expect(parseEtDateTime("September 27, 2026 at 11:30 PM ET")).toBe(
      "2026-09-28T03:30:00.000Z",
    );
  });

  it("uses EST (UTC-5) for a January date", () => {
    expect(parseEtDateTime("January 15, 2026 at 12:00 AM ET")).toBe("2026-01-15T05:00:00.000Z");
  });

  it("returns null for unparseable text", () => {
    expect(parseEtDateTime("not a date at all")).toBeNull();
  });
});

describe("etDayWindow", () => {
  it("computes the ET calendar-day window for M/D/YYYY", () => {
    expect(etDayWindow("9/27/2026")).toEqual({
      start: "2026-09-27T04:00:00.000Z",
      end: "2026-09-28T03:59:59.999Z",
    });
  });

  it("computes the ET calendar-day window for a month-name date with an ordinal suffix", () => {
    expect(etDayWindow("September 26th, 2026")).toEqual({
      start: "2026-09-26T04:00:00.000Z",
      end: "2026-09-27T03:59:59.999Z",
    });
  });

  it("returns null for garbage input", () => {
    expect(etDayWindow("not a date")).toBeNull();
  });
});

describe("etDayBounds", () => {
  it("matches etDayWindow for the equivalent ISO date", () => {
    expect(etDayBounds("2026-09-27")).toEqual(etDayWindow("9/27/2026"));
  });

  it("WR-12: rejects impossible calendar dates instead of rolling them over", () => {
    expect(etDayBounds("2026-02-31")).toBeNull();
    expect(etDayBounds("2026-13-01")).toBeNull();
    expect(etDayBounds("2026-00-10")).toBeNull();
    expect(etDayBounds("2028-02-29")).not.toBeNull(); // leap day is real
    expect(etDayWindow("13/45/2026")).toBeNull();
    expect(etDayWindow("2/30/2026")).toBeNull();
    expect(parseEtDateTime("February 31, 2026 at 12:00 AM ET")).toBeNull();
  });
});

describe("etDayLabel", () => {
  it("formats an ISO instant as a short ET day label", () => {
    expect(etDayLabel("2026-09-27T17:00:00.000Z")).toBe("Sun, Sep 27");
  });
});

describe("slateWindow", () => {
  it("extends the ET-day end to expiresAt when expiresAt is later by at most 12h", () => {
    expect(slateWindow("9/26/2026", "2026-09-27T06:30:00.000Z")).toEqual({
      start: "2026-09-26T04:00:00.000Z",
      end: "2026-09-27T06:30:00.000Z",
    });
  });

  it("does not shrink the window when expiresAt is earlier than the ET-day end", () => {
    expect(slateWindow("9/27/2026", "2026-09-28T03:00:00.000Z")).toEqual({
      start: "2026-09-27T04:00:00.000Z",
      end: "2026-09-28T03:59:59.999Z",
    });
  });

  it("does not extend the window when expiresAt is more than 12h later", () => {
    expect(slateWindow("9/26/2026", "2026-10-05T00:00:00.000Z")).toEqual({
      start: "2026-09-26T04:00:00.000Z",
      end: "2026-09-27T03:59:59.999Z",
    });
  });
});
