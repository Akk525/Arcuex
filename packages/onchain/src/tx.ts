import {
  type Account,
  type Address,
  type Chain,
  type Hash,
  type Hex,
  type PublicClient,
  type Transport,
  type WalletClient,
  encodeFunctionData,
  toFunctionSelector,
  erc20Abi,
} from 'viem';
import { ARC_MIN_MAX_FEE_PER_GAS } from '@arcuex/chain';
import { insurancePoolAbi } from './abi/insurance-pool';
import { OnchainError } from './errors';

export type TxResult = {
  hash: Hash;
  status: 'success' | 'reverted';
  blockNumber: bigint;
  gasUsed: bigint;
};

export type PreparedTx = {
  to: Address;
  data: Hex;
  account: Address;
  description: string;
};

type AnyWallet = WalletClient<Transport, Chain | undefined, Account | undefined>;

async function waitReceipt(client: PublicClient, hash: Hash): Promise<TxResult> {
  try {
    const receipt = await client.waitForTransactionReceipt({ hash, confirmations: 1 });
    return {
      hash,
      status: receipt.status === 'success' ? 'success' : 'reverted',
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed,
    };
  } catch (cause) {
    throw new OnchainError('TX_TIMEOUT', `Timed out waiting for ${hash}`, { cause });
  }
}

async function sendPrepared(
  publicClient: PublicClient,
  walletClient: AnyWallet,
  prepared: PreparedTx,
  onBroadcast?: (hash: Hash) => void,
): Promise<TxResult> {
  const account = walletClient.account;
  if (!account) {
    throw new OnchainError('VALIDATION', 'Wallet client has no account');
  }

  let hash: Hash;
  try {
    hash = await walletClient.sendTransaction({
      account,
      chain: walletClient.chain,
      to: prepared.to,
      data: prepared.data,
      maxFeePerGas: ARC_MIN_MAX_FEE_PER_GAS,
      maxPriorityFeePerGas: ARC_MIN_MAX_FEE_PER_GAS,
    });
  } catch (cause) {
    throw new OnchainError('TX_REJECTED', `User/wallet rejected: ${prepared.description}`, {
      cause,
    });
  }

  onBroadcast?.(hash);
  const result = await waitReceipt(publicClient, hash);
  if (result.status === 'reverted') {
    throw new OnchainError('TX_REVERTED', `Transaction ${hash} reverted: ${prepared.description}`, {
      cause: result,
    });
  }
  return result;
}

export function prepareUsdcApprove(params: {
  usdc: Address;
  spender: Address;
  amount: bigint;
  account: Address;
}): PreparedTx {
  return {
    to: params.usdc,
    account: params.account,
    description: 'USDC approve for InsurancePool',
    data: encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [params.spender, params.amount],
    }),
  };
}

export function prepareDeposit(params: {
  pool: Address;
  amount: bigint;
  account: Address;
}): PreparedTx {
  return {
    to: params.pool,
    account: params.account,
    description: 'InsurancePool.deposit',
    data: encodeFunctionData({
      abi: insurancePoolAbi,
      functionName: 'deposit',
      args: [params.amount],
    }),
  };
}

export function prepareBindPolicy(params: {
  pool: Address;
  account: Address;
  policyId: Hex;
  termsHash: Hex;
  beneficiary: Address;
  premium: bigint;
  limit: bigint;
  coverageStart: bigint;
  coverageEnd: bigint;
}): PreparedTx {
  return {
    to: params.pool,
    account: params.account,
    description: 'InsurancePool.bindPolicy',
    data: encodeFunctionData({
      abi: insurancePoolAbi,
      functionName: 'bindPolicy',
      args: [
        params.policyId,
        params.termsHash,
        params.beneficiary,
        params.premium,
        params.limit,
        params.coverageStart,
        params.coverageEnd,
      ],
    }),
  };
}

export function prepareSettleClaim(params: {
  pool: Address;
  account: Address;
  policyId: Hex;
  claimId: Hex;
  /** Canonical economic loss lot — distinct from claimId. */
  lossKey: Hex;
  amount: bigint;
  /** Immutable max for this lossKey (must match on first and subsequent partials). */
  lossCap: bigint;
  payoutTo: Address;
}): PreparedTx {
  return {
    to: params.pool,
    account: params.account,
    description: 'InsurancePool.settleClaim',
    data: encodeFunctionData({
      abi: insurancePoolAbi,
      functionName: 'settleClaim',
      args: [
        params.policyId,
        params.claimId,
        params.lossKey,
        params.amount,
        params.lossCap,
        params.payoutTo,
      ],
    }),
  };
}

export async function sendPreparedTx(
  publicClient: PublicClient,
  walletClient: AnyWallet,
  prepared: PreparedTx,
  onBroadcast?: (hash: Hash) => void,
): Promise<TxResult> {
  if (
    prepared.data.slice(0, 10).toLowerCase() ===
    toFunctionSelector(
      insurancePoolAbi.find((entry) => entry.type === 'function' && entry.name === 'settleClaim')!,
    )
  )
    throw new OnchainError(
      'VALIDATION',
      'Settlement submission belongs to the controlled external authority',
    );
  return sendPrepared(publicClient, walletClient, prepared, onBroadcast);
}
