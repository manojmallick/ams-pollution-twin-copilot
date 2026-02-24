import type { ValidatedTwinOutput } from '@ams-twin/contracts';

export interface GroundedFact {
  fieldPath: string;
  value: unknown;
}

// Extract all numeric and categorical values from payload for grounding validation
export function extractGroundedFacts(payload: ValidatedTwinOutput): GroundedFact[] {
  const facts: GroundedFact[] = [
    { fieldPath: 'requestId', value: payload.requestId },
    { fieldPath: 'region', value: payload.region },
    { fieldPath: 'timeUtc', value: payload.timeUtc },
    { fieldPath: 'grid.cellId', value: payload.grid.cellId },
    { fieldPath: 'derived.crs', value: payload.derived.crs },
    { fieldPath: 'derived.tier', value: payload.derived.tier },
    { fieldPath: 'derived.actionAllowed', value: payload.derived.actionAllowed },
    { fieldPath: 'derived.persistence', value: payload.derived.persistence },
    { fieldPath: 'derived.exposureNorm', value: payload.derived.exposureNorm },
    { fieldPath: 'trust.sensorConfidence', value: payload.trust.sensorConfidence },
    { fieldPath: 'trust.overallConfidence', value: payload.trust.overallConfidence },
    { fieldPath: 'trust.driftState', value: payload.trust.driftState },
  ];

  for (const [name, p] of Object.entries(payload.pollutants)) {
    facts.push({ fieldPath: `pollutants.${name}.predicted`, value: p.predicted });
    facts.push({ fieldPath: `pollutants.${name}.psi`, value: p.psi });
    facts.push({ fieldPath: `pollutants.${name}.unit`, value: p.unit });
    facts.push({ fieldPath: `pollutants.${name}.uncertaintyNorm`, value: p.uncertaintyNorm });
  }

  for (const src of payload.evidence.sources) {
    facts.push({ fieldPath: `evidence.sources[${src.sourceId}].freshnessMinutes`, value: src.freshnessMinutes });
    facts.push({ fieldPath: `evidence.sources[${src.sourceId}].license`, value: src.license });
  }

  const eligibleActions = payload.actions.filter((a) => a.eligible);
  for (const action of eligibleActions) {
    facts.push({ fieldPath: `actions[${action.actionId}].priority`, value: action.priority });
  }

  return facts;
}

// Build a set of allowed numeric values (with ±5% tolerance)
export function buildAllowedValues(facts: GroundedFact[]): { numbers: Set<string>; strings: Set<string> } {
  const numbers = new Set<string>();
  const strings = new Set<string>();

  // allow base structural numbers like PM2.5 or NO2 to avoid false alarms
  numbers.add('2');
  numbers.add('2.5');
  numbers.add('5');
  numbers.add('10');

  for (const f of facts) {
    if (typeof f.value === 'number') {
      // Allow ±5% variation for rounding
      for (let mult = 0.95; mult <= 1.05; mult += 0.01) {
        numbers.add((f.value * mult).toFixed(0));
        numbers.add((f.value * mult).toFixed(1));
        numbers.add((f.value * mult).toFixed(2));
      }

      // Allow percentages if value between 0 and 1
      if (f.value >= 0 && f.value <= 1) {
        const pct = f.value * 100;
        for (let mult = 0.95; mult <= 1.05; mult += 0.01) {
          numbers.add((pct * mult).toFixed(0));
          numbers.add((pct * mult).toFixed(1));
          numbers.add((pct * mult).toFixed(2));
        }
      }
    } else if (typeof f.value === 'string') {
      strings.add(f.value.toLowerCase());

      // Extract numbers from strings like "2026-02-23T23:40Z"
      const strNumbers = f.value.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
      for (const n of strNumbers) {
        numbers.add(n);
        // Also add integer version of string numbers just in case
        numbers.add(parseFloat(n).toFixed(0));
      }
    }
  }

  return { numbers, strings };
}

// Validate LLM output: reject if novel numbers appear that are not in the payload
export function validateGrounding(
  narrative: string,
  allowedValues: ReturnType<typeof buildAllowedValues>
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];

  // Extract all numbers from narrative
  const narrativeNumbers = narrative.match(/\b\d+(?:\.\d+)?\b/g) ?? [];
  for (const num of narrativeNumbers) {
    // Skip years, common innocuous numbers
    const n = parseFloat(num);
    if (n >= 2020 && n <= 2030) continue; // year
    if (n === 0 || n === 100) continue; // boundary values

    if (!allowedValues.numbers.has(num) && !allowedValues.numbers.has(parseFloat(num).toFixed(0))) {
      violations.push(`Novel number not in payload: ${num}`);
    }
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
