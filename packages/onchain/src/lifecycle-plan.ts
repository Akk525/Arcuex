import type { Address, Hex, PublicClient } from 'viem';
import { erc20Abi, formatUnits, isAddressEqual } from 'viem';
import { ARC_TESTNET_CHAIN_ID, ARC_USDC_ERC20_DECIMALS } from '@arcuex/chain';
import { buildSyntheticTerms, formatUsdc, parseUsdcDecimal } from '@arcuex/domain';
import { hashCoverageTerms, toPolicyIdBytes32 } from './ids';
import {
  prepareBindPolicy,
  prepareDeposit,
  prepareSettleClaim,
  prepareUsdcApprove,
  type PreparedTx,
} from './tx';
import { evaluateSyntheticLifecycleClaim, type SyntheticClaimEvaluation } from './synthetic-claim-fixture';
import type { TestnetAdapterSnapshot } from './testnet-adapter';
import { isClaimSettled, readOnchainPolicy } from './pool-reads';

export type LifecycleAmounts = {
  /** Default 5 USDC */
  lpDepositMicros: bigint;
  /** Default 2 USDC max benefit / limit */
  policyLimitMicros: bigint;
  /** Premium paid at bind (integer micros) */
  premiumMicros: bigint;
  /** Default 1 USDC settlement */
  payoutMicros: bigint;
  /** lossCap for the economic loss lot (default = payout) */
  lossCapMicros: bigint;
  coverageDays: number;
};

export const DEFAULT_LIFECYCLE_AMOUNTS: LifecycleAmounts = {
  lpDepositMicros: parseUsdcDecimal('5'),
  policyLimitMicros: parseUsdcDecimal('2'),
  premiumMicros: parseUsdcDecimal('0.1'),
  payoutMicros: parseUsdcDecimal('1'),
  lossCapMicros: parseUsdcDecimal('1'),
  coverageDays: 14,
};

export type LifecycleRoles = {
  lp: Address | null;
  policyholder: Address | null;
  claimsAuthority: Address;
  beneficiary: Address | null;
  feeRecipient: Address;
};

export type PlannedStep = {
  id:
    | 'lp_approve'
    | 'lp_deposit'
    | 'policyholder_approve'
    | 'bind_policy'
    | 'synthetic_evaluate'
    | 'settle_claim';
  role: 'lp' | 'policyholder' | 'claimsAuthority' | 'offchain';
  description: string;
  prepared?: PreparedTx;
  requiresLiveConfirm: boolean;
  blockers: string[];
};

export type LifecyclePlan = {
  mode: 'dry-run' | 'live';
  amounts: LifecycleAmounts;
  roles: LifecycleRoles;
  policyEntityId: string;
  policyId: Hex;
  termsHash: Hex;
  coverageStart: bigint;
  coverageEnd: bigint;
  claim: SyntheticClaimEvaluation;
  steps: PlannedStep[];
  blockers: string[];
  readyForLive: boolean;
};

export type RoleKeyPresence = {
  lpKey: boolean;
  policyholderKey: boolean;
  claimsAuthorityKey: boolean;
  /** Explicit opt-in to reuse deployer as LP (never implicit). */
  lpUseDeployer: boolean;
  policyholderUseDeployer: boolean;
};

function redact(addr: Address | null | undefined): string {
  if (!addr) return '(unset)';
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

async function readUsdcBalance(
  client: PublicClient,
  usdc: Address,
  account: Address,
): Promise<bigint> {
  return client.readContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account],
  });
}

async function readAllowance(
  client: PublicClient,
  usdc: Address,
  owner: Address,
  spender: Address,
): Promise<bigint> {
  return client.readContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'allowance',
    args: [owner, spender],
  });
}

async function readNativeBalance(client: PublicClient, account: Address): Promise<bigint> {
  return client.getBalance({ address: account });
}

/**
 * Build a deterministic Arc Testnet lifecycle plan. Dry-run safe: no broadcasts.
 */
