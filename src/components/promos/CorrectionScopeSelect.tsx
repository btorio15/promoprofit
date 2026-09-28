"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CorrectionOptions } from "@/domain/promos/dto";

/**
 * quick-260928-it1: the "Game or day" Select shared by QueueItemCard's
 * Correct sub-panel and ClassifyQueueCard's boost/bonus sub-panels
 * (03-UI-SPEC.md "Correct sub-panel" / ClassifyQueueCard "Game or day").
 * Extracted verbatim from QueueItemCard.tsx (identical rendering/behavior)
 * so both callers share one implementation instead of drifting.
 */

export const EVENT_PREFIX = "event:";
export const DAY_PREFIX = "day:";

interface SportGroup {
  sportKey: string;
  sportLabel: string;
  sportDays: CorrectionOptions["sportDays"];
  events: CorrectionOptions["events"];
}

/**
 * Groups correctionOptions' two flat lists into one Select's sport-labelled
 * groups, sport-day choices listed before that sport's games within each
 * group. Both source lists already come pre-sorted by SPORTS order
 * (correctionOptions.ts), so insertion order here is preserved as-is, never
 * re-sorted.
 */
function groupCorrectionOptions(options: CorrectionOptions): SportGroup[] {
  const order: string[] = [];
  const groups = new Map<string, SportGroup>();

  function groupFor(sportKey: string, sportLabel: string): SportGroup {
    let group = groups.get(sportKey);
    if (!group) {
      group = { sportKey, sportLabel, sportDays: [], events: [] };
      groups.set(sportKey, group);
      order.push(sportKey);
    }
    return group;
  }

  for (const day of options.sportDays) {
    groupFor(day.sportKey, day.sportLabel).sportDays.push(day);
  }
  for (const event of options.events) {
    groupFor(event.sportKey, event.sportLabel).events.push(event);
  }

  return order.map((key) => groups.get(key)!);
}

export type ScopeSelectionInput =
  | { kind: "event"; eventId: string }
  | { kind: "sport_day"; sportKey: string; etDate: string };

/** Turns a CorrectionScopeSelect's raw string value into the shape correctPromoMatch/classifyPromo's scope input expects. */
export function scopeInputFromValue(value: string): ScopeSelectionInput {
  if (value.startsWith(EVENT_PREFIX)) {
    return { kind: "event", eventId: value.slice(EVENT_PREFIX.length) };
  }
  const [sportKey, etDate] = value.slice(DAY_PREFIX.length).split("|");
  return { kind: "sport_day", sportKey, etDate };
}

interface CorrectionScopeSelectProps {
  id: string;
  value: string | null;
  onValueChange: (value: string | null) => void;
  options: CorrectionOptions;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function CorrectionScopeSelect({
  id,
  value,
  onValueChange,
  options,
  label = "Event",
  placeholder = "Choose a game or day",
  disabled,
}: CorrectionScopeSelectProps) {
  const sportGroups = groupCorrectionOptions(options);

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={value} onValueChange={(v) => onValueChange(v ?? null)}>
        <SelectTrigger id={id} className="h-10 w-full" disabled={disabled}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {sportGroups.map((group) => (
            <SelectGroup key={group.sportKey}>
              <SelectLabel>{group.sportLabel}</SelectLabel>
              {group.sportDays.map((day) => (
                <SelectItem key={day.value} value={`${DAY_PREFIX}${day.value}`}>
                  {day.label}
                </SelectItem>
              ))}
              {group.events.map((event) => (
                <SelectItem key={event.eventId} value={`${EVENT_PREFIX}${event.eventId}`}>
                  {event.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
