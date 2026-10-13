import { describe, expect, it } from "vitest";
import { configuredOddsKeys, keyFingerprint, legacyKeyId, pickKey } from "./oddsKeys";

describe("configuredOddsKeys", () => {
  it("trims, drops empties and collapses duplicates keeping order", () => {
    const keys = configuredOddsKeys({ ODDS_API_KEYS: " test-key-a , test-key-b,,test-key-a ,test-key-c " });
    expect(keys.map((k) => k.key)).toEqual(["test-key-a", "test-key-b", "test-key-c"]);
  });
  it("falls back to ODDS_API_KEY and returns [] when nothing is set", () => {
    expect(configuredOddsKeys({ ODDS_API_KEYS: "", ODDS_API_KEY: "test-key-k" }).map((k) => k.key)).toEqual([
      "test-key-k",
    ]);
    expect(configuredOddsKeys({})).toEqual([]);
  });
  it("lets ODDS_API_KEYS win over ODDS_API_KEY", () => {
    expect(
      configuredOddsKeys({ ODDS_API_KEYS: "test-key-a", ODDS_API_KEY: "test-key-z" }).map((k) => k.key),
    ).toEqual(["test-key-a"]);
  });
});

describe("keyFingerprint", () => {
  it("is 8 lowercase hex chars, deterministic and does not contain the key", () => {
    const fp = keyFingerprint("abc");
    expect(fp).toMatch(/^[0-9a-f]{8}$/);
    expect(keyFingerprint("abc")).toBe(fp);
    expect(keyFingerprint("test-key-a")).not.toContain("test-key-a");
  });
});

describe("legacyKeyId", () => {
  it("prefers ODDS_API_KEY, then the first ODDS_API_KEYS entry, else null", () => {
    expect(legacyKeyId({ ODDS_API_KEY: "test-key-z", ODDS_API_KEYS: "test-key-a" })).toBe(
      keyFingerprint("test-key-z"),
    );
    expect(legacyKeyId({ ODDS_API_KEYS: "test-key-a,test-key-b" })).toBe(keyFingerprint("test-key-a"));
    expect(legacyKeyId({})).toBeNull();
  });
});

describe("pickKey", () => {
  const c = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const bal = (m: Record<string, number | null>) => (x: { id: string }) => m[x.id];
  it("picks the highest balance", () => {
    expect(pickKey(c, bal({ a: 300, b: 450, c: 100 }))?.id).toBe("b");
  });
  it("counts null as 500", () => {
    expect(pickKey(c, bal({ a: 300, b: 450, c: null }))?.id).toBe("c");
  });
  it("breaks ties by configured order", () => {
    expect(pickKey(c, bal({ a: 200, b: 200, c: 200 }))?.id).toBe("a");
  });
  it("returns null for an empty list", () => {
    expect(pickKey([], () => 1)).toBeNull();
  });
});
