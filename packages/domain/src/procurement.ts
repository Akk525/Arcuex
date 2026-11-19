/** Public beta product. Amounts are decimal integer USDC micros on the wire. */
export const PROCUREMENT_PRODUCT = {
  code: 'ARC_ORACLE_LIQUIDATION_DEMO_V1',
  version: 1,
  name: 'Oracle adapter liquidation',
  protocol: 'arcuex-synthetic-lending-v1',
  synthetic: true,
  event:
    'Synthetic oracle adapter understates collateral value and causes liquidation of a lending position that remains healthy under the canonical ratio replay.',
  exclusions: [
    'Pre-existing or known liquidation',
    'Market price movements or ordinary insolvency',
    'Owner or agent misconduct',
    'Non-registered positions or protocols',
    'Non-synthetic evidence; no external loss oracle is integrated',
  ],
  pricing:
    'Testnet demo schedule: premium = limit / 100; deductible = limit / 10. Not risk pricing.',
  limitations:
    'Testnet demonstration, not legal insurance. Eligibility, ownership attestations, quote expiry, delegation and event evaluation are backend controls. The pool commits a hash without interpreting these terms. A compromised EOA can bypass backend permissions. Claims require the designated claims authority; no AI vote authorizes payment.',
} as const;

export const INDEPENDENT_LIQUIDATION_PRODUCT = {
  code: 'ARC_ORACLE_LIQUIDATION_INDEPENDENT_V1',
  version: 1,
  name: 'Independently verified oracle liquidation',
  protocol: 'arc-reviewed-liquidation-v1',
  synthetic: false,
  event:
    'A registered USDC position was liquidated below its threshold using the adapter ratio and would remain healthy with the independently replayed canonical ratio.',
  exclusions: [
    'Pre-existing or known liquidation',
    'Ordinary insolvency, market movement or misconduct',
    'Unregistered positions, other assets and unsupported protocol deployments',
    'Unverified causation, unreconciled recoveries, and losses already claimed for this event',
  ],
  pricing:
    'Restricted testnet pilot: limit 1 USDC, premium 0.01 USDC, deductible 0.10 USDC, 7 days.',
  limitations:
    'Requires separately approved Arc protocol, independent replay and recovery authorities. Testnet pilot only.',
} as const;
export const PROCUREMENT_OFFERINGS = [
  {
    ...PROCUREMENT_PRODUCT,
    limitsMicros: ['1000000', '10000000', '50000000', '100000000'],
    durationsDays: [1, 7, 30],
    purchaseAuthority: 'owner_or_delegated_agent',
  },
  {
    ...INDEPENDENT_LIQUIDATION_PRODUCT,
    limitsMicros: ['1000000'],
    durationsDays: [7],
    purchaseAuthority: 'owner',
  },
] as const;
export type ProcurementOffering = (typeof PROCUREMENT_OFFERINGS)[number];
export type ProcurementCatalog = {
  products: ProcurementOffering[];
  chainId: 5042002;
  pool: string;
  paymentMode: 'fixture_offline' | 'arc_testnet_preflight_required';
};
export type ProcurementCapacity = {
  status: 'verified' | 'unavailable' | 'offline';
  availableMicros: string | null;
  checkedAt: string | null;
};
export const INDEPENDENT_LIQUIDATION_VERIFIER = 'arc-oracle-liquidation-independent-v1';
export type IndependentLiquidationProfile = {
  verifier: typeof INDEPENDENT_LIQUIDATION_VERIFIER;
  emitter: `0x${string}`;
  runtimeCodeHash: `0x${string}`;
  replayPublicKey: string;
  recoveryPublicKey: string;
};

