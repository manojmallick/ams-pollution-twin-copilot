# What We Compute vs. What We Generate

This document draws a hard line between the **deterministic core** and the **AI component**.

---

## One-Sentence Summary

> Everything that matters is **computed deterministically first**. The AI is allowed to **narrate** — nothing more.

---

## The Table

| Capability | Computed (deterministic) | AI-Generated |
|-----------|--------------------------|--------------|
| PM2.5 / NO₂ predicted values | ✅ Rules + sensor data | ❌ Never |
| PSI per pollutant | ✅ WHO/EU threshold lookup | ❌ Never |
| CRS (Combined Risk Score) | ✅ Weighted formula | ❌ Never |
| Hotspot tier (GREEN/AMBER/RED/PURPLE) | ✅ CRS + confidence thresholds | ❌ Never |
| Uncertainty bands (PI95) | ✅ Statistical propagation | ❌ Never |
| Sensor confidence score | ✅ Weighted completeness/timeliness | ❌ Never |
| Overall confidence | ✅ Sensor × model × backtest × drift | ❌ Never |
| Drift state (NORMAL/CAUTION/DEGRADED) | ✅ PSI drift + MAE monitor | ❌ Never |
| Action eligibility | ✅ Rules engine (tier + confidence gate) | ❌ Never |
| Action priority scores | ✅ Catalog-based lookup | ❌ Never |
| Evidence graph (sources + versions) | ✅ Ingest service metadata | ❌ Never |
| Ed25519 signature | ✅ Cryptographic signing | ❌ Never |
| Audit PDF content | ✅ Rendered from signed payload | ❌ Never |
| Plain-language explanation | ❌ Not computed | ✅ LLM reads signed payload only |
| Explanation grounding | ✅ Validator checks all LLM numbers | — |
| Green AI meter (tokens/energy/CO₂) | ✅ From GreenPT API usage data | ❌ Never |

---

## What the AI Cannot Do

- **Cannot modify** any score, tier, or action recommendation
- **Cannot access** raw sensor data or external APIs
- **Cannot invent** a number not present in the signed payload
- **Cannot recommend** an action not in `payload.actions[]` with `eligible=true`
- **Cannot run** when the payload signature is invalid

---

## Data Flow

```
Live Sensors → Ingest → Normalise
                            ↓
                        Twin Engine (deterministic CRS/tier/actions)
                            ↓
                        Trust Service (confidence + drift + signing)
                            ↓
                    Signed ValidatedTwinOutput (immutable)
                       ↙              ↘
               Audit PDF           Explain Service
           (deterministic)     (AI reads payload only)
                                       ↓
                               Grounding Validator
                                       ↓
                               Narrative (or fallback template)
```

---

## Why This Matters

**For judges**: The numbers you see on the map cannot be hallucinated. They are computed from a signed payload that was sealed before the AI ever saw it. If the AI says "PM2.5 is 18.3 µg/m³" and the payload says 18.3, the grounding validator confirmed that. If the AI said 19.7 (not in payload), it would have been caught and the fallback template used instead.

**For city operators**: You can download the audit PDF and verify the cryptographic signature without trusting us. The hash is deterministic, the signature is Ed25519, the public key fingerprint is embedded.
