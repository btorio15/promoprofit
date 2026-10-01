import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";

export interface AppHeaderProps {
  displayName: string;
}

/**
 * App-wide header (D-11). Sits above OddsStatusBar inside AppShell. Not
 * sticky -- unlike OddsStatusBar, which keeps its own sticky behavior --
 * avoiding two stacked sticky elements (UI-SPEC). No hooks, so it can be
 * rendered from either a server or client parent.
 *
 * The "MarginMind" wordmark links to / (amends UI-SPEC line 42: owner
 * reported no way back to the main page from /settings after 02-06 -- the
 * Settings page itself invalidated the premise that there was "no other
 * page to navigate home to"). Same styling, no underline -- it reads as a
 * brand wordmark, not a text link.
 */
export function AppHeader({ displayName }: AppHeaderProps) {
  return (
    <div className="border-b border-border bg-secondary px-4">
      <div className="mx-auto flex h-14 w-full max-w-[1080px] items-center justify-between">
        <Link href="/" className="text-xl font-semibold">
          MarginMind
        </Link>
        <AccountMenu displayName={displayName} />
      </div>
    </div>
  );
}