export async function buildLifecyclePlan(input: {
  client: PublicClient;
  adapter: TestnetAdapterSnapshot;
  roles: LifecycleRoles;
  keys: RoleKeyPresence;
  amounts?: Partial<LifecycleAmounts>;
  policyEntityId?: string;
  claimEntityId?: string;
  mode?: 'dry-run' | 'live';
}): Promise<LifecyclePlan> {
  const amounts: LifecycleAmounts = { ...DEFAULT_LIFECYCLE_AMOUNTS, ...input.amounts };
  const mode = input.mode ?? 'dry-run';
  const blockers: string[] = [...input.adapter.mismatches];

  if (input.adapter.chainId !== ARC_TESTNET_CHAIN_ID) {
    blockers.push(`wrong chain ${input.adapter.chainId}`);
  }
  if (amounts.payoutMicros > amounts.policyLimitMicros) {
    blockers.push('payout exceeds policy limit');
  }
  if (amounts.payoutMicros > amounts.lossCapMicros) {
    blockers.push('payout exceeds lossCap');
  }
  if (amounts.lpDepositMicros < amounts.policyLimitMicros) {
    blockers.push('LP deposit must cover full-collateral policy limit');
  }

  if (!input.roles.lp) blockers.push('LP address unset');
  if (!input.roles.policyholder) blockers.push('policyholder address unset');
  if (!input.roles.beneficiary) blockers.push('beneficiary address unset');

  const lpKeyOk = input.keys.lpKey || input.keys.lpUseDeployer;
  const phKeyOk = input.keys.policyholderKey || input.keys.policyholderUseDeployer;
  if (!lpKeyOk) {
    blockers.push('LP signer missing (set LP_PRIVATE_KEY or LIFECYCLE_LP_USE_DEPLOYER=1)');
  }
  if (!phKeyOk) {
    blockers.push(
      'policyholder signer missing (set POLICYHOLDER_PRIVATE_KEY or LIFECYCLE_POLICYHOLDER_USE_DEPLOYER=1)',
    );
  }
  if (!input.keys.claimsAuthorityKey) {
    blockers.push(
      'CLAIMS_AUTHORITY_PRIVATE_KEY unset — cannot settle (authority ≠ deployer; no auto key gen)',
    );
  }

  const policyEntityId =
    input.policyEntityId ?? `testnet-lifecycle-${input.adapter.manifest.verifiedAt.slice(0, 10)}`;
  const claimEntityId = input.claimEntityId ?? `${policyEntityId}-claim-1`;

  const now = BigInt(Math.floor(Date.now() / 1000));
  const coverageStart = now;
  const coverageEnd = now + BigInt(amounts.coverageDays * 24 * 60 * 60);

  const terms = buildSyntheticTerms({
    limitUsdc: formatUsdc(amounts.policyLimitMicros),
    premiumUsdc: formatUsdc(amounts.premiumMicros),
    coverageStartsAt: new Date(Number(coverageStart) * 1000).toISOString(),
    coverageEndsAt: new Date(Number(coverageEnd) * 1000).toISOString(),
  });
  const policyId = toPolicyIdBytes32(policyEntityId);
  const termsHash = hashCoverageTerms(terms);

  // Placeholder only for dry-run planning when beneficiary unset — never a live payout target.
  const beneficiary =
    input.roles.beneficiary ??
    ('0x0000000000000000000000000000000000000001' as Address);

  const claim = evaluateSyntheticLifecycleClaim({
    chainId: ARC_TESTNET_CHAIN_ID,
    policyEntityId,
    claimEntityId,
    exposureId: `${policyEntityId}:exposure`,
    incidentId: `${policyEntityId}:incident`,
    lossLotId: `${policyEntityId}:lot-1`,
    insuredAgent: input.roles.policyholder ?? 'unset',
    beneficiary,
    requestedPayoutMicros: amounts.payoutMicros,
    lossCapMicros: amounts.lossCapMicros,
    observedEventRef: 'synthetic:oracle-liq:testnet-lifecycle-1',
  });
  if (!claim.evaluation.verified) {
    blockers.push(`synthetic evaluation rejected: ${claim.evaluation.reason}`);
  }

  const pool = input.adapter.pool;
  const usdc = input.adapter.usdc;
  const steps: PlannedStep[] = [];

  // Balances / gas checks
  if (input.roles.lp) {
    const [bal, native, allowance] = await Promise.all([
      readUsdcBalance(input.client, usdc, input.roles.lp),
      readNativeBalance(input.client, input.roles.lp),
      readAllowance(input.client, usdc, input.roles.lp, pool),
    ]);
    const lpBlockers: string[] = [];
    if (bal < amounts.lpDepositMicros) {
      lpBlockers.push(
        `LP USDC ${formatUnits(bal, ARC_USDC_ERC20_DECIMALS)} < deposit ${formatUnits(amounts.lpDepositMicros, ARC_USDC_ERC20_DECIMALS)}`,
      );
    }
    if (native === 0n) lpBlockers.push('LP native balance is 0 (need gas)');
    blockers.push(...lpBlockers);

    steps.push({
      id: 'lp_approve',
      role: 'lp',
      description: `LP approve ${formatUnits(amounts.lpDepositMicros, 6)} USDC to pool (current allowance ${formatUnits(allowance, 6)})`,
      prepared: input.roles.lp
        ? prepareUsdcApprove({
            usdc,
            spender: pool,
            amount: amounts.lpDepositMicros,
            account: input.roles.lp,
          })
        : undefined,
      requiresLiveConfirm: true,
      blockers: lpBlockers,
    });
    steps.push({
      id: 'lp_deposit',
      role: 'lp',
      description: `LP deposit ${formatUnits(amounts.lpDepositMicros, 6)} USDC`,
      prepared: input.roles.lp
        ? prepareDeposit({ pool, amount: amounts.lpDepositMicros, account: input.roles.lp })
        : undefined,
      requiresLiveConfirm: true,
      blockers: lpBlockers,
    });
  }

  if (input.roles.policyholder && input.roles.beneficiary) {
    const [bal, native] = await Promise.all([
      readUsdcBalance(input.client, usdc, input.roles.policyholder),
      readNativeBalance(input.client, input.roles.policyholder),
    ]);
    const phBlockers: string[] = [];
    if (bal < amounts.premiumMicros) {
      phBlockers.push(
        `policyholder USDC ${formatUnits(bal, 6)} < premium ${formatUnits(amounts.premiumMicros, 6)}`,
      );
    }
    if (native === 0n) phBlockers.push('policyholder native balance is 0 (need gas)');

    const availableAfterDeposit =
      input.adapter.poolSnapshot.availableCapital + amounts.lpDepositMicros;
    // After deposit, available ≈ current available + deposit (approx for empty pool)
    if (amounts.policyLimitMicros > availableAfterDeposit && input.adapter.poolSnapshot.totalAssets === 0n) {
      // empty pool: after 5 USDC deposit, available = 5; limit 2 OK
    } else if (
      input.adapter.poolSnapshot.totalAssets > 0n &&
      amounts.policyLimitMicros > input.adapter.poolSnapshot.availableCapital + amounts.lpDepositMicros
    ) {
      phBlockers.push('policy limit may exceed available capital after planned deposit');
    }

    const existing = await readOnchainPolicy(input.client, pool, policyId);
    if (existing.bound) {
      phBlockers.push(`policyId already bound on-chain (${policyEntityId})`);
    }
    blockers.push(...phBlockers);

    steps.push({
      id: 'policyholder_approve',
      role: 'policyholder',
      description: `Policyholder approve premium ${formatUnits(amounts.premiumMicros, 6)} USDC`,
      prepared: prepareUsdcApprove({
        usdc,
        spender: pool,
        amount: amounts.premiumMicros,
        account: input.roles.policyholder,
      }),
      requiresLiveConfirm: true,
      blockers: phBlockers,
    });
    steps.push({
      id: 'bind_policy',
      role: 'policyholder',
      description: `Bind policy limit=${formatUnits(amounts.policyLimitMicros, 6)} premium=${formatUnits(amounts.premiumMicros, 6)} beneficiary=${redact(input.roles.beneficiary)}`,
      prepared: prepareBindPolicy({
        pool,
        account: input.roles.policyholder,
        policyId,
        termsHash,
        beneficiary: input.roles.beneficiary,
        premium: amounts.premiumMicros,
        limit: amounts.policyLimitMicros,
        coverageStart,
        coverageEnd,
      }),
      requiresLiveConfirm: true,
      blockers: phBlockers,
    });
  }

  steps.push({
    id: 'synthetic_evaluate',
    role: 'offchain',
    description: `${claim.label} → outcome=${claim.evaluation.outcome}`,
    requiresLiveConfirm: false,
    blockers: claim.evaluation.verified ? [] : [claim.evaluation.reason],
  });

  const auth = input.adapter.claimsAuthority;
  const authNative = await readNativeBalance(input.client, auth);
  const settleBlockers: string[] = [];
  if (!isAddressEqual(auth, input.roles.claimsAuthority)) {
    settleBlockers.push('plan claimsAuthority ≠ on-chain claimsAuthority');
  }
  if (authNative === 0n) {
    settleBlockers.push(
      'claimsAuthority native balance is 0 — cannot pay gas for settleClaim (do not auto-fund)',
    );
  }
  if (!input.keys.claimsAuthorityKey) {
    settleBlockers.push('CLAIMS_AUTHORITY_PRIVATE_KEY unset');
  }
  if (await isClaimSettled(input.client, pool, claim.claimId)) {
    settleBlockers.push('claimId already settled (anti-replay)');
  }
  blockers.push(...settleBlockers);

  steps.push({
    id: 'settle_claim',
    role: 'claimsAuthority',
    description: `Authority settle ${formatUnits(amounts.payoutMicros, 6)} USDC to beneficiary (lossKey bound; evidence does not authorize)`,
    prepared: prepareSettleClaim({
      pool,
      account: auth,
      policyId: claim.policyId,
      claimId: claim.claimId,
      lossKey: claim.lossKey,
      amount: amounts.payoutMicros,
      lossCap: amounts.lossCapMicros,
      payoutTo: beneficiary,
    }),
    requiresLiveConfirm: true,
    blockers: settleBlockers,
  });

  const uniqueBlockers = [...new Set(blockers)];
  return {
    mode,
    amounts,
    roles: input.roles,
    policyEntityId,
    policyId,
    termsHash,
    coverageStart,
    coverageEnd,
    claim,
    steps,
    blockers: uniqueBlockers,
    readyForLive: uniqueBlockers.length === 0 && mode === 'live',
  };
}

