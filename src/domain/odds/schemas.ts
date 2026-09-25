import { z } from "zod";

/**
 * Zod schemas for The Odds API v4 responses (oddsFormat=american).
 * Unknown extra fields on each object are preserved (z.looseObject), since
 * the upstream API adds fields (e.g. "point" on spreads/totals outcomes)
 * that this phase does not consume but must not fail parsing on.
 */

export const AmericanPriceSchema = z
  .number()
  .int()
  .refine((v) => v >= 100 || v <= -100, {
    message: "American odds must be an integer >= 100 or <= -100",
  });

export const OddsOutcomeSchema = z.looseObject({
  name: z.string(),
  price: AmericanPriceSchema,
});

export const OddsMarketSchema = z.looseObject({
  key: z.string(),
  last_update: z.string().optional(),
  outcomes: z.array(OddsOutcomeSchema),
});

export const OddsBookmakerSchema = z.looseObject({
  key: z.string(),
  title: z.string(),
  last_update: z.string().optional(),
  markets: z.array(OddsMarketSchema),
});

export const OddsEventSchema = z.looseObject({
  id: z.string(),
  sport_key: z.string(),
  sport_title: z.string().optional(),
  commence_time: z.iso.datetime({ offset: true }),
  home_team: z.string(),
  away_team: z.string(),
  bookmakers: z.array(OddsBookmakerSchema),
});

export const OddsEventListSchema = z.array(OddsEventSchema);

export const SportSchema = z.looseObject({
  key: z.string(),
  group: z.string(),
  title: z.string(),
  active: z.boolean(),
  has_outrights: z.boolean().optional(),
});

export const SportListSchema = z.array(SportSchema);

export type OddsOutcome = z.infer<typeof OddsOutcomeSchema>;
export type OddsMarket = z.infer<typeof OddsMarketSchema>;
export type OddsBookmaker = z.infer<typeof OddsBookmakerSchema>;
export type OddsEvent = z.infer<typeof OddsEventSchema>;
export type Sport = z.infer<typeof SportSchema>;
