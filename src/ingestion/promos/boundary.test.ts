import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Permanent boundary/anti-bot guards (PROMO-03, D-09, CLAUDE.md's Playwright
 * scoping). The scraper must never leak into the Next.js app bundle, and no
 * anti-bot/browser dependency may ever re-enter the repo, this phase or any
 * future one.
 */

const REPO_ROOT = join(__dirname, "..", "..", "..");

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walkFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const FORBIDDEN_IMPORT_RE = /cheerio|playwright(?:-extra)?|puppeteer|@\/ingestion\/promos/;

describe("scraper/app-router boundary", () => {
  it("no file under src/app or src/components imports a scraper/browser package or src/ingestion/promos", () => {
    const roots = [join(REPO_ROOT, "src", "app"), join(REPO_ROOT, "src", "components")];
    const offenders: string[] = [];

    for (const root of roots) {
      for (const file of walkFiles(root)) {
        const text = readFileSync(file, "utf8");
        const importLines = text
          .split("\n")
          .filter((line) => /^\s*import\s/.test(line) || /require\(/.test(line));
        for (const line of importLines) {
          if (FORBIDDEN_IMPORT_RE.test(line)) {
            offenders.push(`${file}: ${line.trim()}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("root package.json never depends on playwright or puppeteer", () => {
    const pkg = JSON.parse(readFileSync(join(REPO_ROOT, "package.json"), "utf8")) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    const matches = Object.keys(allDeps).filter((name) => /playwright|puppeteer/i.test(name));
    expect(matches).toEqual([]);
  });

  it("no non-test file under src/ingestion/promos/books ever sends a cookie or forges x-px-context", () => {
    const booksDir = join(REPO_ROOT, "src", "ingestion", "promos", "books");
    const offenders: string[] = [];

    for (const file of walkFiles(booksDir)) {
      if (file.endsWith(".test.ts")) continue;
      const text = readFileSync(file, "utf8");
      if (/x-px-context/i.test(text) || /\bcookie\b/i.test(text)) {
        offenders.push(file);
      }
    }

    expect(offenders).toEqual([]);
  });
});
