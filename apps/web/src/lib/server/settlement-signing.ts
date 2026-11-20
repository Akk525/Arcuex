import { randomUUID } from 'node:crypto';
import type { ClaimsCase } from '@arcuex/insurance';
import type { SqliteDb } from '@arcuex/persistence';

type SigningAuthorization = {
  settlementPrepId: string;
  account: string;
  nonce: number;
  signBefore: string;
  authorizedAt: string;
};

export function readSigningAuthorization(db: SqliteDb, claim: ClaimsCase) {
  const row = db
    .prepare(
      `SELECT payload_json FROM claims_case_events WHERE case_id=?
      AND reason_code='SETTLEMENT_SIGNING_AUTHORIZED'
      AND json_extract(payload_json, '$.settlementPrepId')=?`,
    )
    .get(claim.id, claim.settlementPrepId) as { payload_json: string } | undefined;
  return row ? (JSON.parse(row.payload_json) as SigningAuthorization) : null;
}

export function recordSigningAuthorization(
  db: SqliteDb,
  expectedPrepId: string,
  account: string,
  nonce: number,
  signBefore: string,
  actor: string,
  revalidate: () => ClaimsCase,
) {
  return db
    .transaction(() => {
      const claim = revalidate();
      if (claim.status !== 'SETTLEMENT_PENDING' || claim.settlementPrepId !== expectedPrepId)
        throw new Error('Settlement preparation changed');
      const prepared = db
        .prepare(
          `SELECT 1 FROM claims_case_events WHERE case_id=? AND reason_code='SETTLEMENT_PREPARED'
        AND json_extract(payload_json, '$.settlementPrepId')=?
        AND json_extract(payload_json, '$.signingProtocol')=1`,
        )
        .get(claim.id, expectedPrepId);
      if (!prepared) throw new Error('Legacy settlement preparation requires receipt audit');
      if (
        db
          .prepare(
            `SELECT 1 FROM claims_case_events WHERE reason_code='SETTLEMENT_SIGNING_AUTHORIZED'
        AND lower(json_extract(payload_json, '$.account'))=lower(?)
        AND json_extract(payload_json, '$.nonce')=?`,
          )
          .get(account, nonce)
      )
        throw new Error('The wallet nonce is already reserved for settlement');
      if (readSigningAuthorization(db, claim))
        throw new Error('A previous signing authorization has an unresolved receipt state');
      const now = Date.now();
      if (now >= Date.parse(signBefore)) throw new Error('Settlement signing deadline expired');
      const grant = {
        settlementPrepId: expectedPrepId,
        account,
        nonce,
        signBefore,
        authorizedAt: new Date(now).toISOString(),
      };
      db.prepare(
        `INSERT INTO claims_case_events
       (id,case_id,from_status,to_status,actor,reason_code,payload_json,created_at)
       VALUES (?,?,'SETTLEMENT_PENDING','SETTLEMENT_PENDING',?,'SETTLEMENT_SIGNING_AUTHORIZED',?,?)`,
      ).run(randomUUID(), claim.id, actor, JSON.stringify(grant), grant.authorizedAt);
      return grant;
    })
    .immediate();
}

export function requireSigningAuthorization(
  db: SqliteDb,
  claim: ClaimsCase,
  account: string,
  nonce: number,
  inclusionTimestamp: number,
  succeeded: boolean,
) {
  const grant = readSigningAuthorization(db, claim);
  if (
    !grant ||
    grant.nonce !== nonce ||
    grant.account.toLowerCase() !== account.toLowerCase() ||
    Math.floor(Date.parse(grant.authorizedAt) / 1000) > inclusionTimestamp ||
    (succeeded && inclusionTimestamp * 1000 + 999 >= Date.parse(grant.signBefore))
  )
    throw new Error('Receipt is outside the recorded signing authorization');
}
