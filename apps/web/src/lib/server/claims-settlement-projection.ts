import { ARC_CONFIRMATION_DEPTH, assertArcChain } from './arc-confirmation';
import { procurementClient } from './procurement-chain';
import type { PublicClient } from 'viem';
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

type PaymentClaim = Pick<ClaimsCase, 'id' | 'status' | 'syntheticDemo' | 'evidenceAuthenticity'>;

export async function projectSettlementFinality(
  db: SqliteDb,
  chainSource: string,
  claim: PaymentClaim,
  rpc?: PublicClient,
): Promise<{
  paymentFinality: 'unverified' | 'confirmed' | 'reorged' | 'not_paid';
  confirmedSettlementReceipt: string | null;
}> {
  const withoutReceipt = (paymentFinality: 'unverified' | 'reorged' | 'not_paid') => ({
    paymentFinality,
    confirmedSettlementReceipt: null,
  });
  if (chainSource !== 'arc-testnet' || isFixtureSettlementBlocked(chainSource, claim))
    return withoutReceipt('not_paid');
  if (claim.status !== 'PAID') {
    const last = db
      .prepare(
        `SELECT reason_code FROM claims_case_events WHERE case_id=? AND from_status<>to_status
        ORDER BY rowid DESC LIMIT 1`,
      )
      .get(claim.id) as { reason_code: string } | undefined;
    return withoutReceipt(last?.reason_code === 'SETTLEMENT_ORPHANED' ? 'reorged' : 'not_paid');
  }
  const proof = recordedSettlement(db, claim.id);
  if (!proof?.anchor) return withoutReceipt('unverified');
  try {
    const client = rpc ?? procurementClient();
    await assertArcChain(client);
    const blockNumber = BigInt(proof.anchor.blockNumber);
    const head = await client.getBlockNumber({ cacheTime: 0 });
    if (head < blockNumber + ARC_CONFIRMATION_DEPTH) return withoutReceipt('unverified');
    const block = await client.getBlock({ blockNumber });
    if (!block.hash || block.number !== blockNumber) return withoutReceipt('unverified');
    const checkedAgain = await client.getBlock({ blockNumber });
    if (checkedAgain.hash !== block.hash || checkedAgain.number !== blockNumber)
      return withoutReceipt('unverified');
    if (block.hash !== proof.anchor.blockHash) return withoutReceipt('reorged');
    const current = db.prepare('SELECT status FROM claims_cases WHERE id=?').get(claim.id) as
      { status: string } | undefined;
    const currentProof = recordedSettlement(db, claim.id);
    if (
      current?.status !== 'PAID' ||
      currentProof?.hash !== proof.hash ||
      currentProof.anchor?.blockHash !== proof.anchor.blockHash
    )
      return withoutReceipt('unverified');
    return { paymentFinality: 'confirmed', confirmedSettlementReceipt: proof.hash };
  } catch {
    return withoutReceipt('unverified');
  }
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
