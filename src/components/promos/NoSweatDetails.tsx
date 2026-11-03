import type { NoSweatRowDTO } from "@/domain/promos/noSweatRowDto";
import { formatAmerican, formatPct, formatUsd } from "@/lib/format";
import { NoSweatRiskAdvisory } from "@/components/NoSweatRiskAdvisory";
import { AddedPromoActions } from "./AddedPromoActions";
import { PriceAgeNote } from "./PriceAgeNote";
import { TrackButton } from "./TrackButton";
import { TRACK_HELPER_COPY, signedUsd } from "./noSweatRowView";

interface NoSweatDetailsProps {
  dto: NoSweatRowDTO;
  precision: "whole" | "cents";
  onChanged: () => void;
  addedActions?: {
    onError: (message: string) => void;
    onEdit?: (promoId: number, trigger: HTMLElement | null) => void;
  };
}

/**
 * Expanded no-sweat panel (mirrors PromoDetails). Figures are estimates, so
 * nothing here uses the green accent (reserved for guaranteed money).
 */
export function NoSweatDetails({ dto, precision, onChanged, addedActions }: NoSweatDetailsProps) {
  const q = dto.qualifying;
  const h = dto.hedge;
  return (
    <div className="flex flex-col gap-4 border-t border-border p-6">
      <p className="text-base">
        Bet <span className="num">{formatUsd(q.stake)}</span> on {q.selectionLabel}{" "}
        <span className="num">{formatAmerican(q.oddsAmerican)}</span> at {q.bookName}, hedge{" "}
        <span className="num">{formatUsd(h.stake)}</span> on {h.selectionLabel}{" "}
        <span className="num">{formatAmerican(h.oddsAmerican)}</span> at {h.bookName}. If your bet loses you get
        back a <span className="num">{formatUsd(dto.refundAmount)}</span> bonus bet.
      </p>
      <ul className="flex flex-col gap-1 text-base">
        <li>
          If it wins: <span className="num">+{formatUsd(dto.profitIfWin)}</span>
        </li>
        <li>
          If it loses: refund of <span className="num">{formatUsd(dto.refundAmount)}</span> bonus bet worth about{" "}
          <span className="num">{formatUsd(dto.refundValue)}</span> at{" "}
          <span className="num">{formatPct(dto.ratePct)}</span>, hedge pays{" "}
          <span className="num">{formatUsd(h.payout)}</span>
        </li>
        <li className="text-muted-foreground">
          Worst case: <span className="num">{signedUsd(dto.worstCaseProfit)}</span>
        </li>
      </ul>
      {dto.addedByYou ? (
        <span className="text-sm text-muted-foreground">You added this promo.</span>
      ) : dto.attribution ? (
        <span className="text-sm text-muted-foreground">{dto.attribution}</span>
      ) : null}
      <PriceAgeNote pricesAsOf={dto.pricesAsOf} />
      <NoSweatRiskAdvisory />
      <div className="flex flex-col gap-2">
        <span className="text-sm text-muted-foreground">{TRACK_HELPER_COPY}</span>
        <TrackButton
          promoId={dto.promoId}
          precision={precision}
          expectedEstimate={dto.estimatedProfit}
          onChanged={onChanged}
        />
      </div>
      {dto.addedByYou && addedActions ? (
        <AddedPromoActions
          promoId={dto.promoId}
          canExpire
          isDone={false}
          onChanged={onChanged}
          onError={addedActions.onError}
          onEdit={addedActions.onEdit}
        />
      ) : null}
    </div>
  );
}
