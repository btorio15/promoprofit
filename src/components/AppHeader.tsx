import Link from "next/link";
import { AccountMenu } from "@/components/AccountMenu";
import { Brand } from "@/components/Brand";

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
    <header className="border-b border-white/15 bg-[#080808] px-4 text-white sm:px-6">
      <div className="mx-auto flex min-h-20 w-full max-w-[1200px] items-center justify-between gap-4">
        <Link href="/" className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white">
          <Brand />
        </Link>
        <span className="mr-auto hidden border-l border-white/25 pl-5 text-xs font-semibold tracking-[0.16em] text-blue-100 md:block">
          SPORTSBOOK INTELLIGENCE
        </span>
        <div className="rounded-md border border-white/30 [&_button]:text-white [&_button:hover]:bg-white/10 [&_button:hover]:text-white">
          <AccountMenu displayName={displayName} />
        </div>
      </div>
    </header>
  );
}
