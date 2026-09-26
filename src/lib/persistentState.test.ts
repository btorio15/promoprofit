import { describe, expect, it } from "vitest";
import { readPersistedString, writePersistedString } from "./persistentState";

/** Minimal Map-backed fake of the Storage interface for the pure helpers. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

describe("readPersistedString", () => {
  it("reads a value that was previously written", () => {
    const storage = fakeStorage();
    storage.setItem("k", "v");
    expect(readPersistedString(storage, "k")).toBe("v");
  });

  it("returns null for a key that was never written", () => {
    const storage = fakeStorage();
    expect(readPersistedString(storage, "missing")).toBeNull();
  });

  it("returns null when storage is undefined (SSR)", () => {
    expect(readPersistedString(undefined, "k")).toBeNull();
  });

  it("returns null when getItem throws (e.g. private-browsing mode)", () => {
    const throwing: Pick<Storage, "getItem"> = {
      getItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readPersistedString(throwing, "k")).toBeNull();
  });
});

describe("writePersistedString", () => {
  it("calls setItem with the given value", () => {
    const storage = fakeStorage();
    writePersistedString(storage, "k", "v");
    expect(storage.getItem("k")).toBe("v");
  });

  it("calls removeItem when value is null", () => {
    const storage = fakeStorage();
    storage.setItem("k", "v");
    writePersistedString(storage, "k", null);
    expect(storage.getItem("k")).toBeNull();
  });

  it("does nothing when storage is undefined (SSR)", () => {
    expect(() => writePersistedString(undefined, "k", "v")).not.toThrow();
  });

  it("swallows errors thrown by setItem/removeItem (e.g. quota exceeded)", () => {
    const throwing: Pick<Storage, "setItem" | "removeItem"> = {
      setItem: () => {
        throw new Error("quota");
      },
      removeItem: () => {
        throw new Error("quota");
      },
    };
    expect(() => writePersistedString(throwing, "k", "v")).not.toThrow();
    expect(() => writePersistedString(throwing, "k", null)).not.toThrow();
  });
});
