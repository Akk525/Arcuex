import {
  type Address,
  type Account,
  type Chain,
  type PublicClient,
  type Transport,
  type WalletClient,
} from 'viem';
import type { Claim, CoverageTerms, Policy, Quote } from '@arcuex/domain';
import { newId } from '@arcuex/domain';
import {
  acceptAndBindPolicy,
  requestCoverageQuote,
  type CoverageRequest,
} from '@arcuex/insurance';
import {
  ARC_TESTNET_DEPLOYMENTS,
  ARC_USDC_ADDRESS,
  hashCoverageTerms,
  prepareBindPolicy,
  prepareUsdcApprove,
  readOnchainPolicy,
  requirePoolAddress,
  sendPreparedTx,
  toPolicyIdBytes32,
  type PreparedTx,
  type TxResult,
} from '@arcuex/onchain';
import type { InsuranceRepository } from '@arcuex/persistence';
import { assertActionAllowed, AGENT_PERMISSION_SCOPE, type AllowedAgentAction } from './permissions';

export type AgentSdkConfig = {
  repo: InsuranceRepository;
  publicClient: PublicClient;
  /** Optional wallet — required only when authorizing on-chain bind. Never pass a raw private key string into the SDK. */
  walletClient?: WalletClient<Transport, Chain | undefined, Account>;
  poolAddress?: Address | null;
  usdcAddress?: Address;
  chainId?: number;
};

export type InspectedQuote = {
  quote: Quote;
  terms: CoverageTerms;
  termsHash: `0x${string}`;
  synthetic: boolean;
  warnings: string[];
};

export type BindPreparation = {
  policy: Policy;
  policyIdBytes32: `0x${string}`;
  termsHash: `0x${string}`;
  actions: AllowedAgentAction[];
  prepared: PreparedTx[];
  permissionScope: typeof AGENT_PERMISSION_SCOPE;
};

/**
 * Autonomous-agent facade. Quote/bind orchestration stays synthetic until an
 * on-chain pool address is configured; signing is always external.
 */
export class ArcuexAgentClient {
  private readonly repo: InsuranceRepository;
  private readonly publicClient: PublicClient;
  private readonly walletClient?: WalletClient<Transport, Chain | undefined, Account>;
  private readonly poolAddress: Address | null;
  private readonly usdcAddress: Address;
  private readonly chainId: number;

  constructor(config: AgentSdkConfig) {
    this.repo = config.repo;
    this.publicClient = config.publicClient;
    this.walletClient = config.walletClient;
    this.poolAddress = config.poolAddress ?? ARC_TESTNET_DEPLOYMENTS.insurancePool;
    this.usdcAddress = config.usdcAddress ?? ARC_USDC_ADDRESS;
    this.chainId = config.chainId ?? ARC_TESTNET_DEPLOYMENTS.chainId;
  }

  requestQuote(request: CoverageRequest): Quote {
    return requestCoverageQuote(this.repo, request);
  }

  inspectQuote(quoteId: string): InspectedQuote {
    const quote = this.repo.getQuote(quoteId);
    if (!quote) throw new Error(`Quote not found: ${quoteId}`);
    const warnings: string[] = [];
    if (quote.terms.synthetic) {
      warnings.push('SYNTHETIC terms — not production insurance issuance');
    }
    if (quote.status === 'expired' || Date.parse(quote.expiresAt) <= Date.now()) {
      warnings.push('Quote is expired');
    }
    return {
      quote,
      terms: quote.terms,
      termsHash: hashCoverageTerms(quote.terms),
      synthetic: quote.terms.synthetic,
      warnings,
    };
  }

  acceptQuote(quoteId: string, fundingVerified: boolean, now = new Date()) {
    return acceptAndBindPolicy(this.repo, {
      quoteId,
      idempotencyKey: `accept:${quoteId}`,
      fundingVerified,
      now,
    });
  }

