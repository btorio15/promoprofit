/**
 * quick-261104-prg: splits feed rows into regular promo rows and intro offers
 * (one-time sign-up offers shown under their own "Intro offers" header).
 * Pure.
 */
export function splitIntroOffers<T extends { introOffer?: boolean }>(rows: readonly T[]): { promos: T[]; intro: T[] } {
  const promos: T[] = [];
  const intro: T[] = [];
  for (const r of rows) (r.introOffer === true ? intro : promos).push(r);
  return { promos, intro };
}
