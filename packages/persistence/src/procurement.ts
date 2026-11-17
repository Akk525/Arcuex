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
