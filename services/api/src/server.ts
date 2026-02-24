import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { Buffer } from 'buffer';
import cors from '@fastify/cors';
import { IngestPullResponseSchema, IngestStatusResponseSchema, ScenarioRequestSchema, DriftResponseSchema, ValidatedTwinOutputSchema, AuditExportRequestSchema, ExplainRequestSchema, ExplainResponseSchema } from '@ams-twin/contracts';
import { fetchAirQuality } from './modules/ingest/connectors/airQuality';
import { fetchWeather } from './modules/ingest/connectors/weather';
import { saveObservations, saveFetchLog, getLatestFetchStatus } from './modules/ingest/store';
import { runTwinEngine } from './modules/twin/engine';
import { getNetherlandsCells } from './modules/twin/h3utils';
import { generateRequestId } from '@ams-twin/shared';
import { signPayload } from './modules/trust/signer';
import { getDriftResponse } from './modules/trust/drift';
import { storeValidatedPayload, getValidatedPayload } from './modules/trust/store';
import { computeSensorConfidence, computeOverallConfidence, makeConfidenceBreakdown } from './modules/trust/confidence';
import type { ValidatedTwinOutput } from '@ams-twin/contracts';
import { generateAuditPdf } from './modules/audit/pdfGenerator';
import { generateExplanation } from './modules/explain/greenpt';

const app = Fastify({ logger: true });

// Setup CORS
app.register(cors, {
    origin: ['http://localhost:3000', /https:\/\/.*\.vercel\.app/],
    methods: ['GET', 'POST', 'OPTIONS'],
});

// GET /health
app.get('/health', async () => {
    return { status: 'ok', service: 'ams-pollution-api', time: new Date().toISOString() };
});

// POST /v1/ingest/pull
app.post('/v1/ingest/pull', async (request: FastifyRequest, reply: FastifyReply) => {
    const startedAtUtc = new Date().toISOString();

    // Respond immediately, pull in background
    try {
        const [aqResult, weatherResult] = await Promise.all([fetchAirQuality(), fetchWeather()]);
        const merged = aqResult.observations.map((obs) => ({
            ...obs,
            weather: weatherResult.observation.weather,
        }));
        saveObservations(merged);
        saveFetchLog(aqResult.result);
        saveFetchLog(weatherResult.result);
    } catch (err) {
        app.log.error(err, '[ingest] pull error');
    }

    return IngestPullResponseSchema.parse({ ok: true, startedAtUtc });
});

// GET /v1/ingest/status
app.get('/v1/ingest/status', async () => {
    const sources = getLatestFetchStatus();
    return IngestStatusResponseSchema.parse({ sources });
});

// Helper for twin logic
function makeSyntheticCellData(cellId: string, timeUtc: string, trafficMul = 1.0) {
    const hour = new Date(timeUtc).getUTCHours();
    const peakFactor = (hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19) ? 1.35 : 1.0;
    const hash = cellId.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const spatialVariation = 0.7 + (hash % 60) / 100;
    return {
        pm25: +(12 * peakFactor * trafficMul * spatialVariation).toFixed(1),
        no2: +(30 * peakFactor * trafficMul * spatialVariation).toFixed(1),
    };
}

// GET /v1/twin/cells
app.get('/v1/twin/cells', async (request: FastifyRequest, reply: FastifyReply) => {
    const { bbox, time } = request.query as Record<string, string>;
    if (!bbox || !time) {
        return reply.status(400).send({ error: 'bbox and time are required' });
    }

    const cells = getNetherlandsCells();
    const results = cells.map((cellId) => {
        const pollData = makeSyntheticCellData(cellId, time);
        return runTwinEngine({
            cellId,
            region: 'Netherlands',
            timeUtc: time,
            pollutants: pollData,
            weather: { windSpeedMs: 4, humidityPct: 72, tempC: 12 },
            sensorConfidence: 0.82,
            driftState: 'NORMAL',
        });
    });
    return { cells: results, count: results.length, timeUtc: time };
});

