import { describe, expect, it } from "vitest";
import { isUndefinedColumnErrorFor } from "./undefinedColumn";

const err = (code: string, message?: string, cause?: unknown) =>
  Object.assign(new Error(message ?? ""), { code, ...(message === undefined ? { message: undefined } : {}), cause });

describe("isUndefinedColumnErrorFor", () => {
  it("matches the select phrasing", () => {
    expect(isUndefinedColumnErrorFor(err("42703", "column credit_usage.key_id does not exist"), "key_id")).toBe(true);
  });
  it("matches the insert phrasing", () => {
    expect(
      isUndefinedColumnErrorFor(err("42703", 'column "key_id" of relation "credit_usage" does not exist'), "key_id"),
    ).toBe(true);
  });
  it("matches through the cause chain", () => {
    const inner = err("42703", "column credit_usage.key_id does not exist");
    expect(isUndefinedColumnErrorFor(new Error("Failed query", { cause: inner }), "key_id")).toBe(true);
  });
  it("accepts a bare 42703 with no message", () => {
    expect(isUndefinedColumnErrorFor({ code: "42703" }, "key_id")).toBe(true);
  });
  it("rejects a different column, other codes and random errors", () => {
    expect(isUndefinedColumnErrorFor(err("42703", "column credit_usage.other does not exist"), "key_id")).toBe(false);
    expect(isUndefinedColumnErrorFor(err("42P01", 'relation "credit_usage" does not exist'), "key_id")).toBe(false);
    expect(isUndefinedColumnErrorFor(new Error("boom"), "key_id")).toBe(false);
    expect(isUndefinedColumnErrorFor(null, "key_id")).toBe(false);
  });
});
