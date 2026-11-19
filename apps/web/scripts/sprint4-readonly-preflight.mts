/** Public RPC reads only. Never loads wallet credentials or opens an application database. */
import { createPublicClient, http, erc20Abi, keccak256 } from 'viem';
import { arcTestnet, ARC_TESTNET_RPC_HTTP, ARC_USDC_ERC20_ADDRESS } from '@arcuex/chain';
import { insurancePoolAbi } from '@arcuex/onchain';
import manifest from '../../../docs/deployments/arc-testnet-insurance-pool.json';

const pool = manifest.insurancePool as `0x${string}`;
const client = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC_HTTP, { retryCount: 1, timeout: 15000 }),
});
try {
  const chainId = await client.getChainId();
  if (chainId !== 5042002) throw new Error('Chain mismatch');
  const block = await client.getBlock({ blockTag: 'latest' });
  const blockNumber = block.number;
  const code = await client.getCode({ address: pool, blockNumber });
  if (!code || code === '0x') throw new Error('Missing pool bytecode');
  const read = (
    functionName:
      | 'usdc'
      | 'owner'
      | 'claimsAuthority'
      | 'feeRecipient'
      | 'totalAssets'
      | 'totalReserved'
      | 'totalShares'
      | 'availableCapital',
  ) => client.readContract({ address: pool, abi: insurancePoolAbi, functionName, blockNumber });
  const [
    usdc,
    owner,
    claimsAuthority,
    feeRecipient,
    totalAssets,
    totalReserved,
    totalShares,
    availableCapital,
  ] = await Promise.all([
    read('usdc'),
    read('owner'),
    read('claimsAuthority'),
    read('feeRecipient'),
    read('totalAssets'),
    read('totalReserved'),
    read('totalShares'),
    read('availableCapital'),
  ]);
  if (String(usdc).toLowerCase() !== ARC_USDC_ERC20_ADDRESS.toLowerCase())
    throw new Error('Unexpected pool asset');
  const [balance, decimals] = await Promise.all([
    client.readContract({
      address: ARC_USDC_ERC20_ADDRESS,
      abi: erc20Abi,
      functionName: 'balanceOf',
      args: [pool],
      blockNumber,
    }),
    client.readContract({
      address: ARC_USDC_ERC20_ADDRESS,
      abi: erc20Abi,
      functionName: 'decimals',
      blockNumber,
    }),
    client.readContract({
      address: pool,
      abi: insurancePoolAbi,
      functionName: 'assertSolvent',
      blockNumber,
    }),
  ]);
  console.log(
    JSON.stringify(
      {
        verifiedAt: new Date().toISOString(),
        source: 'LIVE public Arc Testnet RPC; no fixtures',
        rpc: ARC_TESTNET_RPC_HTTP,
        chainId,
        pool,
        blockNumber,
        blockHash: block.hash,
        blockTimestamp: block.timestamp,
        bytecodeHash: keccak256(code),
        usdc,
        decimals,
        owner,
        claimsAuthority,
        feeRecipient,
        totalAssets,
        totalReserved,
        totalShares,
        availableCapital,
        usdcBalance: balance,
        controls: {
          assetMatchesManifest: true,
          sixDecimals: decimals === 6,
          solvent: BigInt(totalAssets) >= BigInt(totalReserved),
          balanceCoversAssets: balance >= BigInt(totalAssets),
          availableMatchesAccounting:
            BigInt(availableCapital) === BigInt(totalAssets) - BigInt(totalReserved),
          assertSolventReadSucceeded: true,
        },
        signerAccess: 'NOT INSPECTED; no keys loaded',
        policyDeadline: 'No fresh policy selected',
        broadcasts: 0,
      },
      (_, value) => (typeof value === 'bigint' ? value.toString() : value),
      2,
    ),
  );
} catch {
  console.error(
    'Read-only Arc preflight failed; no application data changed or transactions broadcast.',
  );
  process.exitCode = 1;
}
