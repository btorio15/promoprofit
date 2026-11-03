import type { NoSweatRowDTO } from "@/domain/promos/noSweatRowDto";
import { formatAmerican, formatUsd } from "@/lib/format";
import { AddedPromoActions } from "./AddedPromoActions";
import { PriceAgeNote } from "./PriceAgeNote";
import {
  buildNoSweatWaterfalls,
  estimateLegendLabel,
  formatStepAmount,
  type Waterfall,
  type WaterfallKind,
} from "./noSweatWaterfall";

interface NoSweatDetailsProps {
  dto: NoSweatRowDTO;
  onChanged: () => void;
  addedActions?: {
    onError: (message: string) => void;
    onEdit?: (promoId: number, trigger: HTMLElement | null) => void;
  };
}

const HATCH = "repeating-linear-gradient(45deg, var(--muted-foreground) 0 4px, transparent 4px 8px)";

function barClass(kind: WaterfallKind): string {
  if (kind === "in") return "bg-foreground/85";
  if (kind === "out") return "bg-destructive/75";
  return "border border-dashed border-muted-foreground";
}

function BarTrack({
  zeroPct,
  leftPct,
  widthPct,
  connectorPct,
  className,
  hatched,
}: {
  zeroPct: number;
  leftPct: number;
  widthPct: number;
  connectorPct: number;
  className: string;
  hatched?: boolean;
}) {
  return (
    <div className="relative h-[22px]" aria-hidden="true">
      <span className="absolute inset-y-0 w-px bg-muted-foreground/50" style={{ left: `${zeroPct}%` }} />
      <span
        className="absolute top-0 h-2 border-l border-dashed border-muted-foreground"
        style={{ left: `${connectorPct}%` }}
      />
      <span
        className={`absolute top-1 bottom-1 rounded-[2px] ${className}`}
        style={{
          left: `${leftPct}%`,
          width: `${widthPct}%`,
          ...(hatched ? { backgroundImage: HATCH } : {}),
        }}
      />
    </div>
  );
}

function WaterfallView({ wf, zeroPct }: { wf: Waterfall; zeroPct: number }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-sm text-muted-foreground">{wf.title}</span>
      <div className="grid grid-cols-[64px_1fr_80px] items-center gap-x-2 gap-y-1">
        <span />
        <div className="relative h-4" aria-hidden="true">
          <span
            className="absolute -translate-x-1/2 text-[11px] text-muted-foreground"
            style={{ left: `${zeroPct}%` }}
          >
            $0
          </span>
        </div>
        <span />
        {wf.steps.map((s) => (
          <div key={s.label} className="contents">
            <span className="text-sm">{s.label}</span>
            <BarTrack
              zeroPct={zeroPct}
              leftPct={s.leftPct}
              widthPct={s.widthPct}
              connectorPct={s.connectorPct}
              className={barClass(s.kind)}
              hatched={s.kind === "estimate"}
            />
            <span className={`num text-right text-sm ${s.kind === "estimate" ? "text-muted-foreground" : ""}`}>
              {formatStepAmount(s.amount, s.kind)}
            </span>
          </div>
        ))}
        <div className="contents">
          <span className="mt-1 border-t border-border pt-1 text-sm font-semibold">Net</span>
          <div className="mt-1 border-t border-border pt-1">
            <BarTrack
              zeroPct={zeroPct}
              leftPct={wf.net.leftPct}
              widthPct={wf.net.widthPct}
              connectorPct={wf.net.connectorPct}
              className="bg-foreground"
            />
          </div>
          <span className="num mt-1 border-t border-border pt-1 text-right text-sm font-semibold">
            {wf.net.label}
          </span>
        </div>
      </div>
    </div>
  );
}

function BetChip({
  heading,
  stake,
  selectionLabel,
  oddsAmerican,
  bookName,
}: {
  heading: string;
  stake: string;
  selectionLabel: string;
  oddsAmerican: number;
  bookName: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <span className="text-sm text-muted-foreground">{heading}</span>
      <p className="text-base">
        <span className="num">{formatUsd(stake)}</span> on {selectionLabel}{" "}
        <span className="num">{formatAmerican(oddsAmerican)}</span>
      </p>
      <span className="text-sm text-muted-foreground">{bookName}</span>
    </div>
  );
}

function Swatch({ className, hatched }: { className: string; hatched?: boolean }) {
  return (
    <span
      className={`inline-block h-2.5 w-4 rounded-[2px] ${className}`}
      style={hatched ? { backgroundImage: HATCH } : undefined}
      aria-hidden="true"
    />
  );
}

/**
 * Expanded no-sweat panel: the two bets plus a win and a lose waterfall on one
 * shared scale. Figures are estimates, so nothing here uses the green accent
 * (reserved for guaranteed money). All notices live in the row's (i) popover.
 */
export function NoSweatDetails({ dto, onChanged, addedActions }: NoSweatDetailsProps) {
  const { zeroPct, win, lose } = buildNoSweatWaterfalls(dto);
  return (
    <div className="flex flex-col gap-4 border-t border-border p-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col gap-3">
          <BetChip
            heading="Your bet"
            stake={dto.qualifying.stake}
            selectionLabel={dto.qualifying.selectionLabel}
            oddsAmerican={dto.qualifying.oddsAmerican}
            bookName={dto.qualifying.bookName}
          />
          <BetChip
            heading="Hedge"
            stake={dto.hedge.stake}
            selectionLabel={dto.hedge.selectionLabel}
            oddsAmerican={dto.hedge.oddsAmerican}
            bookName={dto.hedge.bookName}
          />
        </div>
        <WaterfallView wf={win} zeroPct={zeroPct} />
        <WaterfallView wf={lose} zeroPct={zeroPct} />
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground md:col-span-2 md:col-start-2">
          <span className="flex items-center gap-1.5">
            <Swatch className="bg-foreground/85" /> money in
          </span>
          <span className="flex items-center gap-1.5">
            <Swatch className="bg-destructive/75" /> money out
          </span>
          <span className="flex items-center gap-1.5">
            <Swatch className="border border-dashed border-muted-foreground" hatched />{" "}
            {estimateLegendLabel(dto.ratePct)}
          </span>
        </div>
      </div>
      {dto.addedByYou ? (
        <span className="text-sm text-muted-foreground">You added this promo.</span>
      ) : dto.attribution ? (
        <span className="text-sm text-muted-foreground">{dto.attribution}</span>
      ) : null}
      <PriceAgeNote pricesAsOf={dto.pricesAsOf} />
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
