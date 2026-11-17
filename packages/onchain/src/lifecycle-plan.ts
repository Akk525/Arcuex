import type { Address, Hex, PublicClient } from 'viem';
import { erc20Abi, formatUnits, isAddressEqual } from 'viem';
import { ARC_TESTNET_CHAIN_ID } from '@arcuex/chain';
import { buildSyntheticTerms, formatUsdc, parseUsdcDecimal } from '@arcuex/domain';
import { hashCoverageTerms, toPolicyIdBytes32 } from './ids';
import {
  prepareBindPolicy,
  prepareDeposit,
  prepareSettleClaim,
  prepareUsdcApprove,
  type PreparedTx,
} from './tx';
import {
  evaluateSyntheticLifecycleClaim,
  type SyntheticClaimEvaluation,
} from './synthetic-claim-fixture';
import type { TestnetAdapterSnapshot } from './testnet-adapter';
import { insurancePoolAbi } from './abi/insurance-pool';
import { isClaimSettled, readOnchainPolicy, readLossAccounting } from './pool-reads';

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
  selected: boolean;
  status: 'READY' | 'SATISFIED' | 'BLOCKED' | 'NOT_SELECTED';
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
  selectedStepIds?: string[];
  mode?: 'dry-run' | 'live';
}): Promise<LifecyclePlan> {
  const amounts: LifecycleAmounts = { ...DEFAULT_LIFECYCLE_AMOUNTS, ...input.amounts };
  const mode = input.mode ?? 'dry-run';
  const blockers: string[] = [...input.adapter.mismatches];

  if (input.adapter.chainId !== ARC_TESTNET_CHAIN_ID) {
    blockers.push(`wrong chain ${input.adapter.chainId}`);
  }
  const policyEntityId =
    input.policyEntityId ?? `testnet-lifecycle-${input.adapter.manifest.verifiedAt.slice(0, 10)}`;
  const claimEntityId = input.claimEntityId ?? `${policyEntityId}-claim-1`;

  const now = (await input.client.getBlock()).timestamp;
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
  const existing = await readOnchainPolicy(input.client, input.adapter.pool, policyId);
  const selected = new Set(
    input.selectedStepIds ?? [
      'lp_approve',
      'lp_deposit',
      'policyholder_approve',
      'bind_policy',
      'settle_claim',
    ],
  );
  const known = ['lp_approve', 'lp_deposit', 'policyholder_approve', 'bind_policy', 'settle_claim'];
  for (const id of selected) if (!known.includes(id)) blockers.push(`unknown selected step: ${id}`);

  // Placeholder only for dry-run planning when beneficiary unset — never a live payout target.
  const beneficiary =
    input.roles.beneficiary ??
    (existing.bound ? existing.beneficiary : null) ??
    ('0x0000000000000000000000000000000000000001' as Address);

  const claim = evaluateSyntheticLifecycleClaim({
    chainId: ARC_TESTNET_CHAIN_ID,
    policyEntityId,
    claimEntityId,
    exposureId: `${policyEntityId}:exposure`,
    incidentId: `${policyEntityId}:incident`,
    lossLotId: `${policyEntityId}:lot-1`,
    insuredAgent: existing.bound ? existing.premiumPayer : (input.roles.policyholder ?? 'unset'),
    beneficiary,
    requestedPayoutMicros: amounts.payoutMicros,
    lossCapMicros: amounts.lossCapMicros,
    observedEventRef: 'synthetic:oracle-liq:testnet-lifecycle-1',
  });

  const pool = input.adapter.pool;
  const usdc = input.adapter.usdc;
  const steps: PlannedStep[] = [];

  const add = (
    id: PlannedStep['id'],
    role: PlannedStep['role'],
    description: string,
    done: boolean,
    issues: string[],
    prepared?: PreparedTx,
  ) => {
    const active = selected.has(id);
    steps.push({
      id,
      role,
      description,
      prepared,
      selected: active,
      status: done ? 'SATISFIED' : !active ? 'NOT_SELECTED' : issues.length ? 'BLOCKED' : 'READY',
      requiresLiveConfirm: role !== 'offchain',
      blockers: active && !done ? issues : [],
    });
  };
  const signerIssues = async (address: Address | null, key: boolean, label: string) => {
    const issues: string[] = [];
    if (!address) issues.push(`${label} address unset`);
    if (!key) issues.push(`${label} signer missing`);
    if (address && (await readNativeBalance(input.client, address)) === 0n)
      issues.push(`${label} native balance is 0 (need gas)`);
    return issues;
  };
  // sharesOf is authoritative for this demo's one-deposit-per-LP guard. It is
  // not a deposit receipt: transferred/burned shares require operator review.
  const lp = input.roles.lp;
  const shares = lp
    ? await input.client.readContract({
        address: pool,
        abi: insurancePoolAbi,
        functionName: 'sharesOf',
        args: [lp],
      })
    : 0n;
  const deposited = shares > 0n;
  const lpAllowance = lp ? await readAllowance(input.client, usdc, lp, pool) : 0n;
  const lpIssues = await signerIssues(lp, input.keys.lpKey || input.keys.lpUseDeployer, 'LP');
  const depositIssues = [...lpIssues];
  if (lp && (await readUsdcBalance(input.client, usdc, lp)) < amounts.lpDepositMicros)
    depositIssues.push('LP USDC balance below deposit');
  if (amounts.lpDepositMicros <= 0n) depositIssues.push('deposit must be positive');
  if (lpAllowance < amounts.lpDepositMicros && !selected.has('lp_approve'))
    depositIssues.push('deposit requires allowance or selected lp_approve');
  add(
    'lp_approve',
    'lp',
    'Approve LP deposit',
    deposited || lpAllowance >= amounts.lpDepositMicros,
    lpIssues,
    lp
      ? prepareUsdcApprove({ usdc, spender: pool, amount: amounts.lpDepositMicros, account: lp })
      : undefined,
  );
  add(
    'lp_deposit',
    'lp',
    'Deposit LP capital (existing shares satisfy demo deposit)',
    deposited,
    depositIssues,
    lp ? prepareDeposit({ pool, amount: amounts.lpDepositMicros, account: lp }) : undefined,
  );

  const ph = input.roles.policyholder;
  let phAllowance = ph ? await readAllowance(input.client, usdc, ph, pool) : 0n;
  // Approvals share one allowance when LP and policyholder reuse an account.
  // A selected deposit consumes that allowance before premium approval/bind.
  if (lp && ph && isAddressEqual(lp, ph)) {
    if (selected.has('lp_approve') && !deposited && lpAllowance < amounts.lpDepositMicros)
      phAllowance = amounts.lpDepositMicros;
    if (selected.has('lp_deposit') && !deposited)
      phAllowance =
        phAllowance >= amounts.lpDepositMicros ? phAllowance - amounts.lpDepositMicros : 0n;
  }
  const phIssues = await signerIssues(
    ph,
    input.keys.policyholderKey || input.keys.policyholderUseDeployer,
    'policyholder',
  );
  const bindIssues = [...phIssues];
  if (!input.roles.beneficiary) bindIssues.push('beneficiary address unset');
  if (ph && (await readUsdcBalance(input.client, usdc, ph)) < amounts.premiumMicros)
    bindIssues.push('policyholder USDC balance below premium');
  if (phAllowance < amounts.premiumMicros && !selected.has('policyholder_approve'))
    bindIssues.push('bind requires allowance or selected policyholder_approve');
  const plannedDeposit = selected.has('lp_deposit') && !deposited ? amounts.lpDepositMicros : 0n;
  if (amounts.policyLimitMicros > input.adapter.poolSnapshot.availableCapital + plannedDeposit)
    bindIssues.push('policy limit exceeds available capital including selected deposit');
  if (
    amounts.policyLimitMicros <= 0n ||
    amounts.premiumMicros <= 0n ||
    coverageEnd <= coverageStart
  )
    bindIssues.push('invalid policy amounts or coverage window');
  add(
    'policyholder_approve',
    'policyholder',
    'Approve policy premium',
    existing.bound || phAllowance >= amounts.premiumMicros,
    phIssues,
    ph
      ? prepareUsdcApprove({ usdc, spender: pool, amount: amounts.premiumMicros, account: ph })
      : undefined,
  );
  add(
    'bind_policy',
    'policyholder',
    'Bind policy (bound policy satisfies prerequisite)',
    existing.bound,
    bindIssues,
    ph
      ? prepareBindPolicy({
          pool,
          account: ph,
          policyId,
          termsHash,
          beneficiary,
          premium: amounts.premiumMicros,
          limit: amounts.policyLimitMicros,
          coverageStart,
          coverageEnd,
        })
      : undefined,
  );
  add('synthetic_evaluate', 'offchain', claim.label, true, []);

  const settled = await isClaimSettled(input.client, pool, claim.claimId);
  const loss = await readLossAccounting(input.client, pool, claim.lossKey);
  const auth = input.adapter.claimsAuthority;
  const settleIssues = await signerIssues(auth, input.keys.claimsAuthorityKey, 'claimsAuthority');
  if (!isAddressEqual(auth, input.roles.claimsAuthority))
    settleIssues.push('claimsAuthority mismatch');
  if (!claim.evaluation.verified)
    settleIssues.push(`synthetic evaluation rejected: ${claim.evaluation.reason}`);
  if (!existing.bound && !selected.has('bind_policy'))
    settleIssues.push('settlement requires bound policy or selected bind_policy');
  if (amounts.payoutMicros <= 0n || amounts.lossCapMicros <= 0n)
    settleIssues.push('payout/lossCap must be positive');
  if (amounts.payoutMicros > amounts.lossCapMicros) settleIssues.push('payout exceeds lossCap');
  const chainNow = now;
  if (existing.bound) {
    if (existing.cancelled) settleIssues.push('policy cancelled');
    if (!isAddressEqual(beneficiary, existing.beneficiary))
      settleIssues.push('beneficiary differs from bound policy');
    if (chainNow < existing.coverageStart || chainNow > existing.coverageEnd)
      settleIssues.push('outside policy coverage window');
    if (
      amounts.payoutMicros > existing.limit - existing.paidOut ||
      amounts.payoutMicros > existing.reserved
    )
      settleIssues.push('payout exceeds remaining policy limit/reservation');
  } else if (amounts.payoutMicros > amounts.policyLimitMicros)
    settleIssues.push('payout exceeds policy limit');
  if (loss.exists) {
    if (loss.policyId !== policyId) settleIssues.push('lossKey belongs to different policy');
    if (loss.lossCap !== amounts.lossCapMicros)
      settleIssues.push('lossCap differs from immutable onchain cap');
    if (loss.paid + amounts.payoutMicros > loss.lossCap)
      settleIssues.push('lossKey cap exhausted or insufficient');
  }
  add(
    'settle_claim',
    'claimsAuthority',
    'Authority settle synthetic claim',
    settled,
    settleIssues,
    prepareSettleClaim({
      pool,
      account: auth,
      policyId: claim.policyId,
      claimId: claim.claimId,
      lossKey: claim.lossKey,
      amount: amounts.payoutMicros,
      lossCap: amounts.lossCapMicros,
      payoutTo: beneficiary,
    }),
  );
  // Combined spending matters when the demo reuses one signer for both roles.
  if (lp && ph && isAddressEqual(lp, ph)) {
    const spend =
      (selected.has('lp_deposit') && !deposited ? amounts.lpDepositMicros : 0n) +
      (selected.has('bind_policy') && !existing.bound ? amounts.premiumMicros : 0n);
    if (spend > (await readUsdcBalance(input.client, usdc, lp)))
      blockers.push('shared LP/policyholder balance below combined selected spending');
  }
  blockers.push(...steps.flatMap((step) => step.blockers));

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

export function formatLifecyclePlanReport(
  plan: LifecyclePlan,
  adapter: TestnetAdapterSnapshot,
): string {
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
  lines.push(`payout / lossCap: ${plan.amounts.payoutMicros} / ${plan.amounts.lossCapMicros}`);
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
    const flag = step.status;
    lines.push(`[${flag}] ${step.id} (${step.role}): ${step.description}`);
    for (const b of step.blockers) lines.push(`    - ${b}`);
  }
  lines.push('--- blockers ---');
  if (plan.blockers.length === 0) lines.push('(none)');
  else plan.blockers.forEach((b) => lines.push(`- ${b}`));
  lines.push(`readyForLive: ${plan.readyForLive}`);
  return lines.join('\n');
}
