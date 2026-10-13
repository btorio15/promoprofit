import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Sport } from "@/domain/odds/schemas";

vi.mock("./client", () => ({
  listSportsWithQuota: vi.fn(),
  OddsApiError: class OddsApiError extends Error {
    status: number | null;
    constructor(message: string, status: number | null = null) {
      super(message);
      this.status = status;
    }
  },
}));

vi.mock("./store", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./store")>()),
  getLatestCreditUsage: vi.fn(),
  getLatestCreditUsageByKey: vi.fn(),
}));

import { listSportsWithQuota, OddsApiError } from "./client";
import { getLatestCreditUsage, getLatestCreditUsageByKey, type CreditUsageRow } from "./store";
import { keyFingerprint } from "./oddsKeys";
import { selectOddsKeyForRefresh } from "./keySelection";

const NOW = new Date("2026-10-13T12:00:00.000Z");
const A = "test-key-a";
const B = "test-key-b";
const C = "test-key-c";
const probe = vi.mocked(listSportsWithQuota);
const SPORTS: Sport[] = [{ key: "basketball_nba", group: "Basketball", title: "NBA", active: true }];

function row(remaining: number, used: number, minutesAgo = 60): CreditUsageRow {
  return {
    requestsRemaining: remaining,
    requestsUsed: used,
    refreshCost: 2,
    sportsFetched: 2,
    recordedAt: new Date(NOW.getTime() - minutesAgo * 60_000),
  };
}

/** Probe answers per raw key: a number = remaining header, null = no header, "fail" = rejected. */
function setProbes(answers: Record<string, number | null | "fail">) {
  probe.mockImplementation(async (key: string) => {
    const a = answers[key];
    if (a === "fail") throw new OddsApiError("Odds API returned an error for /sports", 401);
    return { sports: SPORTS, quota: { remaining: a ?? null, used: a === null || a === undefined ? null : 500 - a, last: 0 } };
  });
}

function setDb(byKey: Record<string, CreditUsageRow>, legacy?: CreditUsageRow, global?: CreditUsageRow | null) {
  const map = new Map<string | null, CreditUsageRow>(
    Object.entries(byKey).map(([k, v]) => [keyFingerprint(k), v]),
  );
  if (legacy) map.set(null, legacy);
  vi.mocked(getLatestCreditUsageByKey).mockResolvedValue({ keyColumn: true, byKeyId: map });
  vi.mocked(getLatestCreditUsage).mockResolvedValue(global ?? null);
}

let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  errSpy.mockRestore();
});

const env3 = { ODDS_API_KEYS: `${A},${B},${C}` };

describe("selectOddsKeyForRefresh (3 keys, key_id column present)", () => {
  it("probes every key and picks the one with the most credits (fresh key counts as 500)", async () => {
    setDb({ [A]: row(300, 200), [B]: row(450, 50) });
    setProbes({ [A]: 300, [B]: 450, [C]: 500 });
    const sel = await selectOddsKeyForRefresh(NOW, env3);
    expect(probe).toHaveBeenCalledTimes(3);
    expect(sel.key).toBe(C);
    expect(sel.id).toBe(keyFingerprint(C));
    expect(sel.priorRemaining).toBe(500);
    expect(sel.sports).toEqual(SPORTS);
  });

  it("excludes a key whose probe fails and logs only its fingerprint and status", async () => {
    setDb({ [A]: row(300, 200), [B]: row(450, 50) });
    setProbes({ [A]: 300, [B]: "fail", [C]: 100 });
    const sel = await selectOddsKeyForRefresh(NOW, env3);
    expect(sel.key).toBe(A);
    expect(errSpy).toHaveBeenCalledWith("Odds API key probe failed", { keyId: keyFingerprint(B), status: 401 });
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("test-key");
  });

  it("breaks equal balances toward the first configured key", async () => {
    setDb({});
    setProbes({ [A]: 200, [B]: 200, [C]: 200 });
    expect((await selectOddsKeyForRefresh(NOW, env3)).key).toBe(A);
  });

  it("falls back to the DB effective balance, then 500, when a probe has no remaining header", async () => {
    setDb({ [A]: row(100, 400), [B]: row(120, 380) });
    setProbes({ [A]: null, [B]: null, [C]: null });
    const sel = await selectOddsKeyForRefresh(NOW, env3);
    expect(sel.key).toBe(C); // no history -> 500
    expect(sel.priorRemaining).toBeNull();
    setProbes({ [A]: null, [B]: null, [C]: 10 });
    const sel2 = await selectOddsKeyForRefresh(NOW, env3);
    expect(sel2.key).toBe(B); // 120 beats 100 and 10
    expect(sel2.priorRemaining).toBe(120);
    expect(sel2.priorUsed).toBe(380);
  });

  it("returns the global latest row for the confirm window", async () => {
    const global = row(300, 200, 5);
    setDb({ [A]: row(300, 200, 5) }, undefined, global);
    setProbes({ [A]: 300, [B]: 500, [C]: 500 });
    const sel = await selectOddsKeyForRefresh(NOW, env3);
    expect(sel.key).toBe(B);
    expect(sel.globalLatest).toBe(global);
  });

  it("counts legacy null rows toward ODDS_API_KEY", async () => {
    setDb({}, row(50, 450));
    setProbes({ [A]: null, [B]: 400, [C]: 400 });
    const sel = await selectOddsKeyForRefresh(NOW, { ...env3, ODDS_API_KEY: A });
    expect(sel.key).toBe(B);
  });
});

