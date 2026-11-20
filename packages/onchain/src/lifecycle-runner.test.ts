import { beforeEach, expect, it, vi } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { runTestnetLifecycle } from './lifecycle-runner';
import { connectArcTestnetAdapter } from './testnet-adapter';
import { sendPreparedTx } from './tx';
import type * as TxModule from './tx';
import { toPolicyIdBytes32 } from './ids';
import { OnchainError } from './errors';
vi.mock('./testnet-adapter', () => ({ connectArcTestnetAdapter: vi.fn() }));
vi.mock('./tx', async (original) => ({
  ...(await original<typeof TxModule>()),
  sendPreparedTx: vi.fn(),
}));
// Public, deterministic local test key; never funded or sent to an RPC.
const key = `0x${'0'.repeat(63)}1` as const;
const signer = privateKeyToAccount(key).address;
const pool = '0x0000000000000000000000000000000000000010';
const usdc = '0x0000000000000000000000000000000000000020';
const zero = `0x${'00'.repeat(32)}`;
const hash = `0x${'ab'.repeat(32)}` as const;
let bound: boolean;
let settled: boolean;
let balance: bigint;
let shares: bigint;
let allowance: bigint;
const snapshot = {
  totalAssets: 5_100_000n,
  totalReserved: 2_000_000n,
  totalShares: 5_100_000n,
  availableCapital: 3_100_000n,
  usdcBalance: 5_100_000n,
  claimsAuthority: signer,
};
beforeEach(() => {
  vi.clearAllMocks();
  bound = true;
  settled = false;
  balance = 10_000_000n;
  shares = 0n;
  allowance = 0n;
  const client = {
    getBalance: vi.fn(async () => 1n),
    getBlock: vi.fn(async () => ({ timestamp: 100n })),
    getTransactionReceipt: vi.fn(async () => ({ logs: [] })),
    readContract: vi.fn(
      async ({ functionName, args }: { functionName: string; args?: string[] }) => {
        switch (functionName) {
          case 'policies':
            return [
              zero,
              signer,
              signer,
              2_000_000n,
              100_000n,
              0n,
              9999999999n,
              2_000_000n,
              settled ? 1_000_000n : 0n,
              bound,
              false,
            ];
          case 'losses':
            return settled
              ? [toPolicyIdBytes32('testnet-lifecycle-2026-11-17'), 1_000_000n, 1_000_000n, true]
              : [zero, 0n, 0n, false];
          case 'settledClaims':
            return settled;
          case 'sharesOf':
            return shares;
          case 'allowance':
            return allowance;
          case 'balanceOf':
            return args?.[0] === pool ? 5_100_000n : balance;
          case 'usdc':
            return usdc;
          default:
            return snapshot[functionName as keyof typeof snapshot];
        }
      },
    ),
  };
  vi.mocked(connectArcTestnetAdapter).mockResolvedValue({
    client,
    snapshot: {
      chainId: 5042002,
      pool,
      usdc,
      claimsAuthority: signer,
      feeRecipient: signer,
      mismatches: [],
      poolSnapshot: snapshot,
      manifest: { verifiedAt: '2026-11-17' },
    },
  } as unknown as Awaited<ReturnType<typeof connectArcTestnetAdapter>>);
  vi.mocked(sendPreparedTx).mockImplementation(async (_client, _wallet, _prepared, onBroadcast) => {
    onBroadcast?.(hash);
    if (_prepared.description.includes('bindPolicy')) bound = true;
    if (_prepared.description.includes('settleClaim')) settled = true;
    return { hash, status: 'success', blockNumber: 1n, gasUsed: 1n };
  });
});
const env = {
  LP_PRIVATE_KEY: key,
  POLICYHOLDER_PRIVATE_KEY: key,
  CLAIMS_AUTHORITY_PRIVATE_KEY: key,
  BENEFICIARY_ADDRESS: signer,
};
it('blocks a live settlement even when the former authority credential is provided', async () => {
  balance = 0n;
  const result = await runTestnetLifecycle({
    mode: 'live',
    confirmStepIds: ['settle_claim'],
    env: { CLAIMS_AUTHORITY_PRIVATE_KEY: key },
  });
  expect(result.outcome).toBe('preflight_blocked');
  expect(result.plan.blockers.join(' ')).toContain('controlled external settlement authority');
  expect(sendPreparedTx).not.toHaveBeenCalled();
});
it('checks a later selected blocker before any earlier send', async () => {
  const result = await runTestnetLifecycle({
    mode: 'live',
    confirmStepIds: ['lp_approve', 'settle_claim'],
    env: { LP_PRIVATE_KEY: key },
  });
  expect(result.outcome).toBe('preflight_blocked');
  expect(sendPreparedTx).not.toHaveBeenCalled();
});
it('blocks unbound settlement before broadcast', async () => {
  bound = false;
  const result = await runTestnetLifecycle({ mode: 'live', confirmStepIds: ['settle_claim'], env });
  expect(result.outcome).toBe('preflight_blocked');
  expect(sendPreparedTx).not.toHaveBeenCalled();
});
it('rejects unknown confirmation ids before broadcast', async () => {
  const result = await runTestnetLifecycle({
    mode: 'live',
    confirmStepIds: ['settle_claim', 'typo' as 'settle_claim'],
    env,
  });
  expect(result.outcome).toBe('preflight_blocked');
  expect(sendPreparedTx).not.toHaveBeenCalled();
});
it('already settled and bound steps need no signers and send nothing', async () => {
  settled = true;
  const result = await runTestnetLifecycle({
    mode: 'live',
    confirmStepIds: ['policyholder_approve', 'bind_policy', 'settle_claim'],
    env: {},
  });
  expect(result.outcome).toBe('success');
  expect(sendPreparedTx).not.toHaveBeenCalled();
  expect(result.executions.every((e) => e.skipped)).toBe(true);
});
it('preflights and executes first run in order', async () => {
  bound = false;
  const result = await runTestnetLifecycle({
    mode: 'live',
    confirmStepIds: ['lp_approve', 'lp_deposit', 'policyholder_approve', 'bind_policy'],
    env,
  });
  expect(result.outcome).toBe('success');
  expect(sendPreparedTx).toHaveBeenCalledTimes(4);
  expect(result.executions.map((e) => e.stepId)).toEqual([
    'lp_approve',
    'lp_deposit',
    'policyholder_approve',
    'bind_policy',
  ]);
  expect(result.executions.every((e) => e.status === 'success')).toBe(true);
});
it('partially completed deposit and approval are skipped', async () => {
  bound = false;
  shares = 5_000_000n;
  allowance = 5_000_000n;
  const result = await runTestnetLifecycle({
    mode: 'live',
    confirmStepIds: ['lp_deposit', 'policyholder_approve', 'bind_policy'],
    env,
  });
  expect(result.outcome).toBe('success');
  expect(sendPreparedTx).toHaveBeenCalledTimes(1);
});
it.each(['TX_TIMEOUT', 'TX_REVERTED'] as const)(
  'retains broadcast hash on %s and stops subsequent sends',
  async (code) => {
    vi.mocked(sendPreparedTx).mockImplementationOnce(async (_c, _w, _p, onBroadcast) => {
      onBroadcast?.(hash);
      throw new OnchainError(code, 'test runtime failure');
    });
    const result = await runTestnetLifecycle({
      mode: 'live',
      confirmStepIds: ['lp_approve', 'lp_deposit'],
      env,
    });
    expect(result.outcome).toBe('runtime_failure');
    expect(sendPreparedTx).toHaveBeenCalledTimes(1);
    expect(result.executions[0]).toMatchObject({
      hash,
      status: code === 'TX_REVERTED' ? 'reverted' : 'pending_or_unknown',
    });
  },
);
it('blocks combined spending by a shared signer before broadcast', async () => {
  bound = false;
  balance = 5_000_000n;
  const result = await runTestnetLifecycle({
    mode: 'live',
    confirmStepIds: ['lp_approve', 'lp_deposit', 'policyholder_approve', 'bind_policy'],
    env,
  });
  expect(result.outcome).toBe('preflight_blocked');
  expect(sendPreparedTx).not.toHaveBeenCalled();
});

it('validates the actual authority signer before any selected send', async () => {
  const otherKey = `0x${'0'.repeat(63)}2`;
  const result = await runTestnetLifecycle({
    mode: 'live',
    confirmStepIds: ['lp_approve', 'settle_claim'],
    env: { ...env, CLAIMS_AUTHORITY_PRIVATE_KEY: otherKey },
  });
  expect(result.outcome).toBe('preflight_blocked');
  expect(sendPreparedTx).not.toHaveBeenCalled();
});

it('keeps successful transaction status when a later receipt read fails', async () => {
  const { client } = await connectArcTestnetAdapter();
  vi.mocked(client.getTransactionReceipt).mockRejectedValueOnce(new Error('RPC unavailable'));
  const result = await runTestnetLifecycle({ mode: 'live', confirmStepIds: ['lp_approve'], env });
  expect(result.outcome).toBe('runtime_failure');
  expect(result.executions[0]).toMatchObject({
    hash,
    status: 'success',
    tx: { hash, status: 'success' },
  });
});
