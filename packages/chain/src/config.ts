import { defineChain, type Chain } from 'viem';

/** Official Arc Testnet chain ID (decimal). Verified against docs.arc.io. */
export const ARC_TESTNET_CHAIN_ID = 5042002;

/** Native USDC and ERC-20 USDC share one pool; ERC-20 is the display view. */
export const ARC_USDC_ERC20_ADDRESS =
  '0x3600000000000000000000000000000000000000' as const;

export const ARC_USDC_ERC20_DECIMALS = 6;
export const ARC_NATIVE_DECIMALS = 18;

/** Arc mempool minimum maxFeePerGas (wei). */
export const ARC_MIN_MAX_FEE_PER_GAS = 20_000_000_000n;

export const ARC_TESTNET_RPC_HTTP = 'https://rpc.testnet.arc.io';
export const ARC_TESTNET_RPC_WS = 'wss://rpc.testnet.arc.io';
export const ARC_TESTNET_EXPLORER = 'https://explorer.testnet.arc.io';
export const ARC_TESTNET_FAUCET = 'https://faucet.circle.com';

/** Public QuickNode-hosted Arc Testnet RPC (no API key required for this host). */
export const ARC_QUICKNODE_TESTNET_RPC_HTTP = 'https://rpc.quicknode.testnet.arc.io';

export const arcTestnet: Chain = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USDC',
    symbol: 'USDC',
    decimals: ARC_NATIVE_DECIMALS,
  },
  rpcUrls: {
    default: {
      http: [ARC_TESTNET_RPC_HTTP],
      webSocket: [ARC_TESTNET_RPC_WS],
    },
  },
  blockExplorers: {
    default: {
      name: 'Arc Explorer',
      url: ARC_TESTNET_EXPLORER,
    },
  },
  testnet: true,
});

export type ArcNetworkConfig = {
  chainId: typeof ARC_TESTNET_CHAIN_ID;
  name: string;
  rpcUrl: string;
  wsUrl: string;
  explorerUrl: string;
  faucetUrl: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  usdcErc20: {
    address: typeof ARC_USDC_ERC20_ADDRESS;
    decimals: typeof ARC_USDC_ERC20_DECIMALS;
  };
  minMaxFeePerGas: bigint;
};

export function getArcTestnetConfig(rpcUrl = ARC_TESTNET_RPC_HTTP): ArcNetworkConfig {
  return {
    chainId: ARC_TESTNET_CHAIN_ID,
    name: 'Arc Testnet',
    rpcUrl,
    wsUrl: ARC_TESTNET_RPC_WS,
    explorerUrl: ARC_TESTNET_EXPLORER,
    faucetUrl: ARC_TESTNET_FAUCET,
    nativeCurrency: {
      name: 'USDC',
      symbol: 'USDC',
      decimals: ARC_NATIVE_DECIMALS,
    },
    usdcErc20: {
      address: ARC_USDC_ERC20_ADDRESS,
      decimals: ARC_USDC_ERC20_DECIMALS,
    },
    minMaxFeePerGas: ARC_MIN_MAX_FEE_PER_GAS,
  };
}
