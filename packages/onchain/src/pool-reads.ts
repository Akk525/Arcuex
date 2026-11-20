import { type Address, type PublicClient, type Hex } from 'viem';
import { insurancePoolAbi } from './abi/insurance-pool';
import { OnchainError } from './errors';

export const ARC_CONFIRMATION_DEPTH = 2n;

export type OnchainPolicy = {
  termsHash: Hex;
  beneficiary: Address;
  premiumPayer: Address;
  limit: bigint;
  premium: bigint;
  coverageStart: bigint;
  coverageEnd: bigint;
  reserved: bigint;
  paidOut: bigint;
  bound: boolean;
  cancelled: boolean;
};

export type PoolSnapshot = {
  totalAssets: bigint;
  totalReserved: bigint;
  totalShares: bigint;
  availableCapital: bigint;
  usdcBalance: bigint;
  claimsAuthority: Address;
};

export function requirePoolAddress(address: Address | null | undefined): Address {
  if (!address) {
    throw new OnchainError('NOT_DEPLOYED', 'InsurancePool address is not configured');
  }
  return address;
}

export async function readPoolSnapshot(client: PublicClient, pool: Address): Promise<PoolSnapshot> {
  const [totalAssets, totalReserved, totalShares, availableCapital, claimsAuthority, usdc] =
    await Promise.all([
      client.readContract({ address: pool, abi: insurancePoolAbi, functionName: 'totalAssets' }),
      client.readContract({ address: pool, abi: insurancePoolAbi, functionName: 'totalReserved' }),
      client.readContract({ address: pool, abi: insurancePoolAbi, functionName: 'totalShares' }),
      client.readContract({
        address: pool,
        abi: insurancePoolAbi,
        functionName: 'availableCapital',
      }),
      client.readContract({
        address: pool,
        abi: insurancePoolAbi,
        functionName: 'claimsAuthority',
      }),
      client.readContract({ address: pool, abi: insurancePoolAbi, functionName: 'usdc' }),
    ]);

  const usdcBalance = await client.readContract({
    address: usdc,
    abi: [
      {
        type: 'function',
        name: 'balanceOf',
        stateMutability: 'view',
        inputs: [{ name: 'account', type: 'address' }],
        outputs: [{ type: 'uint256' }],
      },
    ] as const,
    functionName: 'balanceOf',
    args: [pool],
  });

  return {
    totalAssets,
    totalReserved,
    totalShares,
    availableCapital,
    usdcBalance,
    claimsAuthority,
  };
}

export async function readOnchainPolicy(
  client: PublicClient,
  pool: Address,
  policyId: Hex,
  blockNumber?: bigint,
): Promise<OnchainPolicy> {
  const row = await client.readContract({
    address: pool,
    abi: insurancePoolAbi,
    blockNumber,
    functionName: 'policies',
    args: [policyId],
  });

  return {
    termsHash: row[0],
    beneficiary: row[1],
    premiumPayer: row[2],
    limit: row[3],
    premium: row[4],
    coverageStart: row[5],
    coverageEnd: row[6],
    reserved: row[7],
    paidOut: row[8],
    bound: row[9],
    cancelled: row[10],
  };
}

export async function isClaimSettled(
  client: PublicClient,
  pool: Address,
  claimId: Hex,
  blockNumber?: bigint,
): Promise<boolean> {
  return client.readContract({
    address: pool,
    abi: insurancePoolAbi,
    blockNumber,
    functionName: 'settledClaims',
    args: [claimId],
  });
}

export type OnchainLossAccounting = {
  policyId: Hex;
  lossCap: bigint;
  paid: bigint;
  exists: boolean;
};

/** Read cumulative compensation for one economic loss lot. */
export async function readLossAccounting(
  client: PublicClient,
  pool: Address,
  lossKey: Hex,
  blockNumber?: bigint,
): Promise<OnchainLossAccounting> {
  const row = await client.readContract({
    address: pool,
    abi: insurancePoolAbi,
    blockNumber,
    functionName: 'losses',
    args: [lossKey],
  });
  return {
    policyId: row[0],
    lossCap: row[1],
    paid: row[2],
    exists: row[3],
  };
}
