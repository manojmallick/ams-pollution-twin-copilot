import { z } from 'zod';

// --- Grid ---
export const GridSchema = z.object({
  system: z.literal('H3'),
  resolution: z.number().int().min(0).max(15),
  cellId: z.string(),
});

// --- Pollutant ---
export const PollutantSchema = z.object({
  predicted: z.number(),
  unit: z.string(),
  psi: z.number().int().min(0).max(200),
  pi95: z.tuple([z.number(), z.number()]),
  uncertaintyNorm: z.number().min(0).max(1),
});

// --- Derived ---
export const TierEnum = z.enum(['GREEN', 'AMBER', 'RED', 'PURPLE', 'INFO_ONLY', 'DATA_GAP']);
export const DerivedSchema = z.object({
  crs: z.number().min(0).max(100),
  tier: TierEnum,
  persistence: z.number().min(0).max(1),
  exposureNorm: z.number().min(0).max(1),
  actionAllowed: z.boolean(),
  reasonCodes: z.array(z.string()),
});

// --- Trust ---
export const DriftStateEnum = z.enum(['NORMAL', 'CAUTION', 'DEGRADED']);
export const ConfidenceBreakdownSchema = z.object({
  completeness: z.number().min(0).max(1),
  timeliness: z.number().min(0).max(1),
  calibration: z.number().min(0).max(1),
  crossAgreement: z.number().min(0).max(1),
  anomalyRate: z.number().min(0).max(1),
  modelUncertainty: z.number().min(0).max(1),
  backtestScore: z.number().min(0).max(1),
  driftPenalty: z.number().min(0).max(1),
});
export const TrustSchema = z.object({
  sensorConfidence: z.number().min(0).max(1),
  overallConfidence: z.number().min(0).max(1),
  confidenceBreakdown: ConfidenceBreakdownSchema,
  driftState: DriftStateEnum,
});

// --- Evidence ---
export const EvidenceSourceSchema = z.object({
  sourceId: z.string(),
  type: z.string(),
  lastSeenUtc: z.string().datetime(),
  freshnessMinutes: z.number().int().min(0),
  license: z.string(),
});
export const EvidenceSchema = z.object({
  sources: z.array(EvidenceSourceSchema),
  versions: z.object({
    normalizer: z.string(),
    twinModel: z.string(),
    rulesEngine: z.string(),
  }),
});

// --- Action ---
export const ActionSchema = z.object({
  actionId: z.string(),
  category: z.string(),
  eligible: z.boolean(),
  priority: z.number().min(0).max(100),
  reasonCodes: z.array(z.string()),
});

// --- Signature ---
export const SignatureSchema = z.object({
  alg: z.literal('Ed25519'),
  payloadSha256: z.string(),
  signatureB64: z.string(),
  publicKeyFingerprint: z.string(),
});

// --- ValidatedTwinOutput ---
export const ValidatedTwinOutputSchema = z.object({
  requestId: z.string(),
  region: z.string(),
  timeUtc: z.string().datetime(),
  grid: GridSchema,
  pollutants: z.record(z.string(), PollutantSchema),
  derived: DerivedSchema,
  trust: TrustSchema,
  evidence: EvidenceSchema,
  actions: z.array(ActionSchema),
  signature: SignatureSchema,
});

// --- Scenario ---
export const ScenarioRequestSchema = z.object({
  region: z.string(),
  timeUtc: z.string().datetime(),
  cellId: z.string(),
  levers: z.object({
    trafficMultiplier: z.number().min(0.5).max(1.2),
    zone: z.enum(['A10-ring']),
  }),
});

// --- Ingest ---
export const IngestPullResponseSchema = z.object({
  ok: z.boolean(),
  startedAtUtc: z.string().datetime(),
});

export const IngestSourceStatusSchema = z.object({
  sourceId: z.string(),
  lastSeenUtc: z.string().datetime(),
  freshnessMinutes: z.number().int(),
});

export const IngestStatusResponseSchema = z.object({
  sources: z.array(IngestSourceStatusSchema),
});

// --- Drift ---
export const DriftResponseSchema = z.object({
  region: z.string(),
  trustState: DriftStateEnum,
  rollingError: z.object({
    window: z.string(),
    pm25_mae: z.number(),
    no2_mae: z.number(),
  }),
  psi: z.array(
    z.object({
      feature: z.string(),
      value: z.number(),
      status: z.enum(['STABLE', 'MODERATE', 'HIGH']),
    })
  ),
});

// --- Explain ---
export const ExplainRequestSchema = z.object({
  requestId: z.string(),
  cellId: z.string(),
  style: z.enum(['CITIZEN', 'CITY_OPS']).default('CITIZEN'),
});

export const ExplainResponseSchema = z.object({
  ok: z.boolean(),
  narrative: z.string(),
  groundedFacts: z.array(
    z.object({
      fieldPath: z.string(),
      value: z.unknown(),
    })
  ),
  greenAiMeter: z.object({
    provider: z.string(),
    tokensIn: z.number().int(),
    tokensOut: z.number().int(),
    energyWh: z.number(),
    co2eGrams: z.number(),
  }),
});

// --- Audit ---
export const AuditExportRequestSchema = z.object({
  requestId: z.string(),
});

// --- TypeScript types ---
export type Grid = z.infer<typeof GridSchema>;
export type Pollutant = z.infer<typeof PollutantSchema>;
export type Tier = z.infer<typeof TierEnum>;
export type Derived = z.infer<typeof DerivedSchema>;
export type DriftState = z.infer<typeof DriftStateEnum>;
export type ConfidenceBreakdown = z.infer<typeof ConfidenceBreakdownSchema>;
export type Trust = z.infer<typeof TrustSchema>;
export type EvidenceSource = z.infer<typeof EvidenceSourceSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type Signature = z.infer<typeof SignatureSchema>;
export type ValidatedTwinOutput = z.infer<typeof ValidatedTwinOutputSchema>;
export type ScenarioRequest = z.infer<typeof ScenarioRequestSchema>;
export type IngestPullResponse = z.infer<typeof IngestPullResponseSchema>;
export type IngestStatusResponse = z.infer<typeof IngestStatusResponseSchema>;
export type DriftResponse = z.infer<typeof DriftResponseSchema>;
export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;
export type ExplainResponse = z.infer<typeof ExplainResponseSchema>;
export type AuditExportRequest = z.infer<typeof AuditExportRequestSchema>;