// POST /v1/twin/scenario
app.post('/v1/twin/scenario', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ScenarioRequestSchema.safeParse(request.body);
    if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
    }

    const { region, timeUtc, cellId, levers } = parsed.data;
    const baselineData = makeSyntheticCellData(cellId, timeUtc, 1.0);
    const baseline = runTwinEngine({
        cellId, region, timeUtc, pollutants: baselineData,
        weather: { windSpeedMs: 4, humidityPct: 72, tempC: 12 },
        sensorConfidence: 0.82, driftState: 'NORMAL',
    });

    const scenarioData = makeSyntheticCellData(cellId, timeUtc, levers.trafficMultiplier);
    const scenario = runTwinEngine({
        cellId, region, timeUtc, pollutants: scenarioData,
        weather: { windSpeedMs: 4, humidityPct: 72, tempC: 12 },
        trafficMultiplier: levers.trafficMultiplier,
        sensorConfidence: 0.82, driftState: 'NORMAL',
    });

    return { requestId: generateRequestId(), baseline, scenario };
});

// GET /v1/trust/drift
app.get('/v1/trust/drift', async (request: FastifyRequest) => {
    const region = (request.query as Record<string, string>).region ?? 'Amsterdam';
    const drift = getDriftResponse(region);
    return DriftResponseSchema.parse(drift);
});

function normaliseSources(raw: unknown): ValidatedTwinOutput['evidence']['sources'] {
    const now = new Date().toISOString();
    const arr = Array.isArray(raw) ? raw : [];
    const filled = arr.map((s: any) => ({
        sourceId: (s.sourceId as string) ?? 'synthetic',
        type: (s.type as string) ?? 'air_quality',
        lastSeenUtc: (s.lastSeenUtc as string) ?? now,
        freshnessMinutes: (s.freshnessMinutes as number) ?? 60,
        license: (s.license as string) ?? 'demo',
    }));
    return filled.length > 0
        ? filled
        : [{ sourceId: 'synthetic', type: 'air_quality', lastSeenUtc: now, freshnessMinutes: 60, license: 'demo' }];
}

