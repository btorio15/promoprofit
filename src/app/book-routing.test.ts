import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// vi.hoisted mocks so they're available inside vi.mock factories below
// (hoisted mocks run before the mocked modules are imported).
const mockRequireUser = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ userId: 1, email: "mike@example.com", displayName: "Mike" })),
);
const mockRedirect = vi.hoisted(() =>
  vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
);
const mockGetUsableUserBooks = vi.hoisted(() => vi.fn());
const TWO_BOOK_STUB = [
  { key: "draftkings", displayName: "DraftKings" },
  { key: "fanduel", displayName: "FanDuel" },
];
const mockGetBonusBooks = vi.hoisted(() => vi.fn(() => Promise.resolve(TWO_BOOK_STUB)));
const mockGetOddsFreshness = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
// Spy that must NOT be called by any of the three pages under test (CR-02/WR-01:
// they must all go through getUsableUserBooks instead).
const mockGetUserBookKeys = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
const mockSettingsBooksForm = vi.hoisted(() =>
  vi.fn((_props: { books: unknown; initialKeys: string[] }) => {
    void _props;
    return null;
  }),
);

vi.mock("@/lib/session", () => ({
  requireUser: mockRequireUser,
}));
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
}));
vi.mock("@/db/queries", () => ({
  getUsableUserBooks: mockGetUsableUserBooks,
  getBonusBooks: mockGetBonusBooks,
  getOddsFreshness: mockGetOddsFreshness,
  getUserBookKeys: mockGetUserBookKeys,
}));
vi.mock("@/ingestion/odds/status", () => ({
  getOddsStatus: vi.fn(() => Promise.resolve({})),
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: () => null,
}));
vi.mock("@/components/AppHeader", () => ({
  AppHeader: () => null,
}));
vi.mock("@/components/settings/OnboardingBooksForm", () => ({
  OnboardingBooksForm: () => null,
}));
vi.mock("@/components/settings/SettingsBooksForm", () => ({
  SettingsBooksForm: mockSettingsBooksForm,
}));

import Home from "./page";
import OnboardingBooksPage from "./onboarding/books/page";
import SettingsPage from "./settings/page";

type RedirectOutcome = { redirected: true; to: string } | { redirected: false };

async function runAndCaptureRedirect(fn: () => Promise<unknown>): Promise<RedirectOutcome> {
  try {
    await fn();
    return { redirected: false };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const match = /^NEXT_REDIRECT:(.+)$/.exec(message);
    if (!match) throw err;
    return { redirected: true, to: match[1] };
  }
}

describe("book routing invariant (CR-02, WR-01)", () => {
  const states: { name: string; usableSaved: typeof TWO_BOOK_STUB }[] = [
    { name: "no saved books", usableSaved: [] },
    { name: "stale-only saved books", usableSaved: [] },
    { name: "usable saved book", usableSaved: [{ key: "fanduel", displayName: "FanDuel" }] },
  ];

  for (const state of states) {
    it(`state "${state.name}": exactly one of {Home -> /onboarding/books, Onboarding -> /} is true, no loop`, async () => {
      mockGetUsableUserBooks.mockReset().mockResolvedValue(state.usableSaved);

      const homeOutcome = await runAndCaptureRedirect(() => Home());
      const onboardingOutcome = await runAndCaptureRedirect(() => OnboardingBooksPage());

      const homeRedirectsToOnboarding = homeOutcome.redirected && homeOutcome.to === "/onboarding/books";
      const onboardingRedirectsHome = onboardingOutcome.redirected && onboardingOutcome.to === "/";

      // Exactly one of the two redirects fires -- never both, never neither.
      expect(homeRedirectsToOnboarding !== onboardingRedirectsHome).toBe(true);

      if (state.usableSaved.length === 0) {
        expect(homeRedirectsToOnboarding).toBe(true);
        expect(onboardingOutcome.redirected).toBe(false);
      } else {
        expect(homeOutcome.redirected).toBe(false);
        expect(onboardingRedirectsHome).toBe(true);
      }
    });
  }

  it("none of the three pages call getUserBookKeys directly", async () => {
    mockGetUsableUserBooks.mockReset().mockResolvedValue([]);
    mockGetUserBookKeys.mockClear();

    await runAndCaptureRedirect(() => Home());
    await runAndCaptureRedirect(() => OnboardingBooksPage());

    mockGetUsableUserBooks.mockReset().mockResolvedValue([{ key: "draftkings", displayName: "DraftKings" }]);
    const settingsElement = await SettingsPage();
    renderToStaticMarkup(settingsElement as Parameters<typeof renderToStaticMarkup>[0]);

    expect(mockGetUserBookKeys).not.toHaveBeenCalled();
  });
});

describe("SettingsPage seeds initialKeys from getUsableUserBooks (WR-01)", () => {
  it("passes only usable saved keys as initialKeys", async () => {
    mockGetUsableUserBooks.mockReset().mockResolvedValue([{ key: "draftkings", displayName: "DraftKings" }]);
    mockSettingsBooksForm.mockClear();

    const element = await SettingsPage();
    renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0]);

    expect(mockSettingsBooksForm).toHaveBeenCalled();
    const props = mockSettingsBooksForm.mock.calls[0][0];
    expect(props.initialKeys).toEqual(["draftkings"]);
  });

  it("passes an empty initialKeys array when the user has no usable saved books", async () => {
    mockGetUsableUserBooks.mockReset().mockResolvedValue([]);
    mockSettingsBooksForm.mockClear();

    const element = await SettingsPage();
    renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0]);

    expect(mockSettingsBooksForm).toHaveBeenCalled();
    const props = mockSettingsBooksForm.mock.calls[0][0];
    expect(props.initialKeys).toEqual([]);
  });
});
