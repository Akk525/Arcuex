import type { ClaimsCase } from '@arcuex/insurance';
import type { SqliteDb } from '@arcuex/persistence';
import { hasArcReceiptHash } from '@/lib/claims/settlement-presentation';

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
  const row = db
    .prepare(
      `SELECT json_extract(payload_json, '$.receiptRef') AS receipt FROM claims_case_events
     WHERE case_id = ? AND reason_code = 'SETTLEMENT_RECONCILED'
       AND from_status = 'SETTLEMENT_PENDING' AND to_status = 'PAID'
       AND actor LIKE 'authority:%'
     ORDER BY created_at DESC, rowid DESC LIMIT 1`,
    )
    .get(claim.id) as { receipt: unknown } | undefined;
  return hasArcReceiptHash(row?.receipt) ? row.receipt : null;
}
