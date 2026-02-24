export const TIER_COLORS: Record<string, string> = {
  GREEN: '#00882b',
  AMBER: '#e8a000',
  RED: '#cc1a1a',
  PURPLE: '#7b2d8b',
  INFO_ONLY: '#888888',
  DATA_GAP: '#bbbbbb',
};

export const TIER_LABELS: Record<string, string> = {
  GREEN: 'Good',
  AMBER: 'Moderate',
  RED: 'High Risk',
  PURPLE: 'Very High Risk',
  INFO_ONLY: 'Informational',
  DATA_GAP: 'No Data',
};

export const DRIFT_COLORS: Record<string, string> = {
  NORMAL: '#00882b',
  CAUTION: '#e8a000',
  DEGRADED: '#cc1a1a',
};

export function crsToColor(crs: number): string {
  if (crs >= 80) return TIER_COLORS.PURPLE;
  if (crs >= 60) return TIER_COLORS.RED;
  if (crs >= 35) return TIER_COLORS.AMBER;
  return TIER_COLORS.GREEN;
}
