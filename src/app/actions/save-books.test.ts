import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireUser } = vi.hoisted(() => ({ mockRequireUser: vi.fn() }));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/session", () => ({ requireUser: mockRequireUser }));
vi.mock("@/db/queries", () => ({ saveUserBooks: vi.fn() }));

import { revalidatePath } from "next/cache";
import { saveUserBooks } from "@/db/queries";
import { saveBooks } from "./save-books";

const mockSaveUserBooks = vi.mocked(saveUserBooks);
const mockRevalidatePath = vi.mocked(revalidatePath);

beforeEach(() => {
  vi.clearAllMocks();
  mockSaveUserBooks.mockResolvedValue(undefined);
  mockRequireUser.mockResolvedValue({ userId: 7, email: "friend@example.com", displayName: "Friend" });
});

describe("saveBooks server action (DASH-02, D-09, D-10, D-19)", () => {
  it("saves the given book keys for the session user and revalidates both pages", async () => {
    const result = await saveBooks({ bookKeys: ["fanduel"] });

    expect(mockSaveUserBooks).toHaveBeenCalledWith(7, ["fanduel"]);
    expect(mockRevalidatePath).toHaveBeenCalledWith("/");
    expect(mockRevalidatePath).toHaveBeenCalledWith("/settings");
    expect(result).toEqual({ status: "ok", bookKeys: ["fanduel"] });
  });

  it("rejects an empty selection without saving (D-09)", async () => {
    const result = await saveBooks({ bookKeys: [] });

    expect(result).toEqual({
      status: "invalid",
      fieldErrors: { bookKeys: ["Select at least one book."] },
    });
    expect(mockSaveUserBooks).not.toHaveBeenCalled();
  });

  it("rejects a book key outside the usable/free-tier list without saving (D-10)", async () => {
    const result = await saveBooks({ bookKeys: ["williamhill_us"] });

    expect(result.status).toBe("invalid");
    expect(mockSaveUserBooks).not.toHaveBeenCalled();
  });

  it("dedupes duplicate keys before saving", async () => {
    const result = await saveBooks({ bookKeys: ["fanduel", "fanduel", "draftkings"] });

    expect(mockSaveUserBooks).toHaveBeenCalledWith(7, ["fanduel", "draftkings"]);
    expect(result).toEqual({ status: "ok", bookKeys: ["fanduel", "draftkings"] });
  });

  it("rejects when logged out, before saving anything (userId only ever comes from the session)", async () => {
    mockRequireUser.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(saveBooks({ bookKeys: ["fanduel"] })).rejects.toThrow("NEXT_REDIRECT");

    expect(mockSaveUserBooks).not.toHaveBeenCalled();
  });
});
