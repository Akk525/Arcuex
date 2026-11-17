import {
  type Address,
  type PublicClient,
  createPublicClient,
  erc20Abi,
  http,
  isAddressEqual,
} from 'viem';
import {
  ARC_TESTNET_CHAIN_ID,
  ARC_USDC_ERC20_ADDRESS,
  ARC_USDC_ERC20_DECIMALS,
  ARC_QUICKNODE_TESTNET_RPC_HTTP,
  arcTestnet,
} from '@arcuex/chain';
import { insurancePoolAbi } from './abi/insurance-pool';
import {
  loadDeploymentManifest,
  type DeploymentManifest,
  defaultManifestPath,
} from './deployment-manifest';
import { OnchainError } from './errors';
import { readPoolSnapshot } from './pool-reads';

export type TestnetAdapterConfig = {
  /** Absolute or cwd-relative path to deployment JSON. */
  manifestPath?: string;
  /** Override RPC (else env ARC_TESTNET_RPC_URL / QUICKNODE_RPC_URL / manifest.rpc). */
  rpcUrl?: string;
};

export type TestnetAdapterSnapshot = {
  manifest: DeploymentManifest;
  rpcUrl: string;
  chainId: number;
  pool: Address;
  usdc: Address;
  bytecodeNonEmpty: boolean;
  bytecodeBytes: number;
  onchainUsdc: Address;
  claimsAuthority: Address;
  feeRecipient: Address;
  usdcDecimals: number;
  usdcSymbol: string;
  poolSnapshot: Awaited<ReturnType<typeof readPoolSnapshot>>;
  mismatches: string[];
  ok: boolean;
};

function resolveRpcUrl(manifest: DeploymentManifest, override?: string): string {
  return (
    override ||
    process.env.ARC_TESTNET_RPC_URL ||
    process.env.QUICKNODE_RPC_URL ||
    manifest.rpc ||
    ARC_QUICKNODE_TESTNET_RPC_HTTP
  );
}

export function createArcTestnetPublicClient(rpcUrl: string): PublicClient {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(rpcUrl),
  });
}

/**
 * Read-only Arc Testnet adapter: validates manifest, chain, bytecode, and
 * cross-checks on-chain USDC against the deployment record.
 * Does not broadcast transactions.
 */
export async function connectArcTestnetAdapter(
  config: TestnetAdapterConfig = {},
): Promise<{ client: PublicClient; snapshot: TestnetAdapterSnapshot }> {
  const manifest = loadDeploymentManifest(config.manifestPath ?? defaultManifestPath());
  const rpcUrl = resolveRpcUrl(manifest, config.rpcUrl);
  const client = createArcTestnetPublicClient(rpcUrl);

  const chainId = await client.getChainId();
  if (chainId !== ARC_TESTNET_CHAIN_ID) {
    throw new OnchainError(
      'VALIDATION',
      `RPC chainId ${chainId} ≠ expected ${ARC_TESTNET_CHAIN_ID}`,
    );
  }

  const pool = manifest.insurancePool;
  const bytecode = await client.getCode({ address: pool });
  const bytecodeNonEmpty = Boolean(bytecode && bytecode !== '0x');
  const bytecodeBytes = bytecode && bytecode !== '0x' ? (bytecode.length - 2) / 2 : 0;
  if (!bytecodeNonEmpty) {
    throw new OnchainError('NOT_DEPLOYED', `No bytecode at pool ${pool}`);
  }

  const [onchainUsdc, claimsAuthority, feeRecipient, usdcDecimals, usdcSymbol, poolSnapshot] =
    await Promise.all([
      client.readContract({ address: pool, abi: insurancePoolAbi, functionName: 'usdc' }),
      client.readContract({
        address: pool,
        abi: insurancePoolAbi,
        functionName: 'claimsAuthority',
      }),
      client.readContract({
        address: pool,
        abi: insurancePoolAbi,
        functionName: 'feeRecipient',
      }),
      client.readContract({
        address: manifest.usdc,
        abi: erc20Abi,
        functionName: 'decimals',
      }),
      client.readContract({
        address: manifest.usdc,
        abi: erc20Abi,
        functionName: 'symbol',
      }),
      readPoolSnapshot(client, pool),
    ]);

  const mismatches: string[] = [];
  if (!isAddressEqual(onchainUsdc, manifest.usdc)) {
    mismatches.push(`pool.usdc ${onchainUsdc} ≠ manifest ${manifest.usdc}`);
  }
  if (!isAddressEqual(manifest.usdc, ARC_USDC_ERC20_ADDRESS)) {
    mismatches.push(`manifest.usdc ≠ official ${ARC_USDC_ERC20_ADDRESS}`);
  }
  if (Number(usdcDecimals) !== ARC_USDC_ERC20_DECIMALS) {
    mismatches.push(`USDC decimals ${usdcDecimals} ≠ ${ARC_USDC_ERC20_DECIMALS}`);
  }
  if (usdcSymbol !== 'USDC') {
    mismatches.push(`USDC symbol ${usdcSymbol} ≠ USDC`);
  }
  if (poolSnapshot.usdcBalance < poolSnapshot.totalAssets) {
    mismatches.push('pool USDC balance < tracked totalAssets');
  }
  if (poolSnapshot.totalAssets < poolSnapshot.totalReserved) {
    mismatches.push('underfunded: totalAssets < totalReserved');
  }

  const envPool = process.env.ARCUE_X_POOL_ADDRESS;
  if (envPool && !isAddressEqual(envPool as Address, pool)) {
    mismatches.push(`ARCUE_X_POOL_ADDRESS env ≠ manifest pool`);
  }
  const envAuthority = process.env.CLAIMS_AUTHORITY;
  if (envAuthority && !isAddressEqual(envAuthority as Address, claimsAuthority)) {
    mismatches.push('CLAIMS_AUTHORITY env ≠ on-chain claimsAuthority');
  }
  const envFee = process.env.FEE_RECIPIENT;
  if (envFee && !isAddressEqual(envFee as Address, feeRecipient)) {
    mismatches.push('FEE_RECIPIENT env ≠ on-chain feeRecipient');
  }

  const snapshot: TestnetAdapterSnapshot = {
    manifest,
    rpcUrl,
    chainId,
    pool,
    usdc: manifest.usdc,
    bytecodeNonEmpty,
    bytecodeBytes,
    onchainUsdc,
    claimsAuthority,
    feeRecipient,
    usdcDecimals: Number(usdcDecimals),
    usdcSymbol,
    poolSnapshot,
    mismatches,
    ok: mismatches.length === 0,
  };

  return { client, snapshot };
}
