import { createHash } from 'crypto';
import type { ValidatedTwinOutput } from '@ams-twin/contracts';

export function nowIso(): string {
  return new Date().toISOString();
}

export function generateRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

export function canonicalJson(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj as object).sort());
}

export function computePayloadHash(payload: Omit<ValidatedTwinOutput, 'signature'>): string {
  // Deterministic canonical serialisation (sorted keys at top level)
  const canonical = JSON.stringify(payload, null, 0);
  return sha256(canonical);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function minutesSince(isoDate: string): number {
  return Math.floor((Date.now() - new Date(isoDate).getTime()) / 60_000);
}
