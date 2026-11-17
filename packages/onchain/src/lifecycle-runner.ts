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
import {
  connectArcTestnetAdapter,
  type TestnetAdapterSnapshot,
} from './testnet-adapter';
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
  skipped: boolean;
  reason?: string;
};

export type LifecycleRunnerResult = {
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
): { roles: LifecycleRoles; keys: RoleKeyPresence; deployer: Address | null; wallets: {
  lp: WalletClient | null;
  policyholder: WalletClient | null;
  claimsAuthority: WalletClient | null;
} } {
  const deployerPk = readPrivateKey(env, 'DEPLOYER_PRIVATE_KEY');
  const lpPk = readPrivateKey(env, 'LP_PRIVATE_KEY');
  const phPk = readPrivateKey(env, 'POLICYHOLDER_PRIVATE_KEY');
  const caPk = readPrivateKey(env, 'CLAIMS_AUTHORITY_PRIVATE_KEY');

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
    claimsAuthority: adapter.claimsAuthority,
    beneficiary: beneficiary ?? null,
    feeRecipient: adapter.feeRecipient,
  };

  // If ca wallet present, ensure it matches on-chain authority
  if (caWallet?.account) {
    const addr = (caWallet.account as Account).address;
    if (addr.toLowerCase() !== adapter.claimsAuthority.toLowerCase()) {
      throw new OnchainError(
        'VALIDATION',
        'CLAIMS_AUTHORITY_PRIVATE_KEY does not match on-chain claimsAuthority (addresses compared; key not printed)',
      );
    }
  }

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

  const { roles, keys, wallets } = resolveRoles(adapter, env, options.beneficiary);

  const plan = await buildLifecyclePlan({
    client,
    adapter,
    roles,
    keys,
    mode,
    policyEntityId: options.policyEntityId,
    claimEntityId: options.claimEntityId,
  });

  const report = formatLifecyclePlanReport(plan, adapter);
  const executions: LifecycleExecutionRecord[] = [];

  if (mode !== 'live') {
    return { adapter, plan, report, executions };
  }

  type Confirmable = NonNullable<LifecycleRunnerOptions['confirmStepIds']>[number];

  async function maybeSend(
    stepId: Confirmable | 'synthetic_evaluate',
    wallet: WalletClient | null,
  ): Promise<void> {
    if (stepId === 'synthetic_evaluate') return;
    if (!confirm.has(stepId)) {
      executions.push({
        stepId,
        skipped: true,
        reason: 'not in confirmStepIds — no broadcast',
      });
      return;
    }
    const step = plan.steps.find((s) => s.id === stepId);
    if (!step || step.blockers.length) {
      executions.push({
        stepId,
        skipped: true,
        reason: `blocked: ${step?.blockers.join('; ') ?? 'missing step'}`,
      });
      return;
    }
    if (!wallet?.account) {
      executions.push({ stepId, skipped: true, reason: 'signer wallet missing' });
      return;
    }
    if (!step.prepared) {
      executions.push({ stepId, skipped: true, reason: 'no prepared tx' });
      return;
    }
    const tx = await sendPreparedTx(client as PublicClient, wallet, step.prepared);
    const receipt = await client.getTransactionReceipt({ hash: tx.hash });
    const decoded = decodePoolLogs(receipt.logs);
    executions.push({
      stepId,
      skipped: false,
      tx,
      reason: decoded.map((d) => d.event.eventName).join(',') || 'no-pool-events',
    });
  }

  // Execute only confirmed steps in order; stop on failure.
  for (const step of plan.steps) {
    if (step.id === 'synthetic_evaluate') {
      executions.push({ stepId: step.id, skipped: false, reason: step.description });
      continue;
    }
    const wallet =
      step.role === 'lp'
        ? wallets.lp
        : step.role === 'policyholder'
          ? wallets.policyholder
          : step.role === 'claimsAuthority'
            ? wallets.claimsAuthority
            : null;
    await maybeSend(step.id as Confirmable | 'synthetic_evaluate', wallet);
    const last = executions[executions.length - 1];
    if (last && !last.skipped && step.id === 'settle_claim') {
      // anti double-settle: verify mapping
      const settled = await isClaimSettled(client, adapter.pool, plan.claim.claimId);
      if (!settled) {
        throw new OnchainError('TX_REVERTED', 'settle mined but settledClaims false');
      }
    }
  }

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
    adapter,
    plan,
    report,
    executions,
    reconciliation: { ok: mismatches.length === 0, mismatches, pool },
  };
}
