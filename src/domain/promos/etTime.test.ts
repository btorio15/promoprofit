import { describe, expect, it } from "vitest";
import { etDayBounds, etDayLabel, etDayWindow, parseEtDateTime, slateWindow } from "./etTime";

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