export function formatLifecyclePlanReport(plan: LifecyclePlan, adapter: TestnetAdapterSnapshot): string {
  const lines: string[] = [];
  lines.push('=== Arcuex Arc Testnet lifecycle plan ===');
  lines.push(`mode: ${plan.mode} (default dry-run; live requires explicit confirm)`);
  lines.push(`chainId: ${adapter.chainId}`);
  lines.push(`pool: ${adapter.pool}`);
  lines.push(`usdc: ${adapter.usdc} decimals=${adapter.usdcDecimals}`);
  lines.push(`bytecodeBytes: ${adapter.bytecodeBytes}`);
  lines.push(`claimsAuthority: ${redact(adapter.claimsAuthority)}`);
  lines.push(`feeRecipient: ${redact(adapter.feeRecipient)}`);
  lines.push(
    `pool state: assets=${adapter.poolSnapshot.totalAssets} reserved=${adapter.poolSnapshot.totalReserved} shares=${adapter.poolSnapshot.totalShares}`,
  );
  lines.push('--- amounts (USDC micros / display) ---');
  lines.push(
    `LP deposit: ${plan.amounts.lpDepositMicros} (${formatUnits(plan.amounts.lpDepositMicros, 6)})`,
  );
  lines.push(
    `policy limit: ${plan.amounts.policyLimitMicros} (${formatUnits(plan.amounts.policyLimitMicros, 6)})`,
  );
  lines.push(
    `premium: ${plan.amounts.premiumMicros} (${formatUnits(plan.amounts.premiumMicros, 6)})`,
  );
  lines.push(
    `payout / lossCap: ${plan.amounts.payoutMicros} / ${plan.amounts.lossCapMicros}`,
  );
  lines.push('--- roles ---');
  lines.push(`LP: ${redact(plan.roles.lp)}`);
  lines.push(`policyholder: ${redact(plan.roles.policyholder)}`);
  lines.push(`claimsAuthority: ${redact(plan.roles.claimsAuthority)}`);
  lines.push(`beneficiary: ${redact(plan.roles.beneficiary)}`);
  lines.push('--- synthetic claim (off-chain) ---');
  lines.push(plan.claim.label);
  lines.push(`evaluation: ${plan.claim.evaluation.outcome} — ${plan.claim.evaluation.reason}`);
  lines.push(`settlementAuthorizedByEvidence: ${plan.claim.settlementAuthorizedByEvidence}`);
  lines.push('--- planned steps ---');
  for (const step of plan.steps) {
    const flag = step.blockers.length ? 'BLOCKED' : 'OK';
    lines.push(`[${flag}] ${step.id} (${step.role}): ${step.description}`);
    for (const b of step.blockers) lines.push(`    - ${b}`);
  }
  lines.push('--- blockers ---');
  if (plan.blockers.length === 0) lines.push('(none)');
  else plan.blockers.forEach((b) => lines.push(`- ${b}`));
  lines.push(`readyForLive: ${plan.readyForLive}`);
  return lines.join('\n');
}
