import { confirmedClaimReceipt } from './claims-settlement-projection';
import { NextResponse } from 'next/server';
import { explorerTxUrl } from '@arcuex/chain';
import { sameIndependentLiquidationProfile, type PolicyLifecycle } from '@arcuex/domain';
import { configuredIndependentLiquidation } from './independent-evidence';
import { canAccessClaimsPolicy } from '@arcuex/insurance';
import { toPolicyIdBytes32 } from '@arcuex/onchain';
import { ProcurementStore } from '@arcuex/persistence';
import { authenticateClaimsRequest } from './claims-auth';
import { getDb, getRepo } from './db';
import {
  reconciliationRows,
  reconciliationScope,
  type BindEvidence,
} from './policy-reconciliation';
import { procurementPool } from './procurement-chain';
import { getRuntimeConfig } from './runtime-config';
import { readFixture } from './fixture-source';
const headers = { 'Cache-Control': 'no-store', Vary: 'Cookie, Authorization' };
export function readPolicies(request: Request, policyId?: string) {
  const auth = authenticateClaimsRequest(request, ['claimant', 'reviewer', 'authority', 'system']);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers });
  const db = getDb(),
    store = new ProcurementStore(db),
    p = auth.principal;
  const rows = reconciliationRows(db);
  const config = getRuntimeConfig();
  const fixture = config.chainSource === 'fixture' ? readFixture(db, config) : null;
  const source = fixture?.source ?? {
    mode: 'arc-testnet' as const,
    id: `arc-testnet:5042002:${procurementPool}`,
  };
  if (policyId === undefined) {
    // Wallet users see only their established roles; beneficiary/payer is never inferred to be owner.
    const visible = rows.filter((r) => {
      if (p.role !== 'claimant') return true;
      const e = JSON.parse(r.payload) as BindEvidence;
      const local = r.local_policy_id ? store.policy(r.local_policy_id) : null;
      return (
        p.walletAddress &&
        (local?.terms?.owner === p.walletAddress ||
          e.premiumPayer.toLowerCase() === p.walletAddress ||
          e.beneficiary.toLowerCase() === p.walletAddress)
      );
    });
    return NextResponse.json(
      {
        version: 1,
        source,
        records: visible
          .filter((r) => r.status !== 'VERIFIED_LINKED')
          .map((r) => ({
            onchainPolicyId: r.onchain_policy_id,
            policyId: r.local_policy_id,
            completeness: r.status,
            claimsEligible: false,
            evidence: JSON.parse(r.payload) as BindEvidence,
          })),
      },
      { headers },
    );
  }
  // Only entity UUIDs are accepted here; do not hash arbitrary caller strings into policy identities.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(policyId))
    return NextResponse.json({ error: 'Policy not found' }, { status: 404, headers });
  const policy = store.policy(policyId);
  if (
    !policy ||
    (p.role === 'claimant' &&
      policy.terms?.owner !== p.walletAddress &&
      policy.payer !== p.walletAddress &&
      !canAccessClaimsPolicy(getRepo(), p, policyId))
  )
    return NextResponse.json({ error: 'Policy not found' }, { status: 404, headers });
  const linked = rows.filter((r) => r.local_policy_id === policyId);
  const row = linked.find((r) => r.canonical === 1) ?? linked.at(-1);
  const scope = db
    .prepare('SELECT healthy,checked_at FROM policy_reconciliation_scopes WHERE scope=?')
    .get(fixture ? `fixture:${fixture.id}` : reconciliationScope) as
    { healthy: number; checked_at: number } | undefined;
  const now = Math.floor(Date.now() / 1000);
  const verified =
    row?.canonical === 1 && row.status === 'VERIFIED_LINKED' && store.claimsEligible(policyId, now);
  const evidence = row ? (JSON.parse(row.payload) as BindEvidence) : null;
  const settlements = db
    .prepare(
      `SELECT id,status,synthetic_demo,evidence_authenticity FROM claims_cases
       WHERE procurement_policy_id=? ORDER BY created_at,id`,
    )
    .all(policyId) as Array<{
    id: string;
    status: string;
    synthetic_demo: number;
    evidence_authenticity: Parameters<typeof confirmedClaimReceipt>[2]['evidenceAuthenticity'];
  }>;
  const body: PolicyLifecycle = {
    version: 1,
    source,
    policyId,
    onchainPolicyId: toPolicyIdBytes32(policyId),
    state: verified
      ? now > policy.terms.expiresAt
        ? 'expired'
        : fixture
          ? 'fixture_ready'
          : 'confirmed'
      : row || policy.bindTx
        ? 'reconciliation_pending'
        : now >= policy.terms?.quoteExpiresAt
          ? 'expired'
          : 'prepared',
    completeness: row?.status ?? null,
    chainId: 5042002,
    pool: procurementPool,
    claimsEligible: Boolean(
      verified &&
      p.role === 'claimant' &&
      canAccessClaimsPolicy(getRepo(), p, policyId) &&
      now >= policy.terms.effectiveAt &&
      (policy.terms.synthetic ||
        (now <= policy.terms.expiresAt &&
          sameIndependentLiquidationProfile(
            policy.terms.independentProfile,
            configuredIndependentLiquidation(),
          ))),
    ),
    checkedAt: scope?.checked_at ?? null,
    confirmation:
      evidence && !fixture
        ? {
            transactionHash: evidence.transactionHash,
            explorerUrl: fixture ? null : explorerTxUrl(evidence.transactionHash),
            blockNumber: evidence.blockNumber,
            blockHash: evidence.blockHash,
            logIndex: evidence.logIndex,
          }
        : null,
    settlements: settlements.map((s) => {
      const receiptRef = confirmedClaimReceipt(db, config.chainSource, {
        id: s.id,
        status: s.status as Parameters<typeof confirmedClaimReceipt>[2]['status'],
        syntheticDemo: s.synthetic_demo === 1,
        evidenceAuthenticity: s.evidence_authenticity,
      });
      return {
        caseId: s.id,
        state: s.status === 'PAID' && !receiptRef ? 'Payment unconfirmed' : s.status,
        receiptRef,
        explorerUrl: receiptRef ? explorerTxUrl(receiptRef as `0x${string}`) : null,
      };
    }),
    notice: fixture
      ? 'SYNTHETIC FIXTURE: policy, reservation and checkpoint are rehearsal data, not Arc confirmations. No live financial operations.'
      : policy.terms.synthetic
        ? 'Synthetic cover on Arc Testnet. An accepted quote is offchain until a canonical bind is linked.'
        : 'Independent-evidence pilot on Arc Testnet. Coverage follows the reconciled bind and effective window.',
  };
  return NextResponse.json(body, { headers });
}
