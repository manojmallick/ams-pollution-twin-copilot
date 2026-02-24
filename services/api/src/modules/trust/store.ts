import type { ValidatedTwinOutput } from '@ams-twin/contracts';

// In-memory store for validated payloads (prod: use Redis or S3)
const payloadStore = new Map<string, ValidatedTwinOutput>();

export function storeValidatedPayload(payload: ValidatedTwinOutput): void {
  payloadStore.set(payload.requestId, payload);
  // Keep at most 1000 entries
  if (payloadStore.size > 1000) {
    const oldest = payloadStore.keys().next().value;
    if (oldest) payloadStore.delete(oldest);
  }
}

export function getValidatedPayload(requestId: string): ValidatedTwinOutput | undefined {
  return payloadStore.get(requestId);
}

export function listPayloadIds(): string[] {
  return Array.from(payloadStore.keys()).slice(-50);
}
