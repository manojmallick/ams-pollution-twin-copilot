import { classifyDriftState, DRIFT_THRESHOLDS } from '@ams-twin/rules';
import type { DriftResponse, DriftState } from '@ams-twin/contracts';

// Rolling forecast errors stored in-memory (prod: use time-series DB)
interface ErrorSample {
  timestampUtc: string;
  pm25_error: number;
  no2_error: number;
}

const errorHistory: ErrorSample[] = [];
const MAX_HISTORY = 96; // 24h at 15-min steps

export function recordForecastError(pm25Error: number, no2Error: number) {
  errorHistory.push({
    timestampUtc: new Date().toISOString(),
    pm25_error: Math.abs(pm25Error),
    no2_error: Math.abs(no2Error),
  });
  if (errorHistory.length > MAX_HISTORY) errorHistory.shift();
}

function rollingMae(window = 96): { pm25_mae: number; no2_mae: number } {
  const recent = errorHistory.slice(-window);
  if (recent.length === 0) return { pm25_mae: 0, no2_mae: 0 };
  const pm25_mae = recent.reduce((s, r) => s + r.pm25_error, 0) / recent.length;
  const no2_mae = recent.reduce((s, r) => s + r.no2_error, 0) / recent.length;
  return { pm25_mae: +pm25_mae.toFixed(2), no2_mae: +no2_mae.toFixed(2) };
}

// PSI drift: compare current feature distribution to reference baseline
interface PsiFeature {
  feature: string;
  current: number;
  reference: number;
}

// Reference baselines (µg/m³) — typical Amsterdam annual averages
const REFERENCE_BASELINES: Record<string, number> = {
  pm25: 14.2,
  no2: 38.5,
  o3: 55.0,
};

export function computePsiDrift(current: Record<string, number>): DriftResponse['psi'] {
  return Object.entries(REFERENCE_BASELINES).map(([feature, ref]) => {
    const cur = current[feature] ?? ref;
    // PSI approximation: |current - reference| / reference
    const value = +Math.abs(cur - ref) / ref;
    const status: 'STABLE' | 'MODERATE' | 'HIGH' =
      value > DRIFT_THRESHOLDS.MODERATE ? 'HIGH' :
      value > DRIFT_THRESHOLDS.STABLE ? 'MODERATE' : 'STABLE';
    return { feature, value: +value.toFixed(3), status };
  });
}

export function getDriftResponse(
  region: string,
  currentPollutants?: Record<string, number>
): DriftResponse {
  const mae = rollingMae();
  const psi = computePsiDrift(currentPollutants ?? {});
  const maxPsiDrift = Math.max(...psi.map((p) => p.value));
  const trustState: DriftState = classifyDriftState(maxPsiDrift, Math.max(mae.pm25_mae, mae.no2_mae));

  return {
    region,
    trustState,
    rollingError: {
      window: '24h',
      pm25_mae: mae.pm25_mae,
      no2_mae: mae.no2_mae,
    },
    psi,
  };
}
