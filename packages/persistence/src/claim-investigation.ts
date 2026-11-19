import { createHash, randomUUID } from 'node:crypto';
import type { SqliteDb } from './db';
export type InvestigationKind =
  | 'message'
  | 'proof_request'
  | 'proof_submission'
  | 'request_resolution'
  | 'escalation'
  | 'examiner_request'
  | 'examiner_started'
  | 'examiner_report'
  | 'examiner_failure';
export type InvestigationEntry = {
  id: string;
  caseId: string;
  sequence: number;
  kind: InvestigationKind;
  actor: string;
  requestKey: string;
  createdAt: string;
  payloadJson: string;
  previousHash: string;
  recordHash: string;
};
export const investigationHash = (text: string) =>
  `sha256:${createHash('sha256').update(text).digest('hex')}`;
const hashEntry = ({ recordHash: _hash, ...entry }: InvestigationEntry) =>
  investigationHash(JSON.stringify(entry));
export function listInvestigationEntries(db: SqliteDb, caseId: string): InvestigationEntry[] {
  const rows = db
    .prepare(
      `SELECT id,case_id AS caseId,sequence,kind,actor,request_key AS requestKey,created_at AS createdAt,payload_json AS payloadJson,previous_hash AS previousHash,record_hash AS recordHash FROM claim_investigation_entries WHERE case_id=? ORDER BY sequence`,
    )
    .all(caseId) as InvestigationEntry[];
  let previous = 'genesis';
  for (const [i, row] of rows.entries()) {
    if (
      row.caseId !== caseId ||
      row.sequence !== i + 1 ||
      row.previousHash !== previous ||
      hashEntry(row) !== row.recordHash
    )
      throw new Error('Investigation provenance integrity failed');
    previous = row.recordHash;
  }
  return rows;
}
export function appendInvestigationEntry(
  db: SqliteDb,
  input: {
    caseId: string;
    kind: InvestigationKind;
    actor: string;
    requestKey: string;
    payload: unknown;
  },
): InvestigationEntry {
  return db.transaction(() => {
    const rows = listInvestigationEntries(db, input.caseId),
      payloadJson = JSON.stringify(input.payload);
    const previous = rows.find((r) => r.actor === input.actor && r.requestKey === input.requestKey);
    if (previous) {
      if (previous.kind !== input.kind || previous.payloadJson !== payloadJson)
        throw new Error('Investigation idempotency conflict');
      return previous;
    }
    if (rows.length >= 200) throw new Error('Investigation journal limit reached');
    const row: InvestigationEntry = {
      id: randomUUID(),
      caseId: input.caseId,
      sequence: rows.length + 1,
      kind: input.kind,
      actor: input.actor,
      requestKey: input.requestKey,
      createdAt: new Date().toISOString(),
      payloadJson,
      previousHash: rows.at(-1)?.recordHash ?? 'genesis',
      recordHash: '',
    };
    row.recordHash = hashEntry(row);
    db.prepare(
      `INSERT INTO claim_investigation_entries VALUES (@id,@caseId,@sequence,@kind,@actor,@requestKey,@createdAt,@payloadJson,@previousHash,@recordHash)`,
    ).run(row);
    return row;
  })();
}
