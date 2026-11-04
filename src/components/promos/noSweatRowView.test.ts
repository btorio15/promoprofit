import { describe, expect, it } from "vitest";
import {
  NO_SWEAT_RISK_COPY,
  estimateSecondaryLine,
  groupNoSweatNotes,
  hiddenLinesNote,
  lowProfileBlockedHeading,
  noteCopy,
  warningCopy,
} from "./noSweatRowView";
import type { NoSweatNoteRowDTO } from "@/domain/promos/noSweatRowDto";

describe("noSweatRowView", () => {
  it("builds the secondary estimate line", () => {
    expect(estimateSecondaryLine({ ratePct: "78.00" })).toBe("at 78%");
    expect(estimateSecondaryLine({ ratePct: "78.50" })).toBe("at 78.50%");
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

// WR-06: Low-profile-blocked no-sweats get their own heading, never "Not worth it right now".
describe("groupNoSweatNotes / lowProfileBlockedHeading", () => {
  const note = (id: number, n: NoSweatNoteRowDTO["note"], filteredOut = 0): NoSweatNoteRowDTO => ({
    kind: "no_sweat_note",
    note: n,
    rowKey: `nosweat-${n}-${id}`,
    promoId: id,
    bookKey: "draftkings",
    bookName: "DraftKings",
    title: "No-sweat",
    scopeLabel: null,
    refundCap: "25.00",
    expiresAt: null,
    addedByYou: false,
    filteredOut,
  });

  it("keeps low_profile_blocked out of the not-worth-it group", () => {
    const g = groupNoSweatNotes([
      note(1, "cant_price"),
      note(2, "not_worth_it", 1),
      note(3, "low_profile_blocked", 4),
      note(4, "low_profile_blocked", 2),
    ]);
    expect(g.cantPrice.map((n) => n.promoId)).toEqual([1]);
    expect(g.notWorth.map((n) => n.promoId)).toEqual([2]);
    expect(g.lowProfileBlocked.map((n) => n.promoId)).toEqual([3, 4]);
  });

  it("headings count the hidden lines", () => {
    expect(lowProfileBlockedHeading([note(3, "low_profile_blocked", 4), note(4, "low_profile_blocked", 2)])).toBe(
      "Hidden by your Low-profile settings (6 lines)",
    );
    expect(lowProfileBlockedHeading([note(3, "low_profile_blocked", 1)])).toBe(
      "Hidden by your Low-profile settings (1 line)",
    );
    expect(lowProfileBlockedHeading([note(3, "low_profile_blocked", 0)])).toBe("Hidden by your Low-profile settings");
  });
});
