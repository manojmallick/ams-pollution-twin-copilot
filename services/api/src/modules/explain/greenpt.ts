import OpenAI from 'openai';
import type { ValidatedTwinOutput } from '@ams-twin/contracts';
import type { ExplainResponse } from '@ams-twin/contracts';
import { extractGroundedFacts, buildAllowedValues, validateGrounding } from './grounder';

// Energy estimates: GreenPT mistral-small-3.2-24b-instruct-2506 ≈ 0.001 Wh per 1000 tokens (estimate)
const WH_PER_1K_TOKENS = 0.001;
const CO2_GRAMS_PER_WH = 0.233; // EU grid average

export async function generateExplanation(
  payload: ValidatedTwinOutput,
  style: 'CITIZEN' | 'CITY_OPS'
): Promise<Pick<ExplainResponse, 'narrative' | 'groundedFacts' | 'greenAiMeter'>> {
  const facts = extractGroundedFacts(payload);
  const allowedValues = buildAllowedValues(facts);

  const styleGuide =
    style === 'CITIZEN'
      ? 'Write for a general public audience. Use plain language. Avoid jargon. Max 150 words.'
      : 'Write for city operations staff. Be precise and technical. Include all relevant metrics. Max 200 words.';

  const systemPrompt = `You are a read-only environmental data narrator.
You may ONLY use numbers, values, and facts present in the provided JSON payload.
Do NOT invent data, extrapolate, or add recommendations not present in payload.actions.
${styleGuide}

IMPORTANT RULES:
- Every numeric value you state MUST come from the payload
- Every action you mention MUST be in payload.actions and have eligible=true
- Do not speculate about causes beyond what is in reasonCodes
- Do not make health recommendations beyond what actions specify`;

  const userPrompt = `Generate an environmental air quality explanation based ONLY on this validated payload:

${JSON.stringify({
    region: payload.region,
    timeUtc: payload.timeUtc,
    derived: payload.derived,
    pollutants: payload.pollutants,
    trust: {
      overallConfidence: payload.trust.overallConfidence,
      driftState: payload.trust.driftState
    },
    eligibleActions: payload.actions.filter(a => a.eligible),
    evidenceSources: payload.evidence.sources.map(s => ({ sourceId: s.sourceId, freshnessMinutes: s.freshnessMinutes }))
  }, null, 2)}`;

  const apiKey = process.env.ANTHROPIC_API_KEY ?? process.env.GREENPT_API_KEY;
  if (!apiKey) {
    // Templated fallback — no LLM, fully deterministic
    return buildTemplatedExplanation(payload, facts, style);
  }

  const client = new OpenAI({
    apiKey,
    baseURL: 'https://api.greenpt.ai/v1'
  });

  const response = await client.chat.completions.create({
    model: 'mistral-small-3.2-24b-instruct-2506',
    max_tokens: 512,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
  });

  const narrative = response.choices[0]?.message?.content || '';
  const tokensIn = response.usage?.prompt_tokens || 0;
  const tokensOut = response.usage?.completion_tokens || 0;

  // Grounding validation
  const { valid, violations } = validateGrounding(narrative, allowedValues);

  const finalNarrative = valid
    ? narrative
    : `[GROUNDING VALIDATION FAILED — ${violations.length} violation(s) detected: ${violations.join(', ')}. Using templated fallback.]\n\n${buildTemplatedExplanation(payload, facts, style).narrative}`;

  const totalTokens = tokensIn + tokensOut;
  const energyWh = (totalTokens / 1000) * WH_PER_1K_TOKENS;
  const co2eGrams = energyWh * CO2_GRAMS_PER_WH;

  return {
    narrative: finalNarrative,
    groundedFacts: facts,
    greenAiMeter: {
      provider: 'GreenPT mistral-small-3.2-24b-instruct-2506',
      tokensIn,
      tokensOut,
      energyWh: +energyWh.toFixed(6),
      co2eGrams: +co2eGrams.toFixed(6),
    },
  };
}

function buildTemplatedExplanation(
  payload: ValidatedTwinOutput,
  facts: ReturnType<typeof extractGroundedFacts>,
  style: 'CITIZEN' | 'CITY_OPS'
): Pick<ExplainResponse, 'narrative' | 'groundedFacts' | 'greenAiMeter'> {
  const { derived, pollutants, trust } = payload;
  const pm25 = pollutants['pm25'];
  const no2 = pollutants['no2'];

  let narrative: string;
  if (style === 'CITIZEN') {
    narrative = `Air quality in ${payload.region} at ${payload.timeUtc.replace('T', ' ').slice(0, 16)} UTC is currently rated ${derived.tier}` +
      (pm25 ? ` with PM2.5 at ${pm25.predicted.toFixed(1)} µg/m³` : '') +
      (no2 ? ` and NO₂ at ${no2.predicted.toFixed(1)} µg/m³` : '') +
      `. The risk score is ${derived.crs.toFixed(1)} out of 100.` +
      (derived.actionAllowed ? ' Protective actions are recommended.' : ' No protective actions are required at this time.') +
      ` Data confidence is ${(trust.overallConfidence * 100).toFixed(0)}%.`;
  } else {
    narrative = `OPERATIONAL BRIEFING — ${payload.region} | Cell: ${payload.grid.cellId}\n` +
      `Time: ${payload.timeUtc} | Tier: ${derived.tier} | CRS: ${derived.crs.toFixed(2)}/100\n` +
      (pm25 ? `PM2.5: ${pm25.predicted.toFixed(1)} ${pm25.unit} (PSI ${pm25.psi})\n` : '') +
      (no2 ? `NO₂: ${no2.predicted.toFixed(1)} ${no2.unit} (PSI ${no2.psi})\n` : '') +
      `Sensor Confidence: ${(trust.sensorConfidence * 100).toFixed(1)}% | Overall: ${(trust.overallConfidence * 100).toFixed(1)}%\n` +
      `Drift State: ${trust.driftState} | Action Gate: ${derived.actionAllowed ? 'OPEN' : 'CLOSED'}\n` +
      `Reason Codes: ${derived.reasonCodes.join(', ') || 'NONE'}`;
  }

  return {
    narrative,
    groundedFacts: facts,
    greenAiMeter: {
      provider: 'templated-no-llm',
      tokensIn: 0,
      tokensOut: 0,
      energyWh: 0,
      co2eGrams: 0,
    },
  };
}
