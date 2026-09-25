import type { OddsStatus } from "@/ingestion/odds/status";
import { Alert, AlertDescription } from "@/components/ui/alert";

export interface CreditBannerProps {
  status: OddsStatus;
}

/**
 * Credit-meter warning/blocked banners (ODDS-02, D-11). Renders nothing
 * for normal/unknown levels.
 */
export function CreditBanner({ status }: CreditBannerProps) {
  if (status.level === "warning") {
    return (
      <Alert>
        <AlertDescription className="num text-warning">
          Only {status.remaining} credits remaining this month — a refresh uses approximately{" "}
          {status.estimatedRefreshCredits} credits.
        </AlertDescription>
      </Alert>
    );
  }

  if (status.level === "blocked") {
    return (
      <Alert variant="destructive">
        <AlertDescription className="num">
          Only {status.remaining} credits left — refresh is disabled until next month&apos;s
          reset (1st).
        </AlertDescription>
      </Alert>
    );
  }

  return null;
}
