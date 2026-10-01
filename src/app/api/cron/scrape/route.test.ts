import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockDispatch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/githubDispatch", () => ({ dispatchScrapeWorkflow: mockDispatch }));

const mockStatus = vi.hoisted(() => vi.fn());
vi.mock("@/db/dailyRunStatus", () => ({ getDailyRunStatus: mockStatus }));

import { GET } from "./route";

const SECRET = "cronsecret-0123456789";
const TOKEN = "ghp_TESTSECRET123";

function req(auth?: string) {
  return new NextRequest("https://x.test/api/cron/scrape", {
    headers: auth ? { authorization: auth } : {},
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStatus.mockResolvedValue({ scrapeDone: false, observeDone: false });
  vi.spyOn(console, "error").mockImplementation(() => {});
  process.env.CRON_SECRET = SECRET;
  process.env.GH_DISPATCH_TOKEN = TOKEN;
  delete process.env.GH_REPO;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.CRON_SECRET;
  delete process.env.GH_DISPATCH_TOKEN;
  delete process.env.GH_REPO;
});

describe("GET /api/cron/scrape", () => {
  it("401 when CRON_SECRET unset", async () => {
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer anything"))).status).toBe(401);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("401 with no header", async () => {
    expect((await GET(req())).status).toBe(401);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it.each([
    ["same length wrong", `Bearer ${"x".repeat(SECRET.length)}`],
    ["different length", "Bearer short"],
    ["basic scheme", `Basic ${SECRET}`],
  ])("401 for %s", async (_n, h) => {
    expect((await GET(req(h))).status).toBe(401);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("500 when token missing", async () => {
    delete process.env.GH_DISPATCH_TOKEN;
    expect((await GET(req(`Bearer ${SECRET}`))).status).toBe(500);
    expect(mockDispatch).not.toHaveBeenCalled();
  });

  it("200 on successful dispatch", async () => {
    mockDispatch.mockResolvedValue({ ok: true });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ dispatched: true });
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0][0].token).toBe(TOKEN);
    expect(mockDispatch.mock.calls[0][0].repo).toBeUndefined();
  });

  it("502 on failed dispatch, no secrets in body", async () => {
    mockDispatch.mockResolvedValue({ ok: false, status: 404 });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(502);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ dispatched: false });
    expect(text).not.toContain(SECRET);
    expect(text).not.toContain(TOKEN);
  });

  it("passes GH_REPO through", async () => {
    process.env.GH_REPO = "a/b";
    mockDispatch.mockResolvedValue({ ok: true });
    await GET(req(`Bearer ${SECRET}`));
    expect(mockDispatch.mock.calls[0][0].repo).toBe("a/b");
  });

  it("forces the morning observe when not yet done", async () => {
    mockDispatch.mockResolvedValue({ ok: true });
    await GET(req(`Bearer ${SECRET}`));
    expect(mockDispatch.mock.calls[0][0].forceMorningObserve).toBe(true);
  });

  it("does not force the observe when it already ran today (duplicate delivery)", async () => {
    mockStatus.mockResolvedValue({ scrapeDone: true, observeDone: true });
    mockDispatch.mockResolvedValue({ ok: true });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0][0].forceMorningObserve).toBe(false);
  });

  it("fails open to a single forced dispatch when the DB check throws", async () => {
    mockStatus.mockRejectedValue(new Error("db down"));
    mockDispatch.mockResolvedValue({ ok: true });
    const res = await GET(req(`Bearer ${SECRET}`));
    expect(res.status).toBe(200);
    expect(mockDispatch).toHaveBeenCalledTimes(1);
    expect(mockDispatch.mock.calls[0][0].forceMorningObserve).toBe(true);
  });

  it("does not touch the DB when unauthorized", async () => {
    await GET(req("Bearer nope"));
    expect(mockStatus).not.toHaveBeenCalled();
  });
});
