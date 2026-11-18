import type { SqliteDb } from './db';
import type { ProcurementPolicy } from '@arcuex/domain';

/** Records are insert-only. Revocation is a separate immutable record. */
export class ProcurementStore {
  constructor(readonly db: SqliteDb) {}
  get<T>(kind: string, id: string): T | null {
    const row = this.db
      .prepare('SELECT payload FROM procurement_records WHERE kind=? AND id=?')
      .get(kind, id) as { payload: string } | undefined;
    return row ? (JSON.parse(row.payload) as T) : null;
  }
  list<T>(kind: string, owner: string): T[] {
    return (
      this.db
        .prepare('SELECT payload FROM procurement_records WHERE kind=? AND owner=?')
        .all(kind, owner) as { payload: string }[]
    ).map((r) => JSON.parse(r.payload) as T);
  }
  insert(kind: string, id: string, owner: string, payload: unknown) {
    this.db.transaction(() =>
      this.db
        .prepare('INSERT INTO procurement_records VALUES (?,?,?,?)')
        .run(kind, id, owner, JSON.stringify(payload)),
    )();
  }
  policy(id: string): ProcurementPolicy | null {
    const row = this.db
      .prepare('SELECT payload, bind_tx, confirmed_at FROM procurement_policies WHERE id=?')
      .get(id) as
      { payload: string; bind_tx: string | null; confirmed_at: number | null } | undefined;
    return row
      ? ({
          ...JSON.parse(row.payload),
          state: row.bind_tx ? 'confirmed' : 'prepared',
          bindTx: row.bind_tx,
          confirmedAt: row.confirmed_at,
        } as ProcurementPolicy)
      : null;
  }
  policies(owner: string): ProcurementPolicy[] {
    return (
      this.db.prepare('SELECT id FROM procurement_policies WHERE owner=?').all(owner) as {
        id: string;
      }[]
    ).map((r) => this.policy(r.id)!);
  }
  insertPolicy(policy: ProcurementPolicy) {
    this.db.transaction(() =>
      this.db
        .prepare('INSERT INTO procurement_policies(id,owner,quote_id,payload) VALUES (?,?,?,?)')
        .run(
          policy.terms.policyId,
          policy.terms.owner,
          policy.terms.quoteId,
          JSON.stringify(policy),
        ),
    )();
  }
  /** Fail closed on missing, stale, failed or reorged canonical evidence. */
  claimsEligible(id: string, now = Math.floor(Date.now() / 1000)): boolean {
    const rows = this.db
      .prepare(
        `SELECT e.event_key FROM policy_bind_events e
      JOIN policy_reconciliation_scopes s ON s.scope=e.scope
      WHERE e.local_policy_id=? AND e.canonical=1 AND e.status='VERIFIED_LINKED'
      AND s.healthy=1 AND s.checked_at<=? AND s.checked_at>=?`,
      )
      .all(id, now, now - 300);
    return rows.length === 1;
  }
  confirm(id: string, hash: string, at: number) {
    this.db.transaction(() =>
      this.db
        .prepare(
          'UPDATE procurement_policies SET bind_tx=?, confirmed_at=? WHERE id=? AND bind_tx IS NULL',
        )
        .run(hash, at, id),
    )();
  }
}
