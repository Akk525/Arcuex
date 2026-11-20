import type { ClaimsCase } from '@arcuex/insurance';
import type { SqliteDb } from '@arcuex/persistence';
import { hasArcReceiptHash } from '../claims/settlement-presentation';

export function isFixtureSettlementBlocked(
  chainSource: string,
  claim: Pick<ClaimsCase, 'syntheticDemo' | 'evidenceAuthenticity'>,
) {
  return (
    chainSource === 'fixture' ||
    claim.syntheticDemo ||
    claim.evidenceAuthenticity === 'synthetic_fixture'
  );
}

/** The production mark-paid handler writes this transition only after verifying an Arc receipt. */
export function confirmedClaimReceipt(
  db: SqliteDb,
  chainSource: string,
  claim: Pick<ClaimsCase, 'id' | 'status' | 'syntheticDemo' | 'evidenceAuthenticity'>,
) {
  if (
    chainSource !== 'arc-testnet' ||
    claim.status !== 'PAID' ||
    isFixtureSettlementBlocked(chainSource, claim)
  )
    return null;
  const proof = recordedSettlement(db, claim.id);
  return proof?.hash ?? null;
}

export function recordedSettlement(db: SqliteDb, caseId: string) {
  const row = db
    .prepare(
      `SELECT payload_json FROM claims_case_events
     WHERE case_id = ? AND reason_code = 'SETTLEMENT_RECONCILED'
       AND from_status IN ('SETTLEMENT_PENDING', 'SETTLEMENT_FAILED') AND to_status = 'PAID'
       AND actor LIKE 'authority:%'
     ORDER BY rowid DESC LIMIT 1`,
    )
    .get(caseId) as { payload_json: string } | undefined;
  if (!row) return null;
  const { receiptRef, anchor } = JSON.parse(row.payload_json) as {
    receiptRef: unknown;
    anchor?: { blockNumber: string; blockHash: `0x${string}` };
  };
  if (!hasArcReceiptHash(receiptRef)) return null;
  return { hash: receiptRef.toLowerCase(), anchor };
}
