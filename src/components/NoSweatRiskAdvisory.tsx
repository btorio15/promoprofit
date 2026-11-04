import { TriangleAlert } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { NO_SWEAT_RISK_COPY } from "@/components/promos/noSweatRowView";

/**
 * Phase 9 (D-20): the no-sweat account-risk line. "full" is an Alert box for
 * the expanded panel; "compact" is a single amber line for beside Track
 * buttons and on cards. Copy lives in noSweatRowView so it is tested once.
 */
export function NoSweatRiskAdvisory({ variant = "full" }: { variant?: "full" | "compact" }) {
  if (variant === "compact") {
    return (
      <p className="flex items-start gap-1 text-sm text-warning">
        <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>{NO_SWEAT_RISK_COPY}</span>
      </p>
    );
  }
  return (
    <Alert>
      <TriangleAlert className="size-4 text-warning" aria-hidden="true" />
      <AlertDescription>{NO_SWEAT_RISK_COPY}</AlertDescription>
    </Alert>
  );
}
