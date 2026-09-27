import { describe, expect, it } from "vitest";
import { denverHour, isMorningObservationWindow } from "./morningWindow";

describe("denverHour / isMorningObservationWindow (quick-260927-n12 scope change B)", () => {
  it("reports 8am Denver time (MDT, summer) as hour 8, inside the morning window", () => {
    // 2026-07-15T14:00:00Z is 08:00 MDT (UTC-6).
    const instant = new Date("2026-07-15T14:00:00Z");
    expect(denverHour(instant)).toBe(8);
    expect(isMorningObservationWindow(instant)).toBe(true);
  });

  it("reports noon Denver time (MDT) as outside the morning window", () => {
    // 2026-07-15T18:00:00Z is 12:00 MDT.
    const instant = new Date("2026-07-15T18:00:00Z");
    expect(denverHour(instant)).toBe(12);
    expect(isMorningObservationWindow(instant)).toBe(false);
  });

  it("reports 5pm Denver time (MDT) as outside the morning window", () => {
    // 2026-07-15T23:00:00Z is 17:00 MDT.
    const instant = new Date("2026-07-15T23:00:00Z");
    expect(denverHour(instant)).toBe(17);
    expect(isMorningObservationWindow(instant)).toBe(false);
  });

  it("is DST-safe: 8am Denver time in winter (MST, UTC-7) is also inside the window", () => {
    // 2026-01-15T15:00:00Z is 08:00 MST (UTC-7).
    const instant = new Date("2026-01-15T15:00:00Z");
    expect(denverHour(instant)).toBe(8);
    expect(isMorningObservationWindow(instant)).toBe(true);
  });

  it("just before the 10am cutoff (9:59am Denver, MDT) is inside the window", () => {
    // 2026-07-15T15:59:00Z is 09:59 MDT.
    const instant = new Date("2026-07-15T15:59:00Z");
    expect(isMorningObservationWindow(instant)).toBe(true);
  });

  it("at the 10am cutoff (Denver, MDT) is outside the window", () => {
    // 2026-07-15T16:00:00Z is 10:00 MDT.
    const instant = new Date("2026-07-15T16:00:00Z");
    expect(isMorningObservationWindow(instant)).toBe(false);
  });
});
