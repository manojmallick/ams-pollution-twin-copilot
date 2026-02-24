# Trust Model

## Overview

Every output from the Amsterdam Pollution Twin is accompanied by a **trust score** that quantifies the reliability of the prediction. Trust scores propagate uncertainty through the entire pipeline — from sensor freshness to model drift — and gate which actions can be recommended.

---

## Sensor Confidence

Computed from five factors with weighted combination:

| Factor | Weight | Description |
|--------|--------|-------------|
| `completeness` | 25% | Fraction of expected sensors currently reporting |
| `timeliness` | 20% | Fraction of readings within the freshness window (≤30 min) |
| `calibration` | 25% | Reference station calibration score |
| `crossAgreement` | 20% | Inter-sensor correlation within 2 km |
| `anomalyRate` | 10% | Inverted: fraction flagged as anomalous |

```
sensorConfidence = 0.25×completeness + 0.20×timeliness + 0.25×calibration
                 + 0.20×crossAgreement + 0.10×(1 - anomalyRate)
```

---

## Overall Confidence

Applies model-level penalties on top of sensor confidence:

```
overallConfidence = sensorConfidence
                  × (1 - modelUncertainty × 0.4)
                  × backtestScore
                  × (1 - driftPenalty × 0.5)
```

| Component | Source |
|-----------|--------|
| `modelUncertainty` | Prediction interval width (PI95 normalised) |
| `backtestScore` | Rolling 24h MAE normalised against WHO thresholds |
| `driftPenalty` | PSI drift magnitude (DEGRADED→0.4, CAUTION→0.2, NORMAL→0) |

---

## Tier Classification

| CRS Range | Tier | Description |
|-----------|------|-------------|
| 0–34 | GREEN | Acceptable air quality |
| 35–59 | AMBER | Elevated — monitor |
| 60–79 | RED | High risk — actions eligible |
| 80–100 | PURPLE | Very high risk — all actions eligible |
| — | INFO_ONLY | Confidence < 0.30 or DEGRADED drift |
| — | DATA_GAP | ≥50% sensors missing |

---

## Action Gate

Actions are **only recommended** when:
1. Tier is RED or PURPLE
2. `overallConfidence ≥ 0.65`

Below this threshold, the system shows tier and CRS but marks `actionAllowed: false` and includes reason codes.

---

## Drift Detection

The drift monitor runs continuously and tracks:
- **PSI drift**: relative change from annual baseline per pollutant
- **Forecast error**: 24h rolling MAE for PM2.5 and NO₂

| Condition | Trust State |
|-----------|-------------|
| maxPsiDrift ≤ 0.10 AND MAE ≤ 8 | NORMAL |
| maxPsiDrift ≤ 0.20 AND MAE ≤ 15 | CAUTION |
| maxPsiDrift > 0.20 OR MAE > 15 | DEGRADED |

DEGRADED forces tier to INFO_ONLY and disables actions.

---

## Cryptographic Signing

Every validated payload is signed with **Ed25519**:
1. Canonical JSON serialised (deterministic)
2. SHA-256 hash computed
3. Ed25519 signature applied
4. Public key fingerprint included in payload

Verification: hash the canonical JSON, check it matches `signature.payloadSha256`, then verify the Ed25519 signature using the public key registered against `publicKeyFingerprint`.
