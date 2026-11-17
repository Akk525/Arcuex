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
    syntheticOnly: true;
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
  synthetic: true;
};
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
