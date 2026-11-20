import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { PolicyLifecycle, ProcurementPolicy } from '@arcuex/domain';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import contract from './contract.json';
import {
  checkoutStatus,
  paymentSteps,
  portfolioState,
  quoteCountdown,
} from '../lib/procurement/checkout-presentation';
import { eligibleLimits, policyPhase } from '../lib/procurement/presentation';
import { policyTimeline } from '../lib/procurement/policy-timeline';
import {
  clearBindAttempt,
  readBindAttempt,
  saveBindAttempt,
} from '../lib/procurement/bind-attempt';
import {
  parseClaimCaseDetailPayload,
  parseClaimsCaseListPayload,
  readClaimsClientResponse,
} from '../lib/claims/claims-client-response';
import { settlementPresentation } from '../lib/claims/settlement-presentation';

const { examples } = contract;
const now = 1795153000;
const policy = {
  ...examples.accept.responseProjection.policy,
  terms: {
    ...examples.quote.responseProjection.terms,
    effectiveAt: now - 100,
    expiresAt: now + 600,
  },
} as ProcurementPolicy;
const bindHash = examples.activePolicy.responseProjection.confirmation
  .transactionHash as `0x${string}`;
const lifecycle: PolicyLifecycle = {
  ...examples.activePolicy.responseProjection,
  version: 1,
  chainId: 5042002,
  checkedAt: now,
  onchainPolicyId: bindHash,
  pool: examples.catalogFixture.responseProjection.pool,
  notice: 'Synthetic test data',
  state: 'confirmed',
  completeness: 'VERIFIED_LINKED',
  source: { mode: 'arc-testnet', id: 'synthetic-compatibility-fixture' },
  confirmation: {
    ...examples.activePolicy.responseProjection.confirmation,
    blockHash: bindHash,
    explorerUrl: null,
  },
  settlements: [],
};

const checkoutFacts = {
  hasQuote: true,
  accepted: true,
  quoteExpired: false,
  allowanceConfirmed: false,
  allowanceHash: false,
  bindHash: false,
  bindUncertain: false,
  phase: 'prepared' as const,
};
const caseFields = {
  syntheticDemo: false,
  labels: { synthetic: null },
  reviewReasonCode: null,
  payable: { usdc: '1' },
  updatedAt: '2026-11-20T05:39:00Z',
};
const detail = <T extends { case: object }>(projection: T) => ({
  ...projection,
  case: { ...caseFields, ...projection.case },
  timeline: [],
  evidenceManifests: [],
});
const presentSettlement = (value: NonNullable<ReturnType<typeof parseClaimCaseDetailPayload>>) =>
  settlementPresentation({
    status: String(value.case.status),
    blocked: false,
    canPrepare: false,
    confirmedReceipt: value.confirmedSettlementReceipt,
  });

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

beforeEach(() =>
  vi.stubGlobal('fetch', () => {
    throw new Error('Network access forbidden in compatibility checks');
  }),
);
afterEach(() => vi.unstubAllGlobals());

