import Database from 'better-sqlite3';
import path from 'path';
import type { ValidatedTwinOutput } from '@ams-twin/contracts';

const DB_PATH = path.join(process.cwd(), '.data', 'trust.db');

let _db: Database.Database | null = null;

function db(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS validated_payloads (
      request_id  TEXT PRIMARY KEY,
      payload_json TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
  `);
  return _db;
}

export function storeValidatedPayload(payload: ValidatedTwinOutput): void {
  const stmt = db().prepare(`
    INSERT OR REPLACE INTO validated_payloads (request_id, payload_json, created_at)
    VALUES (?, ?, ?)
  `);
  stmt.run(payload.requestId, JSON.stringify(payload), Date.now());

  // Keep at most 1000 entries, delete oldest
  db().prepare(`
    DELETE FROM validated_payloads
    WHERE request_id NOT IN (
      SELECT request_id FROM validated_payloads
      ORDER BY created_at DESC
      LIMIT 1000
    )
  `).run();
}

export function getValidatedPayload(requestId: string): ValidatedTwinOutput | undefined {
  const row = db().prepare(
    'SELECT payload_json FROM validated_payloads WHERE request_id = ?'
  ).get(requestId) as { payload_json: string } | undefined;
  if (!row) return undefined;
  return JSON.parse(row.payload_json) as ValidatedTwinOutput;
}

export function listPayloadIds(): string[] {
  const rows = db().prepare(
    'SELECT request_id FROM validated_payloads ORDER BY created_at DESC LIMIT 50'
  ).all() as { request_id: string }[];
  return rows.map((r) => r.request_id);
}
