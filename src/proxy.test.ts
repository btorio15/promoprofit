import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "./proxy";

const call = (path: string) => proxy(new NextRequest(`https://x.test${path}`));

describe("proxy", () => {
  it("redirects /api/cron/scrape to /login now that the route is gone", () => {
    const res = call("/api/cron/scrape");
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toMatch(/\/login$/);
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
