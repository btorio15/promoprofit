"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { logout } from "@/app/actions/logout";
import { safeAction } from "@/lib/safeAction";
import { resolveLogoutOutcome } from "@/components/auth/authFormOutcome";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface AccountMenuProps {
  displayName: string;
}

/**
 * Header account menu (D-11). Two items only -- Settings and Log out.
 * Log out uses default menu-item styling, not destructive/red (UI-SPEC
 * Color: logging out is a single-click, non-destructive, immediately
 * reversible action).
 */
export function AccountMenu({ displayName }: AccountMenuProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [logoutError, setLogoutError] = useState<string | null>(null);

  return (
    <div className="flex items-center gap-2">
      {logoutError ? (
        <span role="alert" className="text-sm text-destructive">
          {logoutError}
        </span>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" className="h-10 gap-1.5">
              <span className="text-sm">{displayName}</span>
              <ChevronDown className="size-4" aria-hidden="true" />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => router.push("/settings")}>Settings</DropdownMenuItem>
          <DropdownMenuItem
            disabled={isPending}
            onClick={() =>
              startTransition(async () => {
                setLogoutError(null);
                const call = await safeAction(() => logout(), "logout");
                setLogoutError(resolveLogoutOutcome(call));
              })
            }
          >
            Log out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
