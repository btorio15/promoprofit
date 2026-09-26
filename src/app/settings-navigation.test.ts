import React from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// vi.hoisted mocks so they're available inside vi.mock factories below
// (hoisted mocks run before the mocked modules are imported).
const mockRequireUser = vi.hoisted(() =>
  vi.fn(() => Promise.resolve({ userId: 1, email: "mike@example.com", displayName: "Mike" })),
);
const mockGetUsableUserBooks = vi.hoisted(() => vi.fn(() => Promise.resolve([])));
const mockGetBonusBooks = vi.hoisted(() => vi.fn(() => Promise.resolve([])));

vi.mock("@/lib/session", () => ({
  requireUser: mockRequireUser,
}));
vi.mock("@/db/queries", () => ({
  getUsableUserBooks: mockGetUsableUserBooks,
  getBonusBooks: mockGetBonusBooks,
}));
vi.mock("@/components/AccountMenu", () => ({
  AccountMenu: () => null,
}));
vi.mock("@/components/settings/SettingsBooksForm", () => ({
  SettingsBooksForm: () => null,
}));
// Next's real Link needs router context outside Next -- render a plain anchor instead.
vi.mock("next/link", () => ({
  default: ({ href, className, children }: { href: string; className?: string; children?: React.ReactNode }) =>
    React.createElement("a", { href, className }, children),
}));

import { AppHeader } from "@/components/AppHeader";
import SettingsPage from "./settings/page";

describe("settings navigation (owner-reported gap closure)", () => {
  it("AppHeader wordmark is an anchor linking to / with text PromoProfit", () => {
    const markup = renderToStaticMarkup(React.createElement(AppHeader, { displayName: "Mike" }));

    expect(markup).toMatch(/<a href="\/"[^>]*>PromoProfit<\/a>/);
  });

  it("SettingsPage renders a Back to PromoProfit anchor linking to /", async () => {
    const element = await SettingsPage();
    const markup = renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0]);

    expect(markup).toMatch(/<a href="\/"[^>]*>[^<]*Back to PromoProfit<\/a>/);
  });

  it("the Back to PromoProfit link appears before the Settings heading", async () => {
    const element = await SettingsPage();
    const markup = renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0]);

    const backLinkIndex = markup.indexOf("Back to PromoProfit");
    const headingIndex = markup.indexOf(">Settings<");

    expect(backLinkIndex).toBeGreaterThan(-1);
    expect(headingIndex).toBeGreaterThan(-1);
    expect(backLinkIndex).toBeLessThan(headingIndex);
  });

  it("SettingsPage (with the real AppHeader) contains at least 2 anchors linking to /", async () => {
    const element = await SettingsPage();
    const markup = renderToStaticMarkup(element as Parameters<typeof renderToStaticMarkup>[0]);

    const matches = markup.match(/<a href="\/"/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });
});
