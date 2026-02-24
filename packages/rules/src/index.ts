import type { Tier, DriftState } from '@ams-twin/contracts';

// WHO / EU Air Quality Bands for PSI computation
export const WHO_BANDS = {
  pm25: [
    { maxUgM3: 10, psi: 0 },
    { maxUgM3: 15, psi: 25 },
    { maxUgM3: 25, psi: 50 },
    { maxUgM3: 35, psi: 75 },
    { maxUgM3: 55, psi: 100 },
    { maxUgM3: 75, psi: 125 },
    { maxUgM3: 150, psi: 150 },
    { maxUgM3: Infinity, psi: 200 },
  ],
  no2: [
    { maxUgM3: 40, psi: 0 },
    { maxUgM3: 90, psi: 25 },
    { maxUgM3: 120, psi: 50 },
    { maxUgM3: 180, psi: 75 },
    { maxUgM3: 240, psi: 100 },
    { maxUgM3: 340, psi: 125 },
    { maxUgM3: 600, psi: 150 },
    { maxUgM3: Infinity, psi: 200 },
  ],
  o3: [
    { maxUgM3: 60, psi: 0 },
    { maxUgM3: 100, psi: 25 },
    { maxUgM3: 140, psi: 50 },
    { maxUgM3: 180, psi: 75 },
    { maxUgM3: 240, psi: 100 },
    { maxUgM3: 360, psi: 125 },
    { maxUgM3: Infinity, psi: 150 },
  ],
};

export function computePsi(pollutant: keyof typeof WHO_BANDS, valueUgM3: number): number {
  const bands = WHO_BANDS[pollutant];
  for (const band of bands) {
    if (valueUgM3 <= band.maxUgM3) return band.psi;
  }
  return 200;
}

// Tier classification rules
export function classifyTier(
  crs: number,
  confidence: number,
  driftState: DriftState,
  dataMissing: boolean
): Tier {
  if (dataMissing) return 'DATA_GAP';
  if (confidence < 0.3) return 'INFO_ONLY';
  if (driftState === 'DEGRADED') return 'INFO_ONLY';
  if (crs >= 80) return 'PURPLE';
  if (crs >= 60) return 'RED';
  if (crs >= 35) return 'AMBER';
  return 'GREEN';
}

// Action gate: actions only if tier is RED/PURPLE and confidence >= threshold
export const ACTION_CONFIDENCE_THRESHOLD = 0.65;
export function isActionAllowed(tier: Tier, confidence: number): boolean {
  return (tier === 'RED' || tier === 'PURPLE') && confidence >= ACTION_CONFIDENCE_THRESHOLD;
}

// Action catalog
export const ACTION_CATALOG = [
  {
    actionId: 'REDUCE_TRAFFIC_A10',
    category: 'TRAFFIC',
    description: 'Activate traffic flow reduction on A10 ring',
    applicableTiers: ['RED', 'PURPLE'] as Tier[],
    minPriority: 80,
  },
  {
    actionId: 'CYCLIST_REROUTE',
    category: 'MOBILITY',
    description: 'Recommend cyclists avoid Wibautstraat corridor',
    applicableTiers: ['AMBER', 'RED', 'PURPLE'] as Tier[],
    minPriority: 50,
  },
  {
    actionId: 'SCHOOL_ALERT',
    category: 'PUBLIC_HEALTH',
    description: 'Issue school indoor recess advisory',
    applicableTiers: ['RED', 'PURPLE'] as Tier[],
    minPriority: 90,
  },
  {
    actionId: 'CONSTRUCTION_HALT',
    category: 'CONSTRUCTION',
    description: 'Temporarily halt dust-generating construction sites',
    applicableTiers: ['PURPLE'] as Tier[],
    minPriority: 95,
  },
];

// Drift PSI thresholds
export const DRIFT_THRESHOLDS = {
  STABLE: 0.1,
  MODERATE: 0.2,
  HIGH: Infinity,
};

export function classifyDriftState(maxPsiDrift: number, forecastError: number): DriftState {
  if (maxPsiDrift > DRIFT_THRESHOLDS.MODERATE || forecastError > 15) return 'DEGRADED';
  if (maxPsiDrift > DRIFT_THRESHOLDS.STABLE || forecastError > 8) return 'CAUTION';
  return 'NORMAL';
}