// POST /v1/trust/validate
app.post('/v1/trust/validate', async (request: FastifyRequest, reply: FastifyReply) => {
    const raw = request.body as Record<string, any>;
    if (!raw || typeof raw !== 'object') {
        return reply.status(400).send({ error: 'Body must be a JSON object' });
    }

    const cellId = raw.cellId ?? raw.grid?.cellId ?? 'unknown';
    const requestId = raw.requestId ?? `trust_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const rawDerived = raw.derived ?? {};
    const crs: number = rawDerived.crs ?? 0;
    const tier = rawDerived.tier ?? 'GREEN';
    const derived: ValidatedTwinOutput['derived'] = {
        crs, tier,
        persistence: rawDerived.persistence ?? ((new Date().getUTCHours() >= 6 && new Date().getUTCHours() <= 10) ? 0.75 : 0.45),
        exposureNorm: rawDerived.exposureNorm ?? Math.min(1, crs / 100),
        actionAllowed: rawDerived.actionAllowed ?? (tier === 'RED' || tier === 'PURPLE'),
        reasonCodes: rawDerived.reasonCodes ?? [],
    };

    const twinOutput = {
        requestId,
        region: raw.region ?? 'Unknown',
        timeUtc: raw.timeUtc ?? new Date().toISOString(),
        cellId,
        pollutants: (raw.pollutants ?? {}) as ValidatedTwinOutput['pollutants'],
        derived,
        actions: (raw.actions ?? []) as ValidatedTwinOutput['actions'],
        evidenceSources: normaliseSources(raw.evidenceSources ?? raw.evidence?.sources),
        sensorConfidence: raw.sensorConfidence as number | undefined,
        driftState: raw.driftState as ValidatedTwinOutput['trust']['driftState'] | undefined,
    };

    const freshnessScore = twinOutput.evidenceSources?.length ? Math.max(0, 1 - (twinOutput.evidenceSources[0]?.freshnessMinutes ?? 0) / 60) : 0.8;
    const sensorInputs = {
        completeness: 0.92, timeliness: freshnessScore, calibration: 0.88,
        crossAgreement: twinOutput.sensorConfidence ?? 0.85, anomalyRate: 0.05,
        modelUncertainty: (Object.values(twinOutput.pollutants ?? {})[0] as any)?.uncertaintyNorm ?? 0.2,
        backtestScore: 0.87,
        driftPenalty: twinOutput.driftState === 'DEGRADED' ? 0.4 : twinOutput.driftState === 'CAUTION' ? 0.2 : 0.0,
    };

    const sensorConfidence = computeSensorConfidence(sensorInputs);
    const overallConfidence = computeOverallConfidence(sensorConfidence, sensorInputs);
    const confidenceBreakdown = makeConfidenceBreakdown(sensorInputs);

    const payload: Omit<ValidatedTwinOutput, 'signature'> = {
        requestId: twinOutput.requestId, region: twinOutput.region, timeUtc: twinOutput.timeUtc,
        grid: { system: 'H3', resolution: twinOutput.cellId.includes('world') ? 1 : twinOutput.cellId.startsWith('FAKE_H3') ? 6 : 8, cellId: twinOutput.cellId },
        pollutants: twinOutput.pollutants ?? {}, derived: twinOutput.derived,
        trust: { sensorConfidence, overallConfidence, confidenceBreakdown, driftState: twinOutput.driftState ?? 'NORMAL' },
        evidence: {
            sources: twinOutput.evidenceSources ?? [],
            versions: { normalizer: '1.0.0', twinModel: '1.0.0', rulesEngine: '1.0.0' },
        },
        actions: twinOutput.actions ?? [],
    };

    const canonicalJson = JSON.stringify(payload);
    const signature = signPayload(canonicalJson);
    const validated: ValidatedTwinOutput = { ...payload, signature };

    const parseResult = ValidatedTwinOutputSchema.safeParse(validated);
    if (!parseResult.success) {
        return reply.status(500).send({ error: 'Schema validation failed', details: parseResult.error.flatten() });
    }

    storeValidatedPayload(parseResult.data);
    return parseResult.data;
});

app.get('/v1/trust/payload/:requestId', async (request: FastifyRequest, reply: FastifyReply) => {
    const payload = getValidatedPayload((request.params as Record<string, string>).requestId);
    if (!payload) return reply.status(404).send({ error: 'Not found' });
    return payload;
});

// POST /v1/audit/export
app.post('/v1/audit/export', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = AuditExportRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const { requestId } = parsed.data;
    const payload = getValidatedPayload(requestId);
    if (!payload) return reply.status(404).send({ error: `No validated payload found for requestId: ${requestId}` });

    try {
        const pdfBytes = await generateAuditPdf(payload);
        reply.header('Content-Type', 'application/pdf');
        reply.header('Content-Disposition', `attachment; filename="audit_${requestId}.pdf"`);
        reply.header('Content-Length', pdfBytes.length);
        return reply.send(Buffer.from(pdfBytes));
    } catch (err) {
        app.log.error(err, '[audit] PDF generation error:');
        return reply.status(500).send({ error: 'PDF generation failed' });
    }
});

// POST /v1/explain
app.post('/v1/explain', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ExplainRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: parsed.error.flatten() });

    const { requestId, style } = parsed.data;
    const payload = getValidatedPayload(requestId);
    if (!payload) return reply.status(404).send({ error: `No validated payload found for requestId: ${requestId}` });

    try {
        const explanation = await generateExplanation(payload, style);
        return ExplainResponseSchema.parse({ ok: true, ...explanation });
    } catch (err) {
        app.log.error(err, '[explain] error:');
        return reply.status(500).send({ error: 'Explanation generation failed' });
    }
});

const start = async () => {
    try {
        const port = Number(process.env.PORT ?? 8080);
        await app.listen({ port, host: '0.0.0.0' });
        console.log(`Server listening on ${port}`);
    } catch (err) {
        app.log.error(err);
        process.exit(1);
    }
};
start();