  /**
   * Prepare narrowly scoped approve + bindPolicy transactions.
   * Does not sign or broadcast. Does not accept private keys.
   */
  prepareBindAuthorization(policyId: string, account: Address): BindPreparation {
    const pool = requirePoolAddress(this.poolAddress);
    const policy = this.repo.getPolicy(policyId);
    if (!policy) throw new Error(`Policy not found: ${policyId}`);
    if (!policy.terms.synthetic) {
      throw new Error('Agent SDK currently only prepares synthetic demo policies');
    }

    const policyholder = this.repo.getPolicyholder(policy.policyholderId);
    const beneficiary = (policyholder?.walletAddress ?? account) as Address;
    const policyIdBytes32 = toPolicyIdBytes32(policy.id);
    const termsHash = hashCoverageTerms(policy.terms);
    const coverageStart = BigInt(Math.floor(Date.parse(policy.terms.coverageStartsAt) / 1000));
    const coverageEnd = BigInt(Math.floor(Date.parse(policy.terms.coverageEndsAt) / 1000));

    const actions: AllowedAgentAction[] = [
      {
        kind: 'usdc_approve',
        token: this.usdcAddress,
        spender: pool,
        amount: policy.terms.premiumMicros,
      },
      {
        kind: 'bind_policy',
        pool,
        policyId: policyIdBytes32,
        termsHash,
        beneficiary,
        premium: policy.terms.premiumMicros,
        limit: policy.terms.limitMicros,
        coverageStart,
        coverageEnd,
      },
    ];
    for (const action of actions) assertActionAllowed(action, pool, this.usdcAddress);

    const prepared: PreparedTx[] = [
      prepareUsdcApprove({
        usdc: this.usdcAddress,
        spender: pool,
        amount: policy.terms.premiumMicros,
        account,
      }),
      prepareBindPolicy({
        pool,
        account,
        policyId: policyIdBytes32,
        termsHash,
        beneficiary,
        premium: policy.terms.premiumMicros,
        limit: policy.terms.limitMicros,
        coverageStart,
        coverageEnd,
      }),
    ];

    this.repo.saveOnchainPolicyLink({
      policyEntityId: policy.id,
      policyIdBytes32,
      termsHash,
      poolAddress: pool,
      chainId: this.chainId,
    });

    return {
      policy,
      policyIdBytes32,
      termsHash,
      actions,
      prepared,
      permissionScope: AGENT_PERMISSION_SCOPE,
    };
  }

  /** Broadcast previously prepared txs via injected wallet client (user must approve). */
  async authorizePrepared(prepared: PreparedTx[]): Promise<TxResult[]> {
    if (!this.walletClient) {
      throw new Error('No walletClient configured — cannot authorize without external wallet');
    }
    const results: TxResult[] = [];
    for (const tx of prepared) {
      const idem = `agent-bind:${tx.description}:${tx.account}:${tx.data.slice(0, 18)}`;
      const marked = this.repo.upsertOnchainTransaction({
        id: newId(),
        purpose: tx.description,
        idempotencyKey: idem,
        status: 'submitted',
        fromAddress: tx.account,
        toAddress: tx.to,
        payload: { data: tx.data },
        nowIso: new Date().toISOString(),
      });
      if (!marked.inserted && marked.existingStatus === 'confirmed') {
        continue;
      }
      const result = await sendPreparedTx(this.publicClient, this.walletClient, tx);
      this.repo.updateOnchainTransaction(idem, {
        txHash: result.hash,
        status: 'confirmed',
        nowIso: new Date().toISOString(),
      });
      results.push(result);
    }
    return results;
  }

  async waitForActiveCoverage(policyEntityId: string, opts?: { timeoutMs?: number }) {
    const pool = requirePoolAddress(this.poolAddress);
    const link = this.repo.getOnchainPolicyLink(policyEntityId);
    if (!link) throw new Error('Missing on-chain policy link — call prepareBindAuthorization first');
    const deadline = Date.now() + (opts?.timeoutMs ?? 30_000);
    while (Date.now() < deadline) {
      const onchain = await readOnchainPolicy(
        this.publicClient,
        pool,
        link.policyIdBytes32 as `0x${string}`,
      );
      if (onchain.bound && !onchain.cancelled) {
        return onchain;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error('Timed out waiting for active on-chain coverage');
  }

  getPolicy(policyId: string): Policy | null {
    return this.repo.getPolicy(policyId);
  }

  getClaim(claimId: string): Claim | null {
    return this.repo.getClaim(claimId);
  }
}
