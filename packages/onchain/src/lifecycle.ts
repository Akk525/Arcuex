import {
  type Account,
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
  erc20Abi,
  formatUnits,
} from 'viem';
import { ARC_MIN_MAX_FEE_PER_GAS, ARC_TESTNET_CHAIN_ID } from '@arcuex/chain';
import { OnchainError } from './errors';
import {
  prepareBindPolicy,
  prepareDeposit,
  prepareSettleClaim,
  prepareUsdcApprove,
  sendPreparedTx,
  type TxResult,
} from './tx';
import { readOnchainPolicy, readPoolSnapshot, requirePoolAddress } from './pool-reads';
import { isClaimSettled } from './pool-reads';

type AnyWallet = WalletClient<Transport, Chain | undefined, Account>;

export type LifecycleClients = {
  publicClient: PublicClient;
  walletClient: AnyWallet;
  pool: Address;
  usdc: Address;
};

async function assertArcTestnet(publicClient: PublicClient): Promise<void> {
  const id = await publicClient.getChainId();
  if (id !== ARC_TESTNET_CHAIN_ID) {
    throw new OnchainError(
      'VALIDATION',
      `Wrong chain: connected to ${id}, expected Arc Testnet ${ARC_TESTNET_CHAIN_ID}`,
    );
  }
}

async function assertFunded(
  publicClient: PublicClient,
  usdc: Address,
  account: Address,
  needed: bigint,
): Promise<void> {
  const bal = await publicClient.readContract({
    address: usdc,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [account],
  });
  if (bal < needed) {
    throw new OnchainError(
      'VALIDATION',
      `Insufficient USDC: have ${formatUnits(bal, 6)}, need ${formatUnits(needed, 6)} (testnet)`,
    );
  }
}

export async function confirmTx(
  publicClient: PublicClient,
  hash: Hex,
  label: string,
): Promise<TxResult> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 });
  if (receipt.status !== 'success') {
    throw new OnchainError('TX_REVERTED', `${label} reverted after inclusion`, { cause: receipt });
  }
  return {
    hash,
    status: 'success',
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
  };
}

/** LP deposit with approve → deposit → confirm → pool snapshot. */
export async function executeLpDeposit(
  clients: LifecycleClients,
  amountMicros: bigint,
): Promise<{ approve: TxResult; deposit: TxResult; snapshot: Awaited<ReturnType<typeof readPoolSnapshot>> }> {
  const pool = requirePoolAddress(clients.pool);
  const account = clients.walletClient.account?.address;
  if (!account) throw new OnchainError('VALIDATION', 'Wallet has no account');

  await assertArcTestnet(clients.publicClient);
  await assertFunded(clients.publicClient, clients.usdc, account, amountMicros);

  const approveTx = prepareUsdcApprove({
    usdc: clients.usdc,
    spender: pool,
    amount: amountMicros,
    account,
  });
  const approve = await sendPreparedTx(clients.publicClient, clients.walletClient, approveTx);

  const depositTx = prepareDeposit({ pool, amount: amountMicros, account });
  const deposit = await sendPreparedTx(clients.publicClient, clients.walletClient, depositTx);
  const snapshot = await readPoolSnapshot(clients.publicClient, pool);
  return { approve, deposit, snapshot };
}

export async function executeBindPolicy(
  clients: LifecycleClients,
  input: {
    policyId: Hex;
    termsHash: Hex;
    beneficiary: Address;
    premium: bigint;
    limit: bigint;
    coverageStart: bigint;
    coverageEnd: bigint;
  },
): Promise<{ approve: TxResult; bind: TxResult; policy: Awaited<ReturnType<typeof readOnchainPolicy>> }> {
  const pool = requirePoolAddress(clients.pool);
  const account = clients.walletClient.account?.address;
  if (!account) throw new OnchainError('VALIDATION', 'Wallet has no account');

  await assertArcTestnet(clients.publicClient);
  await assertFunded(clients.publicClient, clients.usdc, account, input.premium);

  const snap = await readPoolSnapshot(clients.publicClient, pool);
  if (snap.availableCapital < input.limit) {
    throw new OnchainError(
      'VALIDATION',
      `Underfunded pool: available ${snap.availableCapital} < limit ${input.limit}`,
    );
  }

  const approve = await sendPreparedTx(
    clients.publicClient,
    clients.walletClient,
    prepareUsdcApprove({
      usdc: clients.usdc,
      spender: pool,
      amount: input.premium,
      account,
    }),
  );
  const bind = await sendPreparedTx(
    clients.publicClient,
    clients.walletClient,
    prepareBindPolicy({ pool, account, ...input }),
  );
  const policy = await readOnchainPolicy(clients.publicClient, pool, input.policyId);
  if (!policy.bound) {
    throw new OnchainError('TX_REVERTED', 'Bind tx succeeded but policy not bound on-chain');
  }
  return { approve, bind, policy };
}

export async function executeSettleClaim(
  clients: LifecycleClients,
  input: {
    policyId: Hex;
    claimId: Hex;
    lossKey: Hex;
    amount: bigint;
    lossCap: bigint;
    payoutTo: Address;
  },
): Promise<{ settle: TxResult; settled: boolean }> {
  const pool = requirePoolAddress(clients.pool);
  const account = clients.walletClient.account?.address;
  if (!account) throw new OnchainError('VALIDATION', 'Wallet has no account');

  await assertArcTestnet(clients.publicClient);

  if (input.lossKey === ('0x' + '00'.repeat(32))) {
    throw new OnchainError('VALIDATION', 'lossKey must be non-zero');
  }
  if (input.lossCap === 0n || input.amount === 0n) {
    throw new OnchainError('VALIDATION', 'amount and lossCap must be > 0');
  }
  if (input.amount > input.lossCap) {
    throw new OnchainError('VALIDATION', 'amount exceeds lossCap');
  }

  if (await isClaimSettled(clients.publicClient, pool, input.claimId)) {
    throw new OnchainError('VALIDATION', 'Claim already settled (anti-replay)');
  }

  const settle = await sendPreparedTx(
    clients.publicClient,
    clients.walletClient,
    prepareSettleClaim({ pool, account, ...input }),
  );
  const settled = await isClaimSettled(clients.publicClient, pool, input.claimId);
  if (!settled) {
    throw new OnchainError('TX_REVERTED', 'Settle tx mined but claim not marked settled');
  }
  return { settle, settled };
}

/** Gas tip helper for Arc Testnet (20 gwei floor). */
export function arcFeeOverrides() {
  return {
    maxFeePerGas: ARC_MIN_MAX_FEE_PER_GAS,
    maxPriorityFeePerGas: ARC_MIN_MAX_FEE_PER_GAS,
  };
}
