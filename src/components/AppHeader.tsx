import { AccountMenu } from "@/components/AccountMenu";

export interface AppHeaderProps {
  displayName: string;
}

/**
 * App-wide header (D-11). Sits above OddsStatusBar inside AppShell. Not
 * sticky -- unlike OddsStatusBar, which keeps its own sticky behavior --
 * avoiding two stacked sticky elements (UI-SPEC). No hooks, so it can be
 * rendered from either a server or client parent.
 */
export function AppHeader({ displayName }: AppHeaderProps) {
  return (
    <div className="border-b border-border bg-secondary px-4">
      <div className="mx-auto flex h-14 w-full max-w-[1080px] items-center justify-between">
        <span className="text-xl font-semibold">PromoProfit</span>
        <AccountMenu displayName={displayName} />
      </div>
    </div>
  );
}