describe('current compatible behavior', () => {
  it('loads all 13 frozen examples and retains the accepted quote identity', () => {
    expect(Object.keys(examples)).toHaveLength(13);
    expect(contract.exampleData).toMatch(/SYNTHETIC EXAMPLES ONLY/);
    expect(examples.accept.responseProjection.policy.digest).toBe(
      examples.quote.responseProjection.digest,
    );
    expect(examples.accept.responseProjection.policy.terms.policyId).toBe(
      examples.quote.responseProjection.terms.policyId,
    );
    expect(examples.paymentAlreadyConfirmed.responseProjection.transaction).toBeNull();
    expect(examples.fixturePaymentBlocked.responseProjection.code).toBe(
      'FIXTURE_FINANCIAL_DISABLED',
    );
  });

  it('shows allowance separately from bind and preserves pending reconciliation after a bind hash', () => {
    expect(checkoutStatus(checkoutFacts)?.label).toMatch(/Awaiting wallet/);
    expect(paymentSteps({ ...checkoutFacts, allowanceConfirmed: true })).toMatchObject([
      { id: 'allowance', state: 'done' },
      { id: 'bind', state: 'current' },
      { id: 'reconcile', state: 'waiting' },
    ]);
    expect(paymentSteps({ ...checkoutFacts, bindHash: true, phase: 'reconciling' })[2]?.state).toBe(
      'current',
    );
    expect(checkoutStatus({ ...checkoutFacts, bindHash: true, quoteExpired: true })?.label).toMatch(
      /Reconciliation pending/,
    );
    expect(quoteCountdown(policy.terms.quoteExpiresAt, policy.terms.quoteExpiresAt)).toBe(
      'Expired',
    );
  });

  it('retains a submitted hash and an ambiguous bind independently from wallet retries', () => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('sessionStorage', memoryStorage());
    saveBindAttempt(policy.terms.policyId, { state: 'uncertain' });
    expect(readBindAttempt(policy.terms.policyId)).toEqual({ state: 'uncertain' });
    saveBindAttempt(policy.terms.policyId, { state: 'submitted', hash: bindHash });
    expect(readBindAttempt(policy.terms.policyId)).toEqual({ state: 'submitted', hash: bindHash });
    clearBindAttempt(policy.terms.policyId);
    expect(readBindAttempt(policy.terms.policyId)).toBeNull();
  });

  it('caps delegated quotes by exposure, policy limit and remaining premium', () => {
    const authority = examples.delegation.responseProjection;
    expect(authority.enforcement).toBe('backend-only');
    expect(authority.validity).toBe('active');
    expect(
      eligibleLimits(['1000000', '10000000'], '10000000', {
        ...authority,
        limitCapMicros: '10000000',
      } as Parameters<typeof eligibleLimits>[2]),
    ).toEqual(['1000000']);
  });

  it('requires a fresh canonical policy link before an effective-window presentation', () => {
    expect(policyPhase(policy, lifecycle, now)).toBe('effective');
    expect(
      policyPhase({ ...policy, terms: { ...policy.terms, effectiveAt: now + 1 } }, lifecycle, now),
    ).toBe('scheduled');
    const indexedPolicy = { ...policy, bindTx: bindHash };
    expect(policyPhase(indexedPolicy, { ...lifecycle, checkedAt: now - 301 }, now)).toBe(
      'reconciling',
    );
    expect(
      policyPhase(
        indexedPolicy,
        {
          ...lifecycle,
          state: 'reconciliation_pending',
          completeness: 'ORPHANED',
          claimsEligible: false,
        },
        now,
      ),
    ).toBe('reconciling');
  });

  it('renders a canonical receipt but gives a coherent reorg payload no confirmed-payment display', () => {
    const paid = parseClaimCaseDetailPayload(detail(examples.confirmedPayment.responseProjection));
    const reorg = parseClaimCaseDetailPayload(detail(examples.reorgedPayment.responseProjection));
    expect(paid && presentSettlement(paid).label).toBe('Payment confirmed');
    expect(reorg?.case.status).toBe('SETTLEMENT_PENDING');
    expect(reorg?.confirmedSettlementReceipt).toBeUndefined();
    expect(reorg && presentSettlement(reorg).label).not.toBe('Payment confirmed');
    const rows = parseClaimsCaseListPayload({
      cases: [
        {
          ...caseFields,
          ...examples.reorgedPayment.responseProjection.case,
          confirmedSettlementReceipt: null,
        },
      ],
    });
    expect(rows?.[0]?.status).toBe('SETTLEMENT_PENDING');
    expect(rows?.[0]?.confirmedSettlementReceipt).toBeUndefined();
  });

  it('keeps review blockers and evidence expiry data and distinguishes auth failure', async () => {
    const verification = examples.verification.responseProjection.verification;
    const parsed = parseClaimCaseDetailPayload({
      ...detail(examples.humanApproval.responseProjection),
      verifications: [verification],
      verificationStates: { [verification.id]: 'stale' },
      reviewReadiness: { verificationId: null, blocker: 'STALE_VERIFICATION_CONTEXT' },
    });
    expect(parsed?.verifications).toEqual([verification]);
    expect(parsed?.verificationStates[verification.id]).toBe('stale');
    expect(parsed?.reviewReadiness?.verificationId).toBeNull();
    expect(Date.parse(examples.prepareSettlement.responseProjection.signBefore)).toBe(
      verification.validUntilMs,
    );
    expect(examples.prepareSettlement.responseProjection).not.toHaveProperty('preparedTransaction');
    expect(
      examples.oneTimeSigningAuthorization.responseProjection.preparedTransaction,
    ).not.toHaveProperty('data');
    const failure = await readClaimsClientResponse(
      new Response(JSON.stringify({ error: 'Sign in' }), { status: 401 }),
      parseClaimCaseDetailPayload,
    );
    expect(failure).toMatchObject({ ok: false, kind: 'unauthorized' });
  });
});

describe('merge gates', () => {
  it('dashboard uses a settlement projection exported by frozen v1 or no payout projection', () => {
    const dashboard = readFileSync(
      join(process.env.ARCUEX_COMPAT_SNAPSHOT!, 'apps/web/src/app/api/dashboard/route.ts'),
      'utf8',
    );
    const backend = readFileSync(new URL('./frozen-projection.txt', import.meta.url), 'utf8');
    expect(backend).toMatch(/export async function projectSettlementFinality\b/);
    expect(
      /\bconfirmedClaimReceipt\b/.test(dashboard),
      'Dashboard references the receipt helper removed by v1',
    ).toBe(false);
  });

  it('claim list preserves reorged finality after parsing', () => {
    const v = examples.reorgedPayment.responseProjection;
    const parsed = parseClaimsCaseListPayload({
      cases: [
        {
          ...caseFields,
          ...v.case,
          paymentFinality: v.paymentFinality,
          confirmedSettlementReceipt: null,
        },
      ],
    });
    expect(parsed?.[0]).toHaveProperty('paymentFinality', 'reorged');
  });

  it('claim detail preserves reorged finality after parsing', () => {
    const parsed = parseClaimCaseDetailPayload(detail(examples.reorgedPayment.responseProjection));
    expect(parsed).toHaveProperty('paymentFinality', 'reorged');
  });

  it('claim detail discards a stale hash when the response explicitly says unverified', () => {
    const parsed = parseClaimCaseDetailPayload({
      ...detail(examples.confirmedPayment.responseProjection),
      paymentFinality: 'unverified',
    });
    expect(parsed?.confirmedSettlementReceipt).toBeUndefined();
  });

  it('policy timeline refuses to complete a reorged settlement carrying a stale reference', () => {
    const settlement = {
      caseId: examples.reorgedPayment.responseProjection.case.id,
      state: 'SETTLEMENT_PENDING',
      paymentFinality: 'reorged' as const,
      receiptRef: bindHash,
      explorerUrl: null,
    };
    const events = policyTimeline({
      policy,
      lifecycle: { ...lifecycle, settlements: [settlement] },
      phase: 'effective',
      approvals: [],
      nowSeconds: now,
    });
    expect(events.find((event) => event.id === `settlement-${settlement.caseId}`)).toMatchObject({
      state: 'current',
    });
    expect(
      events.find((event) => event.id === `settlement-${settlement.caseId}`)?.hash,
    ).toBeFalsy();
  });

  it('keeps ready rehearsal policies out of live in-force totals', () => {
    expect(portfolioState('fixture').category).not.toBe('in_force');
  });
});
