import { describe, expect, it } from "vitest";
import { pickTop, sortByMeasure } from "./pick";
import type { RankKey } from "./types";

function k(rowKey: string, profit: string, pct: string, o: Partial<RankKey> = {}): RankKey {
  return { rowKey, profit, pct, pctLabel: "ROI", commenceTime: "2026-09-30T00:00:00.000Z", ...o };
}

describe("pickTop", () => {
  it("compares profit as decimals, not strings", () => {
    const out = pickTop([k("a", "9.50", "1.00"), k("b", "10.00", "1.00")], "profit", 5);
    expect(out.map((r) => r.rowKey)).toEqual(["b", "a"]);
  });

  it("sorts by pct under roi", () => {
    const out = pickTop([k("a", "50.00", "9.50"), k("b", "10.00", "10.00")], "roi", 5);
    expect(out.map((r) => r.rowKey)).toEqual(["b", "a"]);
  });

  it("breaks ties by commenceTime asc then rowKey asc", () => {
    const out = pickTop(
      [
        k("b", "5.00", "1.00", { commenceTime: "2026-10-01T00:00:00.000Z" }),
        k("z", "5.00", "1.00", { commenceTime: "2026-09-30T00:00:00.000Z" }),
        k("a", "5.00", "1.00", { commenceTime: "2026-10-01T00:00:00.000Z" }),
      ],
      "profit",
      5,
    );
    expect(out.map((r) => r.rowKey)).toEqual(["z", "a", "b"]);
  });

  it("returns at most n and [] for empty", () => {
    const rows = Array.from({ length: 8 }, (_, i) => k(`r${i}`, `${i}.00`, "1.00"));
    expect(pickTop(rows, "profit", 5)).toHaveLength(5);
    expect(pickTop([], "profit", 5)).toEqual([]);
  });

  it("ranks a Conversion row above an ROI row on pct and preserves pctLabel", () => {
    const out = pickTop(
      [k("boost", "3.00", "12.50"), k("bonus", "20.00", "80.00", { pctLabel: "Conversion" })],
      "roi",
      5,
    );
    expect(out[0].rowKey).toBe("bonus");
    expect(out[0].pctLabel).toBe("Conversion");
  });
});

describe("sortByMeasure", () => {
  it("accepts an accessor and does not mutate the input", () => {
    const input = [{ r: k("a", "1.00", "1.00") }, { r: k("b", "2.00", "1.00") }];
    const out = sortByMeasure(input, "profit", (x) => x.r);
    expect(out.map((x) => x.r.rowKey)).toEqual(["b", "a"]);
    expect(input[0].r.rowKey).toBe("a");
  });
});
