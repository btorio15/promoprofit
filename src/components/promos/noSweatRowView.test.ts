import { describe, expect, it } from "vitest";
import {
  NO_SWEAT_RISK_COPY,
  estimateSecondaryLine,
  hiddenLinesNote,
  noteCopy,
  warningCopy,
} from "./noSweatRowView";

describe("noSweatRowView", () => {
  it("builds the secondary estimate line", () => {
    expect(estimateSecondaryLine({ ratePct: "78.00", worstCaseProfit: "-3.10" })).toBe(
      "at 78% · worst case −$3.10",
    );
    expect(estimateSecondaryLine({ ratePct: "78.50", worstCaseProfit: "2.00" })).toBe(
      "at 78.50% · worst case $2.00",
    );
  });

  it("returns warning copy", () => {
    expect(warningCopy("long_odds")).toBe("Long odds. A bet this far out is easy for the book to notice.");
    expect(warningCopy("alternate_line")).toBe("This is an alternate line, not the main one. Books watch for those.");
    expect(warningCopy("exact_cent_stake")).toBe("This stake has cents in it. Real bettors usually bet whole dollars.");
  });

  it("hidden lines note", () => {
    expect(hiddenLinesNote(3)).toBe("3 lines hidden by your Low-profile settings.");
    expect(hiddenLinesNote(1)).toBe("1 line hidden by your Low-profile settings.");
    expect(hiddenLinesNote(0)).toBeNull();
  });

  it("note copy", () => {
    expect(noteCopy("cant_price", "FanDuel")).toBe("Can't price - no odds at FanDuel.");
    expect(noteCopy("not_worth_it", "FanDuel")).toBe("Not worth it right now.");
    expect(noteCopy("low_profile_blocked", "FanDuel")).toBe("No line fits your Low-profile settings right now.");
  });

  it("risk copy is exact and policy-safe", () => {
    expect(NO_SWEAT_RISK_COPY).toBe(
      "You only get one shot at this at each book. Mix in some normal bets and skip very long odds so your account looks like a regular customer.",
    );
    for (const bad of ["multiple accounts", "VPN", "location", "guaranteed"]) {
      expect(NO_SWEAT_RISK_COPY.toLowerCase()).not.toContain(bad.toLowerCase());
    }
  });
});
