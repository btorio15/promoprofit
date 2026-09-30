"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

// No global-error.tsx: the root layout does no data fetching (fonts +
// TooltipProvider only), so this segment boundary is enough (quick-260930-iaw).
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    // Dev visibility only; never rendered (may contain connection details).
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col items-start gap-4 px-4 py-16">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p className="text-muted-foreground">
        We couldn&apos;t load this page — usually a brief connection hiccup. Try again in a moment.
      </p>
      <Button type="button" onClick={() => retry()}>
        Try again
      </Button>
    </div>
  );
}
