"use client";

import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { throughDayOptions } from "@/domain/promos/correctionOptions";
import type { CorrectionOptions } from "@/domain/promos/dto";
import { groupEventOptions, searchEventOptions } from "@/domain/promos/gameSearch";
import {
  fromDayOptions,
  leagueOptions,
  selectFromDay,
  selectLeague,
  type ScopeDraft,
} from "@/domain/promos/scopeDraft";
import { formatKickoff } from "@/lib/format";

/**
 * quick-260929-hht: replaces the single "Game or day" dropdown. Owner: "it just
 * needs to be easier to search for a game or define a date range. one dropdown
 * doesnt work". Two clearly separate modes: search ONE game, or pick a
 * League + From + Through day range. Server payloads are unchanged (built by
 * scopeInputFromDraft). The collapsed "chosen game" view is derived from
 * draft.eventId; the search query is local only and never sent anywhere.
 */

interface ThroughDaySelectProps {
  id: string;
  startEtDate: string;
  value: string | null;
  onValueChange: (etDate: string) => void;
  disabled?: boolean;
}

/** "Through" day picker for a multi-day league window; the first item is the start day itself (same day). */
export function ThroughDaySelect({ id, startEtDate, value, onValueChange, disabled }: ThroughDaySelectProps) {
  const options = throughDayOptions(startEtDate, new Date());

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>Through</Label>
      <Select value={value ?? startEtDate} onValueChange={(v) => onValueChange(v ?? startEtDate)}>
        <SelectTrigger id={id} className="h-11 w-full" disabled={disabled}>
          <SelectValue placeholder="Same day" />
        </SelectTrigger>
        <SelectContent>
          {options.map((option, index) => (
            <SelectItem key={option.etDate} value={option.etDate}>
              {index === 0 ? `${option.label} (same day)` : option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

interface ScopePickerProps {
  idPrefix: string;
  label?: string;
  draft: ScopeDraft;
  onDraftChange: (next: ScopeDraft) => void;
  options: CorrectionOptions;
  disabled?: boolean;
}

export function ScopePicker({
  idPrefix,
  label = "Game or league",
  draft,
  onDraftChange,
  options,
  disabled,
}: ScopePickerProps) {
  const [query, setQuery] = useState("");
  const [changing, setChanging] = useState(false);
  const [seenEventId, setSeenEventId] = useState<string | null>(draft.eventId);

  // Reset the search when the chosen game changes from outside (save reset, prefill).
  if (seenEventId !== draft.eventId) {
    setSeenEventId(draft.eventId);
    setQuery("");
    setChanging(false);
  }

  const groups = useMemo(
    () => groupEventOptions(searchEventOptions(options.events, query)),
    [options.events, query],
  );
  const resultCount = groups.reduce((n, g) => n + g.days.reduce((m, d) => m + d.events.length, 0), 0);

  const chosen = draft.eventId ? options.events.find((e) => e.eventId === draft.eventId) : undefined;
  const collapsed = chosen !== undefined && !changing;

  const leagues = leagueOptions(options.sportDays);
  const fromDays = fromDayOptions(options.sportDays, draft.sportKey);
  const leagueLabel = leagues.find((l) => l.sportKey === draft.sportKey)?.sportLabel ?? "";
  const dayLabel = (etDate: string | null) =>
    fromDays.find((d) => d.etDate === etDate)?.label ??
    (draft.fromEtDate ? throughDayOptions(draft.fromEtDate, new Date()) : []).find((d) => d.etDate === etDate)?.label ??
    etDate ??
    "";
  const listId = `${idPrefix}-games`;

  function chooseGame(eventId: string) {
    setQuery("");
    setChanging(false);
    onDraftChange({ ...draft, mode: "game", eventId });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label>{label}</Label>
        <ToggleGroup
          className="w-full"
          value={[draft.mode]}
          onValueChange={(values) => {
            const next = values[0];
            if (next === "game" || next === "league") onDraftChange({ ...draft, mode: next });
          }}
          disabled={disabled}
        >
          <ToggleGroupItem value="game" className="h-11 flex-1">
            One game
          </ToggleGroupItem>
          <ToggleGroupItem value="league" className="h-11 flex-1">
            All games in a league
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {draft.mode === "game" ? (
        collapsed && chosen ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border p-2">
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-sm font-medium">
                {chosen.awayTeam} @ {chosen.homeTeam}
              </span>
              <span className="flex items-center gap-2 text-sm text-muted-foreground">
                <Badge variant="secondary">{chosen.sportLabel}</Badge>
                {formatKickoff(chosen.commenceTime)}
              </span>
            </div>
            <Button type="button" variant="outline" className="h-11" disabled={disabled} onClick={() => setChanging(true)}>
              Change game
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Input
              id={`${idPrefix}-search`}
              type="search"
              className="h-11"
              placeholder="Search a team, e.g. Broncos or DEN"
              autoComplete="off"
              enterKeyHint="search"
              aria-controls={listId}
              value={query}
              disabled={disabled}
              onChange={(e) => setQuery(e.target.value)}
            />
            <div
              id={listId}
              className="max-h-72 overflow-y-auto overscroll-contain rounded-lg border border-border"
            >
              {groups.map((group) => (
                <div key={group.sportKey}>
                  <div className="sticky top-0 z-10 bg-background px-3 py-1 text-sm font-medium">
                    {group.sportLabel}
                  </div>
                  {group.days.map((day) => (
                    <div key={day.etDate}>
                      <div className="px-3 py-1 text-sm text-muted-foreground">{day.dayLabel}</div>
                      {day.events.map((event) => {
                        const selected = event.eventId === draft.eventId;
                        return (
                          <button
                            key={event.eventId}
                            type="button"
                            aria-pressed={selected}
                            disabled={disabled}
                            className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-left hover:bg-muted disabled:opacity-50"
                            onClick={() => chooseGame(event.eventId)}
                          >
                            <span className="flex min-w-0 flex-col">
                              <span className="text-sm">
                                {event.awayTeam} @ {event.homeTeam}
                              </span>
                              <span className="text-sm text-muted-foreground">
                                {formatKickoff(event.commenceTime)}
                              </span>
                            </span>
                            {selected ? <Check className="size-4 shrink-0" aria-hidden /> : null}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {options.events.length === 0
                ? "No upcoming games in the cached odds."
                : resultCount === 0
                  ? "No games match that search. Try a team name or abbreviation, or switch to All games in a league."
                  : `${resultCount} ${resultCount === 1 ? "game" : "games"}`}
            </p>
          </div>
        )
      ) : (
        <div className="flex flex-col gap-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-league`}>League</Label>
              <Select
                value={draft.sportKey}
                onValueChange={(v) => {
                  if (v) onDraftChange(selectLeague(draft, v, options.sportDays));
                }}
              >
                <SelectTrigger id={`${idPrefix}-league`} className="h-11 w-full" disabled={disabled}>
                  <SelectValue placeholder="Choose a league" />
                </SelectTrigger>
                <SelectContent>
                  {leagues.map((l) => (
                    <SelectItem key={l.sportKey} value={l.sportKey}>
                      {l.sportLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor={`${idPrefix}-from`}>From</Label>
              <Select
                value={draft.fromEtDate}
                onValueChange={(v) => {
                  if (v) onDraftChange(selectFromDay(draft, v, new Date()));
                }}
              >
                <SelectTrigger
                  id={`${idPrefix}-from`}
                  className="h-11 w-full"
                  disabled={disabled || draft.sportKey === null}
                >
                  <SelectValue placeholder="Choose a day" />
                </SelectTrigger>
                <SelectContent>
                  {fromDays.map((d) => (
                    <SelectItem key={d.etDate} value={d.etDate}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {draft.fromEtDate ? (
              <ThroughDaySelect
                id={`${idPrefix}-through`}
                startEtDate={draft.fromEtDate}
                value={draft.throughEtDate}
                onValueChange={(throughEtDate) => onDraftChange({ ...draft, throughEtDate })}
                disabled={disabled}
              />
            ) : null}
          </div>
          {draft.sportKey && draft.fromEtDate ? (
            <p className="text-sm text-muted-foreground">
              Counts every {leagueLabel} game from {dayLabel(draft.fromEtDate)} through{" "}
              {dayLabel(draft.throughEtDate ?? draft.fromEtDate)} (ET).
            </p>
          ) : null}
        </div>
      )}
    </div>
  );
}
