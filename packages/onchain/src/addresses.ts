import { ARC_USDC_ERC20_ADDRESS } from '@arcuex/chain';

/** Official Arc Testnet / Mainnet USDC ERC-20 (6 decimals). Verified docs.arc.io 2026-11-16. */
export const ARC_USDC_ADDRESS = ARC_USDC_ERC20_ADDRESS;

export type DeployedAddresses = {
  chainId: number;
  usdc: typeof ARC_USDC_ADDRESS;
  insurancePool: `0x${string}` | null;
  verifiedAt: string;
};

/**
 * Deployment registry. Pool address is null until a testnet deploy is recorded.
 * Never invent mainnet issuance addresses.
 */
export const ARC_TESTNET_DEPLOYMENTS: DeployedAddresses = {
  chainId: 5042002,
  usdc: ARC_USDC_ADDRESS,
  insurancePool: null,
  verifiedAt: '2026-11-16',
};
