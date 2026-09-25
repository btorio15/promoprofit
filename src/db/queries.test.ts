import { describe, expect, it, vi } from "vitest";
import { usableOddsBooks } from "@/config/books";

// Any DB access in these tests is a failure: the book lists must come from config.
vi.mock("./client", () => ({
  getDb: vi.fn(() => {
    throw new Error("getBonusBooks/getHedgeBookKeys must not read the DB (WR-05)");
  }),
}));

import { getBonusBooks, getHedgeBookKeys } from "./queries";

describe("book lists share one runtime source with runOddsRefresh (WR-05)", () => {
  it("getBonusBooks returns exactly usableOddsBooks(), in config sort order", async () => {
    expect(await getBonusBooks()).toEqual(
      usableOddsBooks().map((b) => ({ key: b.key, displayName: b.displayName })),
    );
  });

  it("getHedgeBookKeys returns exactly the keys runOddsRefresh fetches odds for", async () => {
    expect(await getHedgeBookKeys()).toEqual(usableOddsBooks().map((b) => b.key));
  });
});
