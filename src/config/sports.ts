/**
 * Sports scanned by the bonus-bet finder (D-01). Configurable list, not
 * hardcoded logic elsewhere. quick-260928-it1: NHL is included --
 * icehockey_nhl's h2h market always includes OT/shootout (no draws are ever
 * offered), so it is a 2-way moneyline exactly like every other configured
 * sport here; tieRisk is false for the same reason MLB/NBA/NCAAB are false.
 */
export interface SportConfig {
  key: string;
  label: string;
  tieRisk: boolean;
}

export const SPORTS: readonly SportConfig[] = [
  { key: "americanfootball_nfl", label: "NFL", tieRisk: true },
  { key: "basketball_nba", label: "NBA", tieRisk: false },
  { key: "baseball_mlb", label: "MLB", tieRisk: false },
  { key: "americanfootball_ncaaf", label: "NCAAF", tieRisk: false },
  { key: "basketball_ncaab", label: "NCAAB", tieRisk: false },
  { key: "icehockey_nhl", label: "NHL", tieRisk: false },
] as const;

export const SPORT_KEYS: readonly string[] = SPORTS.map((s) => s.key);

export function getSportLabel(sportKey: string): string {
  return SPORTS.find((s) => s.key === sportKey)?.label ?? sportKey;
}

export function isTieRiskSport(sportKey: string): boolean {
  return SPORTS.find((s) => s.key === sportKey)?.tieRisk ?? false;
}
