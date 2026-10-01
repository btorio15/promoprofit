import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_GH_REPO, dispatchScrapeWorkflow } from "./githubDispatch";

const TOKEN = "ghp_TESTSECRET123";
let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errSpy.mockRestore();
});

describe("dispatchScrapeWorkflow", () => {
  it("sends one correct POST", async () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const r = await dispatchScrapeWorkflow({ token: TOKEN, fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: true });
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = f.mock.calls[0];
    expect(url).toBe(
      "https://api.github.com/repos/btorio15/promoprofit/actions/workflows/scrape-promos.yml/dispatches",
    );
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "promoprofit-cron",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(init.body)).toEqual({
      ref: "main",
      inputs: { force_morning_observe: "true" },
    });
  });

  it("repo option overrides the URL segment", async () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await dispatchScrapeWorkflow({ token: TOKEN, repo: "someone/else", fetchImpl: f as unknown as typeof fetch });
    expect(f.mock.calls[0][0]).toContain("/repos/someone/else/actions/");
  });

  it("200 is ok too", async () => {
    const f = vi.fn().mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await dispatchScrapeWorkflow({ token: TOKEN, fetchImpl: f as unknown as typeof fetch })).toEqual({ ok: true });
  });

  it.each([403, 404, 422])("status %i returns failure and logs snippet", async (status) => {
    const f = vi.fn().mockResolvedValue(new Response("x".repeat(500), { status }));
    const r = await dispatchScrapeWorkflow({ token: TOKEN, fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: false, status });
    const args = errSpy.mock.calls[0];
    expect(args[1]).toBe(status);
    expect((args[2] as string).length).toBeLessThanOrEqual(200);
  });

  it("network error returns failure without throwing", async () => {
    const f = vi.fn().mockRejectedValue(new Error("boom"));
    const r = await dispatchScrapeWorkflow({ token: TOKEN, fetchImpl: f as unknown as typeof fetch });
    expect(r).toEqual({ ok: false });
    expect(r).not.toHaveProperty("status");
  });

  it("never leaks the token", async () => {
    const f1 = vi.fn().mockResolvedValue(new Response(`bad ${TOKEN}`.slice(0, 4), { status: 403 }));
    const f2 = vi.fn().mockRejectedValue(new Error("boom"));
    const r1 = await dispatchScrapeWorkflow({ token: TOKEN, fetchImpl: f1 as unknown as typeof fetch });
    const r2 = await dispatchScrapeWorkflow({ token: TOKEN, fetchImpl: f2 as unknown as typeof fetch });
    expect(JSON.stringify(r1)).not.toContain(TOKEN);
    expect(JSON.stringify(r2)).not.toContain(TOKEN);
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain(TOKEN);
  });

  it("sends force_morning_observe=false when forceMorningObserve is false", async () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await dispatchScrapeWorkflow({ token: TOKEN, forceMorningObserve: false, fetchImpl: f as unknown as typeof fetch });
    expect(JSON.parse(f.mock.calls[0][1].body).inputs).toEqual({ force_morning_observe: "false" });
  });

  it("uses a valid owner/name repo", async () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    await dispatchScrapeWorkflow({ token: TOKEN, repo: "a-b/c.d_e", fetchImpl: f as unknown as typeof fetch });
    expect(f.mock.calls[0][0]).toContain("/repos/a-b/c.d_e/actions/");
  });

  it.each(["../..", "a/b?x=1", "a/b/c", "owner", "a/b#frag", "a b/c"])(
    "falls back to the default repo for invalid GH_REPO %j",
    async (repo) => {
      const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
      await dispatchScrapeWorkflow({ token: TOKEN, repo, fetchImpl: f as unknown as typeof fetch });
      expect(f.mock.calls[0][0]).toBe(
        `https://api.github.com/repos/${DEFAULT_GH_REPO}/actions/workflows/scrape-promos.yml/dispatches`,
      );
    },
  );
});
