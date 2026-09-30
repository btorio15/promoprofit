import { z } from "zod";
import { SPORT_KEYS } from "@/config/sports";

/**
 * A promo's scope (PROMO-03/PROMO-04, D-10; 03-RECON.md "Design
 * Implications for Downstream Plans" 1-2). Real promos observed in recon
 * are game-wide ("any wager on Rams vs Broncos") or sport+date-wide ("any
 * NFL single on 9/27", "any CFB game on 9/26") -- never tied to one
 * pre-specified market/side. This module is pure and zero-I/O: it only
 * types/validates a scope and tests event membership; it never reads the
 * DB or the clock.
 */

export const PROMO_SCOPE_KINDS = ["event", "sport_window", "any"] as const;
export type PromoScopeKind = (typeof PROMO_SCOPE_KINDS)[number];

/** Resolved scope with Date objects, ready for eventInScope/enumeration. */
export type PromoScope =
  | { kind: "event"; eventId: string; sportKey: string }
  | { kind: "sport_window"; sportKey: string; windowStart: Date; windowEnd: Date }
  // Unrestricted bonus bet (D-07): usable on any upcoming game.
  | { kind: "any" };

/**
 * jsonb-safe scope shape (ISO strings) as stored in promos.best_guess and
 * validated by ScopeGuessSchema (D-10 anti-pattern guard: this is a
 * presentational candidate only, never auto-activated).
 */
export type ScopeGuess =
  | { kind: "event"; eventId: string; sportKey: string; homeTeam: string; awayTeam: string; commenceTime: string }
  | { kind: "sport_window"; sportKey: string; windowStart: string; windowEnd: string };

const EventScopeGuessSchema = z
  .strictObject({
    kind: z.literal("event"),
    eventId: z.string().min(1).max(100),
    sportKey: z.enum(SPORT_KEYS as [string, ...string[]]),
    homeTeam: z.string().min(1),
    awayTeam: z.string().min(1),
    commenceTime: z.iso.datetime({ offset: true }),
  })
  .refine((v) => v.homeTeam !== v.awayTeam, {
    message: "homeTeam and awayTeam must differ",
  });

const SportWindowScopeGuessSchema = z
  .strictObject({
    kind: z.literal("sport_window"),
    sportKey: z.enum(SPORT_KEYS as [string, ...string[]]),
    windowStart: z.iso.datetime({ offset: true }),
    windowEnd: z.iso.datetime({ offset: true }),
  })
  .superRefine((v, ctx) => {
    if (!(new Date(v.windowStart).getTime() < new Date(v.windowEnd).getTime())) {
      ctx.addIssue({
        code: "custom",
        message: "windowStart must be before windowEnd",
        path: ["windowStart"],
      });
    }
  });

/**
 * Discriminated union over ScopeGuess (D-10): strict objects (no extra
 * keys), sportKey must be a configured sport, ISO datetimes, and
 * windowStart < windowEnd for sport_window scopes.
 */
export const ScopeGuessSchema: z.ZodType<ScopeGuess> = z.discriminatedUnion("kind", [
  EventScopeGuessSchema,
  SportWindowScopeGuessSchema,
]) as unknown as z.ZodType<ScopeGuess>;

/** Converts a validated jsonb-safe ScopeGuess into a PromoScope with real Dates. */
export function scopeFromGuess(g: ScopeGuess): PromoScope {
  if (g.kind === "event") {
    return { kind: "event", eventId: g.eventId, sportKey: g.sportKey };
  }
  return {
    kind: "sport_window",
    sportKey: g.sportKey,
    windowStart: new Date(g.windowStart),
    windowEnd: new Date(g.windowEnd),
  };
}

/**
 * True when the given cached event falls inside the scope: "event" scope
 * means the exact event id; "sport_window" means the same sport and a
 * commence_time within [windowStart, windowEnd] inclusive of both
 * boundaries.
 */
export function eventInScope(
  ev: { id: string; sport_key: string; commence_time: string },
  scope: PromoScope,
): boolean {
  if (scope.kind === "any") return true;
  if (scope.kind === "event") {
    return ev.id === scope.eventId;
  }

  if (ev.sport_key !== scope.sportKey) return false;
  const commence = new Date(ev.commence_time).getTime();
  return commence >= scope.windowStart.getTime() && commence <= scope.windowEnd.getTime();
}
