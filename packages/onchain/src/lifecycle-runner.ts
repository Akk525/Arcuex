import {
  type Account,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
  createWalletClient,
  http,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { arcTestnet } from '@arcuex/chain';
import { OnchainError } from './errors';
import {
  buildLifecyclePlan,
  formatLifecyclePlanReport,
  type LifecyclePlan,
  type LifecycleRoles,
  type RoleKeyPresence,
} from './lifecycle-plan';
import { sendPreparedTx, type TxResult } from './tx';
import { connectArcTestnetAdapter, type TestnetAdapterSnapshot } from './testnet-adapter';
import { decodePoolLogs } from './events';
import {
  isClaimSettled,
  readLossAccounting,
  readOnchainPolicy,
  readPoolSnapshot,
} from './pool-reads';

export type LifecycleRunnerOptions = {
  manifestPath?: string;
  rpcUrl?: string;
  /** dry-run (default) | live — live still requires confirmStepIds */
  mode?: 'dry-run' | 'live';
  /**
   * Explicit step ids to broadcast when mode=live.
   * Empty array means plan only even in live mode.
   */
  confirmStepIds?: Array<
    'lp_approve' | 'lp_deposit' | 'policyholder_approve' | 'bind_policy' | 'settle_claim'
  >;
  policyEntityId?: string;
  claimEntityId?: string;
  beneficiary?: Address;
  /** Load keys from env — never logged. */
  env?: NodeJS.ProcessEnv;
};

export type LifecycleExecutionRecord = {
  stepId: string;
  tx?: TxResult;
  hash?: Hex;
  status?: 'success' | 'reverted' | 'pending_or_unknown';
  skipped: boolean;
  reason?: string;
};

export type LifecycleRunnerResult = {
  outcome: 'preflight_blocked' | 'dry_run' | 'success' | 'runtime_failure';
  runtimeError?: string;
  adapter: TestnetAdapterSnapshot;
  plan: LifecyclePlan;
  report: string;
  executions: LifecycleExecutionRecord[];
  reconciliation?: {
    ok: boolean;
    mismatches: string[];
    pool: Awaited<ReturnType<typeof readPoolSnapshot>>;
  };
};

function redactPk(_value: string | undefined): void {
  // intentionally no-op — never print keys
}

function readPrivateKey(env: NodeJS.ProcessEnv, name: string): Hex | null {
  const raw = env[name]?.trim();
  if (!raw) return null;
  redactPk(raw);
  const normalized = (raw.startsWith('0x') ? raw : `0x${raw}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new OnchainError('VALIDATION', `${name} is not a 32-byte hex key (value not printed)`);
  }
  return normalized;
}

function walletFor(rpcUrl: string, pk: Hex): WalletClient {
  const account = privateKeyToAccount(pk);
  return createWalletClient({
    account,
    chain: arcTestnet,
    transport: http(rpcUrl),
  });
}

function resolveRoles(
  adapter: TestnetAdapterSnapshot,
  env: NodeJS.ProcessEnv,
  beneficiaryOverride?: Address,
  selected: Set<string> = new Set(),
): {
  roles: LifecycleRoles;
  keys: RoleKeyPresence;
  deployer: Address | null;
  wallets: {
    lp: WalletClient | null;
    policyholder: WalletClient | null;
    claimsAuthority: WalletClient | null;
  };
} {
  const needsDeployer =
    (env.LIFECYCLE_LP_USE_DEPLOYER === '1' &&
      (selected.has('lp_deposit') || selected.has('lp_approve'))) ||
    (env.LIFECYCLE_POLICYHOLDER_USE_DEPLOYER === '1' &&
      (selected.has('bind_policy') || selected.has('policyholder_approve'))) ||
    selected.has('bind_policy');
  const deployerPk = needsDeployer ? readPrivateKey(env, 'DEPLOYER_PRIVATE_KEY') : null;
  const lpPk =
    selected.has('lp_deposit') || selected.has('lp_approve')
      ? readPrivateKey(env, 'LP_PRIVATE_KEY')
      : null;
  const phPk =
    selected.has('bind_policy') || selected.has('policyholder_approve')
      ? readPrivateKey(env, 'POLICYHOLDER_PRIVATE_KEY')
      : null;
  const caPk = selected.has('settle_claim')
    ? readPrivateKey(env, 'CLAIMS_AUTHORITY_PRIVATE_KEY')
    : null;

  const lpUseDeployer = env.LIFECYCLE_LP_USE_DEPLOYER === '1';
  const policyholderUseDeployer = env.LIFECYCLE_POLICYHOLDER_USE_DEPLOYER === '1';

  const deployer = deployerPk ? privateKeyToAccount(deployerPk).address : null;

  const lpWalletPk = lpPk ?? (lpUseDeployer ? deployerPk : null);
  const phWalletPk = phPk ?? (policyholderUseDeployer ? deployerPk : null);

  const rpc = adapter.rpcUrl;
  const lpWallet = lpWalletPk ? walletFor(rpc, lpWalletPk) : null;
  const phWallet = phWalletPk ? walletFor(rpc, phWalletPk) : null;
  const caWallet = caPk ? walletFor(rpc, caPk) : null;

  const beneficiary =
    beneficiaryOverride ||
    (env.BENEFICIARY_ADDRESS as Address | undefined) ||
    (env.BENEFICIARY as Address | undefined) ||
    deployer;

  const roles: LifecycleRoles = {
    lp: (lpWallet?.account as Account | undefined)?.address ?? null,
    policyholder: (phWallet?.account as Account | undefined)?.address ?? null,
    claimsAuthority: (caWallet?.account as Account | undefined)?.address ?? adapter.claimsAuthority,
    beneficiary: beneficiary ?? null,
    feeRecipient: adapter.feeRecipient,
  };

  return {
    roles,
    keys: {
      lpKey: Boolean(lpPk),
      policyholderKey: Boolean(phPk),
      claimsAuthorityKey: Boolean(caPk),
      lpUseDeployer,
      policyholderUseDeployer,
    },
    deployer,
    wallets: {
      lp: lpWallet,
      policyholder: phWallet,
      claimsAuthority: caWallet,
    },
  };
}

/**
 * Arc Testnet lifecycle runner.
 * Default mode is dry-run (plan + preflight only). Live broadcasts require
 * mode=live AND an explicit confirmStepIds entry per transaction.
 */
export async function runTestnetLifecycle(
  options: LifecycleRunnerOptions = {},
): Promise<LifecycleRunnerResult> {
  const env = options.env ?? process.env;
  const mode = options.mode ?? 'dry-run';
  const confirm = new Set(options.confirmStepIds ?? []);

  const { client, snapshot: adapter } = await connectArcTestnetAdapter({
    manifestPath: options.manifestPath,
    rpcUrl: options.rpcUrl,
  });

  const { roles, keys, wallets } = resolveRoles(adapter, env, options.beneficiary, confirm);

  const plan = await buildLifecyclePlan({
    client,
    adapter,
    roles,
    keys,
    mode,
    selectedStepIds: [...confirm],
    policyEntityId: options.policyEntityId,
    claimEntityId: options.claimEntityId,
  });

  const report = formatLifecyclePlanReport(plan, adapter);
  const executions: LifecycleExecutionRecord[] = [];

  if (mode !== 'live') {
    return {
      outcome: plan.blockers.length ? 'preflight_blocked' : 'dry_run',
      adapter,
      plan,
      report,
      executions,
    };
  }

  const walletForStep = (role: string) =>
    role === 'lp'
      ? wallets.lp
      : role === 'policyholder'
        ? wallets.policyholder
        : role === 'claimsAuthority'
          ? wallets.claimsAuthority
          : null;
  // Complete authorization and preparation validation before the first send.
  for (const step of plan.steps.filter((s) => s.selected && s.status !== 'SATISFIED')) {
    const wallet = walletForStep(step.role);
    if (
      !wallet?.account ||
      !step.prepared ||
      (wallet.account as Account).address.toLowerCase() !== step.prepared.account.toLowerCase()
    ) {
      step.blockers.push('signer missing or does not match prepared account');
      step.status = 'BLOCKED';
      plan.blockers.push(`${step.id}: signer missing or does not match prepared account`);
    }
  }
  if (plan.blockers.length) {
    plan.readyForLive = false;
    return {
      outcome: 'preflight_blocked',
      adapter,
      plan,
      report: formatLifecyclePlanReport(plan, adapter),
      executions,
    };
  }
  for (const step of plan.steps.filter((s) => s.selected)) {
    if (step.status === 'SATISFIED') {
      executions.push({ stepId: step.id, skipped: true, reason: 'ALREADY_DONE / SATISFIED' });
      continue;
    }
    const record: LifecycleExecutionRecord = { stepId: step.id, skipped: false };
    executions.push(record);
    try {
      const tx = await sendPreparedTx(
        client as PublicClient,
        walletForStep(step.role)!,
        step.prepared!,
        (hash) => {
          record.hash = hash;
          record.status = 'pending_or_unknown';
        },
      );
      record.tx = tx;
      record.hash = tx.hash;
      record.status = tx.status;
      const receipt = await client.getTransactionReceipt({ hash: tx.hash });
      record.reason = decodePoolLogs(receipt.logs)
        .map((d) => d.event.eventName)
        .join(',');
      if (
        step.id === 'settle_claim' &&
        !(await isClaimSettled(client, adapter.pool, plan.claim.claimId))
      )
        throw new Error('settledClaims verification failed');
    } catch (error) {
      if (error instanceof OnchainError && error.code === 'TX_REVERTED') record.status = 'reverted';
      // Preserve every known hash even if receipt waiting / post-send reads fail.
      return {
        outcome: 'runtime_failure',
        runtimeError:
          'Execution or post-send verification failed; inspect recorded hashes before retrying.',
        adapter,
        plan,
        report,
        executions,
      };
    }
  }

  try {
    const pool = await readPoolSnapshot(client, adapter.pool);
    const mismatches: string[] = [];
    if (pool.usdcBalance < pool.totalAssets) mismatches.push('USDC < totalAssets');
    if (pool.totalAssets < pool.totalReserved) mismatches.push('underfunded');

    const settleDone = executions.some((e) => e.stepId === 'settle_claim' && !e.skipped && e.tx);
    if (settleDone) {
      const policy = await readOnchainPolicy(client, adapter.pool, plan.policyId);
      const loss = await readLossAccounting(client, adapter.pool, plan.claim.lossKey);
      if (!policy.bound) mismatches.push('policy not bound after lifecycle');
      if (policy.paidOut < plan.amounts.payoutMicros) {
        mismatches.push('policy.paidOut < planned payout');
      }
      if (!loss.exists || loss.paid < plan.amounts.payoutMicros) {
        mismatches.push('loss accounting missing or underpaid');
      }
    }

    return {
      outcome: mismatches.length ? 'runtime_failure' : 'success',
      adapter,
      plan,
      report,
      executions,
      reconciliation: { ok: mismatches.length === 0, mismatches, pool },
    };
  } catch {
    return {
      outcome: 'runtime_failure',
      runtimeError: 'Post-execution reconciliation failed; inspect recorded hashes.',
      adapter,
      plan,
      report,
      executions,
    };
  }
}
