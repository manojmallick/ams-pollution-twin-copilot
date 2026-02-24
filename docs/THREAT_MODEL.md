# Threat Model

## Scope

This document covers threats specific to an AI-assisted urban pollution monitoring system where decisions (action recommendations) have real-world consequences.

---

## Threats & Mitigations

### T1: AI Hallucination — Novel Numbers
**Risk**: LLM invents pollutant values not present in the signed payload.
**Mitigation**: Grounding validator extracts all numeric facts from payload; rejects narrative containing any number not within ±5% of a payload value. Falls back to deterministic template on rejection.

### T2: AI Hallucination — Invented Actions
**Risk**: LLM recommends actions not in `payload.actions[]` or not `eligible=true`.
**Mitigation**: Actions are extracted from `payload.actions` before LLM call. Validator cross-checks any action verb in narrative against eligible action IDs.

### T3: Sensor Spoofing / Tampered Data
**Risk**: Attacker feeds falsely high or low readings to trigger or suppress alerts.
**Mitigation**: Cross-agreement factor in confidence score; anomaly detection flags outliers; multiple independent stations; low cross-agreement reduces confidence and can disable actions.

### T4: Stale Data Presented as Fresh
**Risk**: Old readings passed off as current, masking real deterioration.
**Mitigation**: Every source has `freshnessMinutes` in the signed payload. Timeliness factor in confidence score degrades as data ages. UI shows freshness prominently.

### T5: Payload Tampering After Signing
**Risk**: Signed payload modified before being used for explanation or audit.
**Mitigation**: Ed25519 signature over canonical JSON. Explain service fetches payload directly from trust store by `requestId`, never from the caller. Audit PDF embeds hash + signature + verification steps.

### T6: Model Drift → Overconfident Predictions
**Risk**: Distribution shift causes systematic forecast error without triggering alerts.
**Mitigation**: PSI drift monitor + rolling MAE tracking. Automatic trust degradation (CAUTION/DEGRADED states). Actions disabled in DEGRADED state.

### T7: Action Injection via API Abuse
**Risk**: Caller submits a crafted payload to unlock high-priority actions.
**Mitigation**: Trust service validates all inputs with Zod schema. Confidence and gating computed server-side from evidence sources, never accepted from caller. Signature prevents replay of modified payloads.

### T8: Data Source Dependency Failure
**Risk**: Luchtmeetnet or Open-Meteo API goes down.
**Mitigation**: Synthetic fallback connector with realistic Amsterdam ranges. DATA_GAP tier shown when ≥50% sensors missing. Actions disabled in DATA_GAP state.

### T9: Private Key Compromise
**Risk**: Ed25519 private key leaked; attacker generates valid signatures for fake payloads.
**Mitigation**: Key never logged; loaded from env var only. Rotate key → invalidates all prior signatures (acceptable: historical audits remain verifiable by old key). Dev uses ephemeral keys with warning.

### T10: Energy/CO₂ Estimates Misrepresented
**Risk**: Green AI meter understates actual energy consumption.
**Mitigation**: Estimates are clearly labelled as estimates with provider name. Actual token counts from the GreenPT API are accurate; energy factor is a community-standard estimate per provider.
