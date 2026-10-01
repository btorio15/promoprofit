import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const call = (path: string) => proxy(new NextRequest(`https://x.test${path}`));

describe("proxy", () => {
  it("lets /api/cron/scrape through without a cookie", () => {
    const res = call("/api/cron/scrape");
    expect(res.status).not.toBe(307);
    expect(res.headers.get("location")).toBeNull();
  });
  it("redirects / to /login", () => {
    const res = call("/");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/login$/);
  });
  it.each(["/apix/cron", "/api/other"])("still redirects %s", (p) => {
    const res = call(p);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/login$/);
  });
  it("passes /login", () => {
    expect(call("/login").headers.get("location")).toBeNull();
  });
});
