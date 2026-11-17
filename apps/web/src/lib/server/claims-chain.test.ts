import { describe, it, expect } from 'vitest';
import type { ClaimsCase } from '@arcuex/insurance';
import { toPolicyIdBytes32, toClaimIdBytes32 } from '@arcuex/onchain';
import { assertSettlementEvent } from './claims-chain';
const c = {
  id: '11111111-1111-4111-8111-111111111111',
  policyId: '22222222-2222-4222-8222-222222222222',
  claimId: null,
  lossKey: `0x${'ab'.repeat(32)}`,
  payableMicros: 900000n,
  lossCapMicros: 1000000n,
  payoutTo: '0x1111111111111111111111111111111111111111',
} as ClaimsCase;
const args = {
  policyId: toPolicyIdBytes32(c.policyId),
  claimId: toClaimIdBytes32(c.id),
  lossKey: c.lossKey,
  amount: c.payableMicros,
  lossCap: c.lossCapMicros,
  beneficiary: c.payoutTo,
};
describe('read-only settlement receipt binding', () => {
  it('accepts exactly the frozen policy/case/loss/beneficiary/value', () =>
    expect(() => assertSettlementEvent(c, args)).not.toThrow());
  it.each(['policyId', 'claimId', 'lossKey', 'amount', 'lossCap', 'beneficiary'])(
    'rejects a changed %s',
    (key) =>
      expect(() => assertSettlementEvent(c, { ...args, [key]: 'changed' })).toThrow(
        'frozen claim binding',
      ),
  );
});
