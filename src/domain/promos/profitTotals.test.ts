import { describe, expect, it } from "vitest";
import {
  addDays,
  denverDate,
  periodStartDates,
} from "./profitTotals";

describe("denverDate (America/Denver, DST-safe via Intl)", () => {
  it("2026-01-15T06:30:00Z (23:30 MST Jan 14) -> 2026-01-14", () => {
    expect(denverDate(new Date("2026-01-15T06:30:00Z"))).toBe("2026-01-14");
  });

  it("2026-01-15T07:00:00Z -> 2026-01-15", () => {
    expect(denverDate(new Date("2026-01-15T07:00:00Z"))).toBe("2026-01-15");
  });

  it("2026-07-15T05:30:00Z (23:30 MDT Jul 14) -> 2026-07-14", () => {
    expect(denverDate(new Date("2026-07-15T05:30:00Z"))).toBe("2026-07-14");
  });

  it("2026-07-15T06:00:00Z -> 2026-07-15", () => {
    expect(denverDate(new Date("2026-07-15T06:00:00Z"))).toBe("2026-07-15");
  });

  it("maps correctly around the spring-forward DST day (2026-03-08)", () => {
    // MST (UTC-7) before 2am local on 3/8; MDT (UTC-6) after. 08:59Z is
    // still 1:59 AM MST on 3/8; 09:00Z jumps to 3:00 AM MDT (still 3/8).
    expect(denverDate(new Date("2026-03-08T08:59:00Z"))).toBe("2026-03-08");
    expect(denverDate(new Date("2026-03-08T09:00:00Z"))).toBe("2026-03-08");
    // Just before local midnight on 3/7 (MST, UTC-7): 06:59Z is 11:59 PM 3/7.
    expect(denverDate(new Date("2026-03-08T06:59:00Z"))).toBe("2026-03-07");
  });

  it("maps correctly around the fall-back DST day (2026-11-01)", () => {
    // MDT (UTC-6) before 2am local on 11/1; MST (UTC-7) after.
    // Just before local midnight on 10/31 (MDT, UTC-6): 05:59Z is 11:59 PM 10/31.
    expect(denverDate(new Date("2026-11-01T05:59:00Z"))).toBe("2026-10-31");
    expect(denverDate(new Date("2026-11-01T06:00:00Z"))).toBe("2026-11-01");
  });
});

describe("periodStartDates (rolling last 7 / last 30 days incl. today, America/Denver)", () => {
  it("Sun 2026-09-27 -> last 7 days from 2026-09-21, last 30 days from 2026-08-29", () => {
    // noon local (18:00Z in MDT, UTC-6) is safely mid-day.
    const now = new Date("2026-09-27T18:00:00Z");
    expect(periodStartDates(now)).toEqual({ today: "2026-09-27", weekStart: "2026-09-21", monthStart: "2026-08-29" });
  });

  it("ignores weekday: Mon 2026-09-28 -> 2026-09-22 / 2026-08-30", () => {
    const now = new Date("2026-09-28T18:00:00Z");
    expect(periodStartDates(now)).toEqual({ today: "2026-09-28", weekStart: "2026-09-22", monthStart: "2026-08-30" });
  });

  it("crosses month and year boundaries: Fri 2027-01-01 -> 2026-12-26 / 2026-12-03", () => {
    const now = new Date("2027-01-01T19:00:00Z");
    expect(periodStartDates(now)).toEqual({ today: "2027-01-01", weekStart: "2026-12-26", monthStart: "2026-12-03" });
  });

  it("an instant at 05:00Z on the 1st that is still the prior day in Denver counts from the Denver day", () => {
    // 2026-10-01T05:00:00Z is 2026-09-30 23:00 MDT (UTC-6).
    const now = new Date("2026-10-01T05:00:00Z");
    expect(periodStartDates(now)).toEqual({ today: "2026-09-30", weekStart: "2026-09-24", monthStart: "2026-09-01" });
  });
});

describe("addDays", () => {
  it.each([
    ["2026-10-03", -6, "2026-09-27"],
    ["2026-03-01", -1, "2026-02-28"],
    ["2028-03-01", -1, "2028-02-29"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2026-10-03", 0, "2026-10-03"],
  ])("addDays(%s, %i) = %s", (d, n, expected) => {
    expect(addDays(d, n)).toBe(expected);
  });
});
