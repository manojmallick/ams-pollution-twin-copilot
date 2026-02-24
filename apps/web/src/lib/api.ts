const IS_PROD = process.env.NODE_ENV === 'production';
const BASE = process.env.NEXT_PUBLIC_API_BASE ?? (IS_PROD ? 'https://ams-pollution-api.fly.dev' : 'http://localhost:8080');
const TWIN_URL = BASE;
const TRUST_URL = BASE;
const AUDIT_URL = BASE;
const EXPLAIN_URL = BASE;

export async function pullIngest() {
  const res = await fetch(`${BASE}/v1/ingest/pull`, { method: 'POST' });
  return res.json();
}

export async function getIngestStatus() {
  const res = await fetch(`${BASE}/v1/ingest/status`);
  return res.json();
}

export async function getTwinCells(bbox: string, time: string) {
  const res = await fetch(`${TWIN_URL}/v1/twin/cells?bbox=${bbox}&time=${encodeURIComponent(time)}`);
  return res.json();
}

export async function runScenario(body: {
  region: string;
  timeUtc: string;
  cellId: string;
  levers: { trafficMultiplier: number; zone: 'A10-ring' };
}) {
  const res = await fetch(`${TWIN_URL}/v1/twin/scenario`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function getDrift(region = 'Amsterdam') {
  const res = await fetch(`${TRUST_URL}/v1/trust/drift?region=${region}`);
  return res.json();
}

export async function validatePayload(twinOutput: unknown) {
  const res = await fetch(`${TRUST_URL}/v1/trust/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(twinOutput),
  });
  return res.json();
}

export async function exportAuditPdf(requestId: string): Promise<Blob> {
  const res = await fetch(`${AUDIT_URL}/v1/audit/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId }),
  });
  return res.blob();
}

export async function explain(requestId: string, cellId: string, style: 'CITIZEN' | 'CITY_OPS' = 'CITIZEN') {
  const res = await fetch(`${EXPLAIN_URL}/v1/explain`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId, cellId, style }),
  });
  return res.json();
}
