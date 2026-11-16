import {
  type Address,
  type Chain,
  type Hex,
  type PublicClient,
  type Transport,
  createPublicClient,
  erc20Abi,
  formatUnits,
  http,
} from 'viem';
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_TESTNET_RPC_HTTP,
  ARC_USDC_ERC20_ADDRESS,
  ARC_USDC_ERC20_DECIMALS,
  arcTestnet,
  getArcTestnetConfig,
} from './config';

export type NetworkHealth = {
  ok: boolean;
  chainId: number;
  expectedChainId: number;
  blockNumber: bigint | null;
  rpcUrl: string;
  latencyMs: number;
  error?: string;
};

export type UsdcBalance = {
  /** Single display balance from the ERC-20 view (6 decimals). */
  formatted: string;
  value: bigint;
  decimals: typeof ARC_USDC_ERC20_DECIMALS;
  symbol: 'USDC';
};

export function createArcPublicClient(options?: {
  rpcUrl?: string;
  transport?: Transport;
  chain?: Chain;
}): PublicClient {
  const rpcUrl = options?.rpcUrl ?? ARC_TESTNET_RPC_HTTP;
  const chain = options?.chain ?? arcTestnet;
  const transport = options?.transport ?? http(rpcUrl, { timeout: 15_000 });

  return createPublicClient({
    chain,
    transport,
  });
}

export async function getChainId(client: PublicClient): Promise<number> {
  return Number(await client.getChainId());
}

export async function getLatestBlockNumber(client: PublicClient): Promise<bigint> {
  return client.getBlockNumber();
}

export async function getNetworkHealth(
  client: PublicClient,
  rpcUrl = ARC_TESTNET_RPC_HTTP,
): Promise<NetworkHealth> {
  const started = Date.now();
  try {
    const [chainId, blockNumber] = await Promise.all([
      getChainId(client),
      getLatestBlockNumber(client),
    ]);
    const latencyMs = Date.now() - started;
    const ok = chainId === ARC_TESTNET_CHAIN_ID;
    return {
      ok,
      chainId,
      expectedChainId: ARC_TESTNET_CHAIN_ID,
      blockNumber,
      rpcUrl,
      latencyMs,
      ...(ok
        ? {}
        : {
            error: `Unexpected chain ID ${chainId}; expected ${ARC_TESTNET_CHAIN_ID}`,
          }),
    };
  } catch (error) {
    return {
      ok: false,
      chainId: 0,
      expectedChainId: ARC_TESTNET_CHAIN_ID,
      blockNumber: null,
      rpcUrl,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : 'Unknown RPC error',
    };
  }
}

/**
 * Returns the ERC-20 USDC view only. Native balance is the same pool —
 * do not add or display separately.
 */
export async function getUsdcBalance(
  client: PublicClient,
  address: Address,
): Promise<UsdcBalance> {
  const value = await client.readContract({
    address: ARC_USDC_ERC20_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [address],
  });

  return {
    value,
    decimals: ARC_USDC_ERC20_DECIMALS,
    formatted: formatUnits(value, ARC_USDC_ERC20_DECIMALS),
    symbol: 'USDC',
  };
}

export async function getTransactionReceipt(client: PublicClient, hash: Hex) {
  return client.getTransactionReceipt({ hash });
}

export { getArcTestnetConfig, arcTestnet };