describe("selectOddsKeyForRefresh (key_id column missing)", () => {
  beforeEach(() => {
    vi.mocked(getLatestCreditUsageByKey).mockResolvedValue({ keyColumn: false });
  });

  it("probes and chooses only the legacy key, using the global latest row, even with 3 keys", async () => {
    vi.mocked(getLatestCreditUsage).mockResolvedValue(row(300, 200));
    setProbes({ [A]: null, [B]: 500, [C]: 500 });
    const sel = await selectOddsKeyForRefresh(NOW, { ...env3, ODDS_API_KEY: B });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(sel.key).toBe(B);
    expect(sel.priorRemaining).toBe(500);
  });

  it("uses ODDS_API_KEY itself even when it is not in ODDS_API_KEYS", async () => {
    vi.mocked(getLatestCreditUsage).mockResolvedValue(row(300, 200));
    setProbes({ "test-key-solo": null });
    const sel = await selectOddsKeyForRefresh(NOW, { ...env3, ODDS_API_KEY: "test-key-solo" });
    expect(probe).toHaveBeenCalledWith("test-key-solo");
    expect(sel.key).toBe("test-key-solo");
    expect(sel.priorRemaining).toBe(300);
  });

  it("uses the first ODDS_API_KEYS entry when ODDS_API_KEY is unset", async () => {
    vi.mocked(getLatestCreditUsage).mockResolvedValue(null);
    setProbes({ [A]: null });
    expect((await selectOddsKeyForRefresh(NOW, env3)).key).toBe(A);
    expect(probe).toHaveBeenCalledTimes(1);
  });
});

describe("selectOddsKeyForRefresh (single key)", () => {
  const env1 = { ODDS_API_KEY: A };
  beforeEach(() => {
    vi.mocked(getLatestCreditUsageByKey).mockResolvedValue({ keyColumn: false });
  });

  it("gate balance is unchanged when the probe's remaining equals the DB balance", async () => {
    vi.mocked(getLatestCreditUsage).mockResolvedValue(row(300, 200));
    setProbes({ [A]: null });
    const dbOnly = await selectOddsKeyForRefresh(NOW, env1);
    setProbes({ [A]: 300 });
    const withProbe = await selectOddsKeyForRefresh(NOW, env1);
    expect(withProbe.priorRemaining).toBe(dbOnly.priorRemaining);
    expect(withProbe.priorRemaining).toBe(300);
    expect(withProbe.priorUsed).toBe(200);
  });

  it("the probe's real balance wins when it differs from the DB balance (intended change)", async () => {
    vi.mocked(getLatestCreditUsage).mockResolvedValue(row(300, 200));
    setProbes({ [A]: 120 });
    const sel = await selectOddsKeyForRefresh(NOW, env1);
    expect(sel.priorRemaining).toBe(120);
    expect(sel.priorUsed).toBe(380);
  });

  it("fails with a key-free error when the probe fails", async () => {
    vi.mocked(getLatestCreditUsage).mockResolvedValue(null);
    setProbes({ [A]: "fail" });
    const err = await selectOddsKeyForRefresh(NOW, env1).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OddsApiError);
    expect(String(err)).not.toContain(A);
  });
});

describe("selectOddsKeyForRefresh (misconfiguration)", () => {
  it("throws the missing-key message with zero keys", async () => {
    vi.mocked(getLatestCreditUsage).mockResolvedValue(null);
    vi.mocked(getLatestCreditUsageByKey).mockResolvedValue({ keyColumn: true, byKeyId: new Map() });
    await expect(selectOddsKeyForRefresh(NOW, {})).rejects.toThrow("ODDS_API_KEY is not set");
    expect(probe).not.toHaveBeenCalled();
  });

  it("throws a key-free error when every probe fails", async () => {
    setDb({});
    setProbes({ [A]: "fail", [B]: "fail", [C]: "fail" });
    const err = await selectOddsKeyForRefresh(NOW, env3).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OddsApiError);
    expect(String(err)).not.toContain("test-key");
    expect(JSON.stringify(errSpy.mock.calls)).not.toContain("test-key");
  });
});
