import { ACTION_FAILED_MESSAGE, type SafeActionResult } from "@/lib/safeAction";
import type { FindHedgesResponse } from "@/domain/finder/types";

type InvalidResponse = Extract<FindHedgesResponse, { status: "invalid" }>;

export type FinderOutcome =
  | { kind: "error"; message: string }
  | { kind: "invalid"; fieldErrors: InvalidResponse["fieldErrors"] }
  | { kind: "response"; response: Exclude<FindHedgesResponse, { status: "invalid" }> };

/** Pure mapping of a safeAction(findHedges) result to the finder's next UI state. */
export function resolveFinderOutcome(result: SafeActionResult<FindHedgesResponse>): FinderOutcome {
  if (!result.ok) return { kind: "error", message: ACTION_FAILED_MESSAGE };
  const response = result.value;
  if (response.status === "invalid") {
    return { kind: "invalid", fieldErrors: response.fieldErrors };
  }
  return { kind: "response", response };
}
