import { describe, expect, it } from 'vitest';
import { PROCUREMENT_PRODUCT, type ProcurementTerms } from '@arcuex/domain';
import { prepareBindPolicy, toPolicyIdBytes32 } from '@arcuex/onchain';
import { procurementDigest } from './procurement';

// Public synthetic V1 terms/transaction from the existing testnet baseline.
// These goldens must never be updated just to accommodate a platform refactor.
const terms: ProcurementTerms = {
  version: 1,
  policyId: 'cc5fcf8f-d09c-4db9-8520-76d276c2358b',
  quoteId: '8e8309a8-4e2f-4e63-8e0a-25d2a15e3f10',
  productCode: 'ARC_ORACLE_LIQUIDATION_DEMO_V1',
  agentId: '143fc0e6-f1b1-4642-9762-38a336bc2c0e',
  owner: '0x2e2da4311ea87cfa31c372d59b4a0d567c15d760',
  beneficiary: '0x2e2da4311ea87cfa31c372d59b4a0d567c15d760',
  exposure: {
    chainId: 5042002,
    protocol: 'arcuex-synthetic-lending-v1',
    position: 'demo_position-01',
    notionalMicros: '100000000',
  },
  eligibility: {
    positionHealthy: true,
    noKnownIncident: true,
    syntheticOnly: true,
    ownerAttestsControl: true,
  },
  premiumMicros: '10000',
  limitMicros: '1000000',
  deductibleMicros: '100000',
  effectiveAt: 1795025480,
  expiresAt: 1795111880,
  quoteExpiresAt: 1795025180,
  insuredEvent: PROCUREMENT_PRODUCT.event,
  exclusions: [...PROCUREMENT_PRODUCT.exclusions],
  synthetic: true,
};
const digest = '0xf45654d128f93105dd78a07ef39760f5e4f06ee59f099d267b2f10b5fe5d3add';
const policyId = '0xb14dc8320d5cfb14c379443b1905d1abe277d4827f29b3f4f36f9d71b5b9d638';

describe('platform foundation preserves issued V1 financial identities', () => {
  it('retains the exact historical terms digest and on-chain entity mapping', () => {
    expect(procurementDigest(terms)).toBe(digest);
    expect(toPolicyIdBytes32(terms.policyId)).toBe(policyId);
  });
  it('retains the exact previously authorized bind calldata without sending it', () => {
    const prepared = prepareBindPolicy({
      pool: '0x6657974EEdF488380251bDD95A7FFfb0D456E49E',
      account: terms.owner as `0x${string}`,
      policyId,
      termsHash: digest,
      beneficiary: terms.beneficiary as `0x${string}`,
      premium: 10000n,
      limit: 1000000n,
      coverageStart: 1795025480n,
      coverageEnd: 1795111880n,
    });
    expect(prepared.data).toBe(
      '0x48fb51efb14dc8320d5cfb14c379443b1905d1abe277d4827f29b3f4f36f9d71b5b9d638f45654d128f93105dd78a07ef39760f5e4f06ee59f099d267b2f10b5fe5d3add0000000000000000000000002e2da4311ea87cfa31c372d59b4a0d567c15d760000000000000000000000000000000000000000000000000000000000000271000000000000000000000000000000000000000000000000000000000000f4240000000000000000000000000000000000000000000000000000000006afdea48000000000000000000000000000000000000000000000000000000006aff3bc8',
    );
  });
});
