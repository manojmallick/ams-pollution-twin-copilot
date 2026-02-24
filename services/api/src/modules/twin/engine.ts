import { computePsi, classifyTier, isActionAllowed, ACTION_CATALOG } from '@ams-twin/rules';
import { clamp } from '@ams-twin/shared';
import type { ValidatedTwinOutput, Tier, DriftState } from '@ams-twin/contracts';

export interface ObservationInput {
  cellId: string;
  region: string;
  timeUtc: string;
  pollutants: {
    pm25?: number;
    no2?: number;
    o3?: number;
  };
  weather?: {
    windSpeedMs?: number;
    humidityPct?: number;
    tempC?: number;
  };
  trafficMultiplier?: number;
  // Trust inputs
  sensorConfidence?: number;
  driftState?: DriftState;
  dataMissing?: boolean;
  evidenceSources?: ValidatedTwinOutput['evidence']['sources'];
}

export interface TwinOutput {
  requestId: string;
  region: string;
  timeUtc: string;
  cellId: string;
  pollutants: Record<string, { predicted: number; unit: string; psi: number; pi95: [number, number]; uncertaintyNorm: number }>;
  derived: {
    crs: number;
    tier: Tier;
    persistence: number;
    exposureNorm: number;
    actionAllowed: boolean;
    reasonCodes: string[];
  };
  actions: ValidatedTwinOutput['actions'];
  evidenceSources: ValidatedTwinOutput['evidence']['sources'];
  sensorConfidence: number;
  driftState: DriftState;
}

export function runTwinEngine(input: ObservationInput): TwinOutput {
  const trafficMul = input.trafficMultiplier ?? 1.0;
  const driftState: DriftState = input.driftState ?? 'NORMAL';
  const sensorConfidence = input.sensorConfidence ?? 0.85;
  const dataMissing = input.dataMissing ?? false;

  // --- Apply traffic multiplier to NO2 (proxy for traffic emissions) ---
  const rawPm25 = (input.pollutants.pm25 ?? 0) * clamp(trafficMul, 0.5, 1.2);
  const rawNo2 = (input.pollutants.no2 ?? 0) * clamp(trafficMul, 0.5, 1.2);
  const rawO3 = input.pollutants.o3 ?? 0;

  // --- PSI per pollutant ---
  const psiPm25 = dataMissing ? 0 : computePsi('pm25', rawPm25);
  const psiNo2 = dataMissing ? 0 : computePsi('no2', rawNo2);
  const psiO3 = rawO3 > 0 ? computePsi('o3', rawO3) : 0;

  // --- Uncertainty (wind disperses pollutants, humidity raises PM) ---
  const windFactor = clamp(1 - (input.weather?.windSpeedMs ?? 4) / 20, 0, 1);
  const humidFactor = clamp((input.weather?.humidityPct ?? 70) / 100, 0, 1);
  const uncertaintyNorm = clamp(windFactor * 0.6 + humidFactor * 0.4, 0.05, 0.95);

  // PI95 = ±20% for PM, ±25% for NO2
  const pm25Pi95: [number, number] = [rawPm25 * 0.8, rawPm25 * 1.2];
  const no2Pi95: [number, number] = [rawNo2 * 0.75, rawNo2 * 1.25];
  const o3Pi95: [number, number] = [rawO3 * 0.8, rawO3 * 1.2];

  // --- CRS = weighted average of PSIs, adjusted for uncertainty + persistence ---
  const maxPsi = Math.max(psiPm25, psiNo2, psiO3);
  const avgPsi = (psiPm25 * 0.5 + psiNo2 * 0.35 + psiO3 * 0.15);

  // Persistence: higher in morning/evening (simplified)
  const hour = new Date(input.timeUtc).getUTCHours();
  const persistence = (hour >= 6 && hour <= 10) || (hour >= 16 && hour <= 20) ? 0.75 : 0.45;

  const exposureNorm = clamp(maxPsi / 200, 0, 1);

  // CRS formula: weighted PSI × (1 + persistence_penalty) × confidence × exposure
  const crs = clamp(
    avgPsi * (1 + persistence * 0.3) * sensorConfidence * (0.5 + exposureNorm * 0.5),
    0,
    100
  );

  // --- Tier ---
  const tier = classifyTier(crs, sensorConfidence, driftState, dataMissing);

  // --- Action gate + catalog ---
  const actionAllowed = isActionAllowed(tier, sensorConfidence);
  const reasonCodes: string[] = [];

  if (dataMissing) reasonCodes.push('DATA_GAP_MISSING_SENSORS');
  if (driftState === 'DEGRADED') reasonCodes.push('DRIFT_MODEL_DEGRADED');
  if (driftState === 'CAUTION') reasonCodes.push('DRIFT_MODEL_CAUTION');
  if (sensorConfidence < 0.65) reasonCodes.push('LOW_SENSOR_CONFIDENCE');
  if (trafficMul > 1.0) reasonCodes.push('TRAFFIC_ELEVATED');
  if (crs >= 60) reasonCodes.push('HIGH_CRS_SCORE');
  if (psiPm25 >= 100) reasonCodes.push('PM25_THRESHOLD_EXCEEDED');
  if (psiNo2 >= 100) reasonCodes.push('NO2_THRESHOLD_EXCEEDED');

  const actions = ACTION_CATALOG.map((ac) => ({
    actionId: ac.actionId,
    category: ac.category,
    eligible: actionAllowed && ac.applicableTiers.includes(tier),
    priority: actionAllowed && ac.applicableTiers.includes(tier) ? ac.minPriority : 0,
    reasonCodes: ac.applicableTiers.includes(tier) ? [tier] : ['TIER_NOT_APPLICABLE'],
  }));

  const pollutants: TwinOutput['pollutants'] = {};
  if (!dataMissing) {
    pollutants['pm25'] = { predicted: rawPm25, unit: 'µg/m³', psi: psiPm25, pi95: pm25Pi95, uncertaintyNorm };
    pollutants['no2'] = { predicted: rawNo2, unit: 'µg/m³', psi: psiNo2, pi95: no2Pi95, uncertaintyNorm };
    if (rawO3 > 0) {
      pollutants['o3'] = { predicted: rawO3, unit: 'µg/m³', psi: psiO3, pi95: o3Pi95, uncertaintyNorm };
    }
  }

  const evidenceSources = input.evidenceSources ?? [
    {
      sourceId: 'luchtmeetnet',
      type: 'air_quality',
      lastSeenUtc: input.timeUtc,
      freshnessMinutes: 5,
      license: 'CC BY 4.0',
    },
    {
      sourceId: 'open-meteo',
      type: 'weather',
      lastSeenUtc: input.timeUtc,
      freshnessMinutes: 15,
      license: 'CC BY 4.0',
    },
  ];

  return {
    requestId: `twin_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    region: input.region,
    timeUtc: input.timeUtc,
    cellId: input.cellId,
    pollutants,
    derived: { crs, tier, persistence, exposureNorm, actionAllowed, reasonCodes },
    actions,
    evidenceSources,
    sensorConfidence,
    driftState,
  };
}
