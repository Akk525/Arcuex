import { describe, expect, it } from 'vitest';
import type { PolicyLifecycle, ProcurementPolicy, ProcurementDelegationView } from '@arcuex/domain';
import { eligibleLimits, isWalletRejection, policyPhase, usdToMicros } from './presentation';

const hash = `0x${'ab'.repeat(32)}`;
const policy = {
  terms: { quoteExpiresAt: 20, effectiveAt: 30, expiresAt: 100 },
  bindTx: null,
} as ProcurementPolicy;
const lifecycle = {
  state: 'confirmed',
  source: { mode: 'arc-testnet', id: 'test' },
  completeness: 'VERIFIED_LINKED',
  checkedAt: 30,
  confirmation: { transactionHash: hash },
} as PolicyLifecycle;

describe('procurement presentation', () => {
  it('distinguishes accepted, submitted and uncertain binds even across quote expiry', () => {
    expect(policyPhase(policy, { ...lifecycle, state: 'prepared' }, 10)).toBe('prepared');
    expect(policyPhase(policy, null, 20)).toBe('expired');
    expect(policyPhase(policy, null, 22, 'submitted')).toBe('submitted');
    expect(policyPhase(policy, null, 22, 'uncertain')).toBe('uncertain');
    expect(policyPhase({ ...policy, bindTx: hash }, null, 22, 'submitted')).toBe('reconciling');
  });
  it('requires fresh canonical evidence and inception before an effective-window label', () => {
    const bound = { ...policy, bindTx: hash };
    expect(policyPhase(bound, { ...lifecycle, checkedAt: 25 }, 29)).toBe('scheduled');
    expect(policyPhase(bound, lifecycle, 30)).toBe('effective');
    expect(policyPhase(bound, lifecycle, 101)).toBe('expired');
    expect(policyPhase(bound, { ...lifecycle, state: 'expired' }, 101)).toBe('expired');
    expect(policyPhase(bound, { ...lifecycle, confirmation: null }, 30)).toBe('reconciling');
    expect(policyPhase(bound, lifecycle, 331)).toBe('reconciling');
    expect(
      policyPhase(bound, { ...lifecycle, source: { mode: 'fixture', id: 'fixture' } }, 30),
    ).toBe('unknown');
  });
  it('uses both the registered notional and the delegated caps', () => {
    const scope = {
      limitCapMicros: '10000000',
      remainingPremiumMicros: '50000',
    } as ProcurementDelegationView;
    const choices = ['1000000', '10000000', '50000000'];
    expect(eligibleLimits(choices, '100000000', scope)).toEqual(['1000000']);
    expect(eligibleLimits(choices, '900000', scope)).toEqual([]);
  });
  it('keeps wallet cancellation distinct from a missing wallet response', () => {
    expect(isWalletRejection({ cause: { code: 4001 } })).toBe(true);
    expect(isWalletRejection({ message: 'provider closed' })).toBe(false);
  });
  it('converts decimal USDC exactly without rounding', () => {
    expect(usdToMicros('1.000001')).toBe('1000001');
    expect(() => usdToMicros('0.0000009')).toThrow();
    expect(() => usdToMicros('0')).toThrow();
  });
});
