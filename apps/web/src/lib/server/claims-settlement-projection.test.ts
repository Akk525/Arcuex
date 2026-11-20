import type { PublicClient } from 'viem';
import { describe, expect, it } from 'vitest';
import { InsuranceRepository, openDatabase } from '@arcuex/persistence';
import { acceptAndBindPolicy, requestCoverageQuote, type ClaimsCase } from '@arcuex/insurance';
import { projectSettlementFinality } from './claims-settlement-projection';

const hash = `0x${'bc'.repeat(32)}`;
const claim = {
  id: 'case-1',
  status: 'PAID',
  syntheticDemo: false,
  evidenceAuthenticity: 'verified_independent',
} as const satisfies Pick<ClaimsCase, 'id' | 'status' | 'syntheticDemo' | 'evidenceAuthenticity'>;

describe('confirmed receipt read projection', () => {
  it('requires a persisted, case-bound authority reconciliation in Arc mode', async () => {
    const db = openDatabase();
    let head = 11n;
    let hashes = [hash, hash];
    const rpc = {
      getChainId: async () => 5042002,
      getBlockNumber: async () => head,
      getBlock: async () => ({ number: 10n, hash: hashes.shift() ?? hash }),
    } as unknown as PublicClient;
    const read = async (
      c: Parameters<typeof projectSettlementFinality>[2] = claim,
      source = 'arc-testnet',
    ) => projectSettlementFinality(db, source, c, rpc);
    try {
      expect((await read()).confirmedSettlementReceipt).toBeNull();
      const repo = new InsuranceRepository(db);
      const quote = requestCoverageQuote(repo, {
        idempotencyKey: 'projection-quote',
        policyholder: {
          displayName: 'holder',
          walletAddress: '0x1111111111111111111111111111111111111111',
        },
        agent: { externalRef: 'agent', label: 'agent' },
      });
      const { policy, exposure } = acceptAndBindPolicy(repo, {
        quoteId: quote.id,
        idempotencyKey: 'projection-bind',
        fundingVerified: true,
      });
      db.prepare(
        `INSERT INTO claims_cases
        (id,schema_version,status,policy_id,exposure_id,claimant_ref,idempotency_key,synthetic_demo,
         evidence_authenticity,coverage_determination,settlement_authorization,deductible_micros,
         prior_compensation_micros,created_at,updated_at)
         VALUES (?,1,'PAID',?,?,'claimant','request',0,
          'verified_independent','covered','authorized','0','0',?,?)`,
      ).run(claim.id, policy.id, exposure.id, '2026-11-19T10:00:00Z', '2026-11-19T10:00:00Z');
      const insertEvent = (id: string, actor: string, receiptRef: string) =>
        db
          .prepare(
            `INSERT INTO claims_case_events VALUES
          (?,?,'SETTLEMENT_PENDING','PAID',?,'SETTLEMENT_RECONCILED',?,'2026-11-19T10:00:00Z')`,
          )
          .run(
            id,
            claim.id,
            actor,
            JSON.stringify({ receiptRef, anchor: { blockNumber: '10', blockHash: hash } }),
          );
      insertEvent('bogus', 'claimant:wallet', hash);
      insertEvent('invalid', 'authority:operator', '0xabc');
      expect((await read()).confirmedSettlementReceipt).toBeNull();
      insertEvent('settled', 'authority:operator', hash);
      expect(await read()).toMatchObject({
        paymentFinality: 'unverified',
        confirmedSettlementReceipt: null,
      });
      head = 12n;
      expect(await read()).toMatchObject({
        paymentFinality: 'confirmed',
        confirmedSettlementReceipt: hash,
      });
      hashes = [hash, `0x${'66'.repeat(32)}`];
      expect(await read()).toMatchObject({
        paymentFinality: 'unverified',
        confirmedSettlementReceipt: null,
      });
      hashes = Array(2).fill(`0x${'66'.repeat(32)}`);
      expect(await read()).toMatchObject({
        paymentFinality: 'reorged',
        confirmedSettlementReceipt: null,
      });
      expect((await read({ ...claim, id: 'other' })).confirmedSettlementReceipt).toBeNull();
      expect(
        (await read({ ...claim, status: 'SETTLEMENT_PENDING' })).confirmedSettlementReceipt,
      ).toBeNull();
      expect((await read({ ...claim, syntheticDemo: true })).confirmedSettlementReceipt).toBeNull();
      expect((await read(claim, 'fixture')).confirmedSettlementReceipt).toBeNull();
    } finally {
      db.close();
    }
  });
});