export function isIndependentLiquidationProfile(
  value: unknown,
): value is IndependentLiquidationProfile {
  if (!value || typeof value !== 'object') return false;
  const p = value as Partial<IndependentLiquidationProfile>;
  return (
    p.verifier === INDEPENDENT_LIQUIDATION_VERIFIER &&
    typeof p.emitter === 'string' &&
    /^0x[0-9a-f]{40}$/.test(p.emitter) &&
    !/^0x0{40}$/.test(p.emitter) &&
    typeof p.runtimeCodeHash === 'string' &&
    /^0x[0-9a-f]{64}$/.test(p.runtimeCodeHash) &&
    !/^0x0{64}$/.test(p.runtimeCodeHash) &&
    typeof p.replayPublicKey === 'string' &&
    /^[0-9a-f]{64}$/.test(p.replayPublicKey) &&
    !/^0{64}$/.test(p.replayPublicKey) &&
    typeof p.recoveryPublicKey === 'string' &&
    /^[0-9a-f]{64}$/.test(p.recoveryPublicKey) &&
    !/^0{64}$/.test(p.recoveryPublicKey) &&
    p.replayPublicKey !== p.recoveryPublicKey
  );
}
export function sameIndependentLiquidationProfile(a: unknown, b: unknown): boolean {
  return (
    isIndependentLiquidationProfile(a) &&
    isIndependentLiquidationProfile(b) &&
    a.emitter === b.emitter &&
    a.runtimeCodeHash === b.runtimeCodeHash &&
    a.replayPublicKey === b.replayPublicKey &&
    a.recoveryPublicKey === b.recoveryPublicKey
  );
}

export type ProcurementAgent = {
  id: string;
  owner: string;
  signer: string;
  label: string;
  exposure: { chainId: 5042002; protocol: string; position: string; notionalMicros: string };
};
export type ProcurementTerms = {
  version: 1;
  policyId: string;
  quoteId: string;
  productCode: string;
  agentId: string;
  owner: string;
  beneficiary: string;
  exposure: ProcurementAgent['exposure'];
  eligibility: {
    positionHealthy: true;
    noKnownIncident: true;
    syntheticOnly: boolean;
    ownerAttestsControl: true;
  };
  premiumMicros: string;
  limitMicros: string;
  deductibleMicros: string;
  effectiveAt: number;
  expiresAt: number;
  quoteExpiresAt: number;
  insuredEvent: string;
  exclusions: readonly string[];
  synthetic: boolean;
  independentProfile?: IndependentLiquidationProfile;
};
export function isSupportedIndependentTerms(t: ProcurementTerms): boolean {
  return (
    t.version === 1 &&
    t.synthetic === false &&
    t.productCode === INDEPENDENT_LIQUIDATION_PRODUCT.code &&
    t.exposure.chainId === 5042002 &&
    t.exposure.protocol === INDEPENDENT_LIQUIDATION_PRODUCT.protocol &&
    /^0x[0-9a-f]{64}$/.test(t.exposure.position) &&
    t.owner === t.beneficiary &&
    t.eligibility.syntheticOnly === false &&
    t.eligibility.positionHealthy === true &&
    t.eligibility.noKnownIncident === true &&
    t.eligibility.ownerAttestsControl === true &&
    t.insuredEvent === INDEPENDENT_LIQUIDATION_PRODUCT.event &&
    JSON.stringify(t.exclusions) === JSON.stringify(INDEPENDENT_LIQUIDATION_PRODUCT.exclusions) &&
    t.premiumMicros === '10000' &&
    t.limitMicros === '1000000' &&
    t.deductibleMicros === '100000' &&
    t.expiresAt - t.effectiveAt === 7 * 86400 &&
    t.effectiveAt - t.quoteExpiresAt === 300 &&
    isIndependentLiquidationProfile(t.independentProfile)
  );
}
export type ProcurementQuote = { terms: ProcurementTerms; digest: `0x${string}` };
export type ProcurementDelegation = {
  id: string;
  owner: string;
  agentId: string;
  productCode: string;
  position: string;
  beneficiary: string;
  premiumCapMicros: string;
  limitCapMicros: string;
  expiresAt: number;
};
export type ProcurementPolicy = ProcurementQuote & {
  state: 'prepared' | 'confirmed';
  payer: string;
  delegationId: string | null;
  bindTx: string | null;
  confirmedAt: number | null;
};

export type ProcurementDelegationView = ProcurementDelegation & {
  revoked: boolean;
  validity: 'active' | 'expired' | 'revoked' | 'unavailable';
  limitation: 'missing_scope' | 'scope_mismatch' | 'budget_exhausted' | null;
  checkedAt: number;
  revokedAt: number | null;
  remainingPremiumMicros: string;
};
