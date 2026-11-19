import { describe, expect, it } from 'vitest';
import { InsuranceRepository, openDatabase } from '@arcuex/persistence';
import { acceptAndBindPolicy, requestCoverageQuote, type ClaimsCase } from '@arcuex/insurance';
import { confirmedClaimReceipt } from './claims-settlement-projection';

const hash = `0x${'bc'.repeat(32)}`;
const claim = {
  id: 'case-1',
  status: 'PAID',
  syntheticDemo: false,
  evidenceAuthenticity: 'verified_independent',
} as const satisfies Pick<ClaimsCase, 'id' | 'status' | 'syntheticDemo' | 'evidenceAuthenticity'>;

describe('confirmed receipt read projection', () => {
  it('requires a persisted, case-bound authority reconciliation in Arc mode', () => {
    const db = openDatabase();
    try {
      expect(confirmedClaimReceipt(db, 'arc-testnet', claim)).toBeNull();
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
          .run(id, claim.id, actor, JSON.stringify({ receiptRef }));
      insertEvent('bogus', 'claimant:wallet', hash);
      insertEvent('invalid', 'authority:operator', '0xabc');
      expect(confirmedClaimReceipt(db, 'arc-testnet', claim)).toBeNull();
      insertEvent('settled', 'authority:operator', hash);
      expect(confirmedClaimReceipt(db, 'arc-testnet', claim)).toBe(hash);
      expect(confirmedClaimReceipt(db, 'arc-testnet', { ...claim, id: 'other' })).toBeNull();
      expect(
        confirmedClaimReceipt(db, 'arc-testnet', { ...claim, status: 'SETTLEMENT_PENDING' }),
      ).toBeNull();
      expect(
        confirmedClaimReceipt(db, 'arc-testnet', { ...claim, syntheticDemo: true }),
      ).toBeNull();
      expect(confirmedClaimReceipt(db, 'fixture', claim)).toBeNull();
    } finally {
      db.close();
    }
  });
});
