import { clamp } from '@ams-twin/shared';
import type { ConfidenceBreakdown } from '@ams-twin/contracts';

export interface SensorInputs {
  completeness: number;      // 0-1: fraction of expected sensors reporting
  timeliness: number;        // 0-1: fraction within freshness window
  calibration: number;       // 0-1: reference-checked calibration score
  crossAgreement: number;    // 0-1: inter-sensor agreement
  anomalyRate: number;       // 0-1: fraction flagged as anomalous (lower is better)
  modelUncertainty: number;  // 0-1: from twin prediction interval width
  backtestScore: number;     // 0-1: rolling backtest MAE normalised
  driftPenalty: number;      // 0-1: PSI drift penalty
}

// Sensor confidence: weighted combination with anomaly penalty
export function computeSensorConfidence(inputs: SensorInputs): number {
  const { completeness, timeliness, calibration, crossAgreement, anomalyRate } = inputs;

  const baseScore =
    completeness * 0.25 +
    timeliness * 0.20 +
    calibration * 0.25 +
    crossAgreement * 0.20 +
    (1 - anomalyRate) * 0.10;

  return clamp(baseScore, 0, 1);
}

// Overall confidence: sensor confidence × model uncertainty × backtest × drift
export function computeOverallConfidence(
  sensorConfidence: number,
  inputs: Pick<SensorInputs, 'modelUncertainty' | 'backtestScore' | 'driftPenalty'>
): number {
  const modelFactor = 1 - inputs.modelUncertainty * 0.4;
  const backtestFactor = inputs.backtestScore;
  const driftFactor = 1 - inputs.driftPenalty * 0.5;

  return clamp(sensorConfidence * modelFactor * backtestFactor * driftFactor, 0, 1);
}

export function makeConfidenceBreakdown(inputs: SensorInputs): ConfidenceBreakdown {
  return {
    completeness: clamp(inputs.completeness, 0, 1),
    timeliness: clamp(inputs.timeliness, 0, 1),
    calibration: clamp(inputs.calibration, 0, 1),
    crossAgreement: clamp(inputs.crossAgreement, 0, 1),
    anomalyRate: clamp(inputs.anomalyRate, 0, 1),
    modelUncertainty: clamp(inputs.modelUncertainty, 0, 1),
    backtestScore: clamp(inputs.backtestScore, 0, 1),
    driftPenalty: clamp(inputs.driftPenalty, 0, 1),
  };
}
