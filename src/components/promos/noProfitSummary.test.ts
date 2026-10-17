import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const COMPONENTS_DIR = join(__dirname, "..");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(name) && !name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

describe("STATS-10: no profit summary on the Promos tab", () => {
  it("ProfitSummary.tsx no longer exists", () => {
    expect(existsSync(join(__dirname, "ProfitSummary.tsx"))).toBe(false);
  });

  it("no component source references ProfitSummary", () => {
    const offenders = walk(COMPONENTS_DIR).filter((f) => readFileSync(f, "utf8").includes("ProfitSummary"));
    expect(offenders).toEqual([]);
  });

  it("PromosScreen shows no profit summary", () => {
    const src = readFileSync(join(__dirname, "PromosScreen.tsx"), "utf8");
    for (const needle of ["Total profit extracted", "Total profit available", "ProfitSummary"]) {
      expect(src).not.toContain(needle);
    }
  });
});
