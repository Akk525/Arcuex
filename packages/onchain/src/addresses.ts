import { ARC_USDC_ERC20_ADDRESS } from '@arcuex/chain';
import { loadDeploymentManifest, defaultManifestPath } from './deployment-manifest';

/** Official Arc Testnet / Mainnet USDC ERC-20 (6 decimals). Verified docs.arc.io 2026-11-16. */
export const ARC_USDC_ADDRESS = ARC_USDC_ERC20_ADDRESS;

export type DeployedAddresses = {
  chainId: number;
  usdc: typeof ARC_USDC_ADDRESS;
  /** Null when no deployment manifest is available. */
  insurancePool: `0x${string}` | null;
  verifiedAt: string;
  manifestPath?: string;
};

/**
 * Prefer the checked-in deployment manifest over hardcoded pool addresses.
 * Falls back to null pool if the manifest file is absent (local/CI without deploy).
 */
export function loadArcTestnetDeployments(manifestPath?: string): DeployedAddresses {
  const path = manifestPath ?? defaultManifestPath();
  try {
    const m = loadDeploymentManifest(path);
    return {
      chainId: m.chainId,
      usdc: ARC_USDC_ADDRESS,
      insurancePool: m.insurancePool,
      verifiedAt: m.verifiedAt,
      manifestPath: path,
    };
  } catch {
    return {
      chainId: 5042002,
      usdc: ARC_USDC_ADDRESS,
      insurancePool: null,
      verifiedAt: 'undeployed',
      manifestPath: path,
    };
  }
}

/**
 * @deprecated Prefer `loadArcTestnetDeployments()` so addresses come from the
 * deployment manifest rather than a stale constant.
 */
export const ARC_TESTNET_DEPLOYMENTS: DeployedAddresses = loadArcTestnetDeployments();
