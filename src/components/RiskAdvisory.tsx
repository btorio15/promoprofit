import { Alert, AlertDescription } from "@/components/ui/alert";

/**
 * Single shared source of the account-risk advisory copy (CALC-06, D-23).
 * Rendered verbatim on both the Arbitrage tab and the bonus-bet finder, so
 * the two tabs can never drift onto slightly different wording for the
 * same warning.
 */
export function RiskAdvisory() {
  return (
    <Alert>
      <AlertDescription>
        Placing exact, identically-sized stakes across several books is a known pattern sportsbooks use to detect and limit arbing accounts. That risk exists for every row below — it&apos;s not a reason to skip a profitable one, just something to weigh.
      </AlertDescription>
    </Alert>
  );
}
