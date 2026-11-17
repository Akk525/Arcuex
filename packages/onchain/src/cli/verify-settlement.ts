/** Read-only evidence capture. No wallet client, keys, or transaction submission. */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPublicClient, http, decodeEventLog, erc20Abi } from 'viem';
import { insurancePoolAbi } from '../abi/insurance-pool';
import { loadDeploymentManifest } from '../deployment-manifest';

async function main() {
  const root = resolve(process.cwd(), '../..');
  const manifest = loadDeploymentManifest(
    resolve(root, 'docs/deployments/arc-testnet-insurance-pool.json'),
  );
  const client = createPublicClient({ transport: http(manifest.rpc) });
  const hash = '0x83130e95f5dfb2209a5382524a1ef749dd2f90a605fcf892cf80b333ef3d89c7';
  const receipt = await client.getTransactionReceipt({ hash });
  const tx = await client.getTransaction({ hash });
  const events = receipt.logs
    .filter((l) => l.address.toLowerCase() === manifest.insurancePool.toLowerCase())
    .map((l) => decodeEventLog({ abi: insurancePoolAbi, data: l.data, topics: l.topics }));
  const event = events.find((e) => e.eventName === 'ClaimSettled');
  if (!event || event.eventName !== 'ClaimSettled') throw new Error('ClaimSettled missing');
  const { policyId, claimId, lossKey, beneficiary, amount } = event.args;
  const transfers = receipt.logs
    .filter((l) => l.address.toLowerCase() === manifest.usdc.toLowerCase())
    .flatMap((l) => {
      try {
        const e = decodeEventLog({ abi: erc20Abi, data: l.data, topics: l.topics });
        return e.eventName === 'Transfer' ? [e.args] : [];
      } catch {
        return [];
      }
    });
  const currentBlock = await client.getBlockNumber();
  const state = async (blockNumber: bigint) => {
    const read = (
      functionName:
        | 'totalAssets'
        | 'totalReserved'
        | 'totalShares'
        | 'availableCapital'
        | 'feeRecipient'
        | 'claimsAuthority',
    ) =>
      client.readContract({
        address: manifest.insurancePool,
        abi: insurancePoolAbi,
        functionName,
        blockNumber,
      });
    const policy = await client.readContract({
      address: manifest.insurancePool,
      abi: insurancePoolAbi,
      functionName: 'policies',
      args: [policyId],
      blockNumber,
    });
    const feeRecipient = (await read('feeRecipient')) as `0x${string}`;
    const holders = [...new Set([policy[2], feeRecipient])];
    const shares = await Promise.all(
      holders.map(async (holder) => ({
        holder,
        shares: await client.readContract({
          address: manifest.insurancePool,
          abi: insurancePoolAbi,
          functionName: 'sharesOf',
          args: [holder],
          blockNumber,
        }),
      })),
    );
    return {
      blockNumber,
      totalAssets: await read('totalAssets'),
      totalReserved: await read('totalReserved'),
      totalShares: await read('totalShares'),
      availableCapital: await read('availableCapital'),
      feeRecipient,
      claimsAuthority: await read('claimsAuthority'),
      policy,
      shares,
      loss: await client.readContract({
        address: manifest.insurancePool,
        abi: insurancePoolAbi,
        functionName: 'losses',
        args: [lossKey],
        blockNumber,
      }),
      settled: await client.readContract({
        address: manifest.insurancePool,
        abi: insurancePoolAbi,
        functionName: 'settledClaims',
        args: [claimId],
        blockNumber,
      }),
      poolUsdc: await client.readContract({
        address: manifest.usdc,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [manifest.insurancePool],
        blockNumber,
      }),
      beneficiaryUsdc: await client.readContract({
        address: manifest.usdc,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: [beneficiary],
        blockNumber,
      }),
    };
  };
  const before = await state(receipt.blockNumber - 1n);
  const after = await state(receipt.blockNumber);
  const current = await state(currentBlock);
  const checks = {
    chain: (await client.getChainId()) === 5042002,
    receiptSuccess: receipt.status === 'success',
    sentToPool: tx.to?.toLowerCase() === manifest.insurancePool.toLowerCase(),
    authority: tx.from.toLowerCase() === String(before.claimsAuthority).toLowerCase(),
    transfer: transfers.some(
      (t) =>
        t.from.toLowerCase() === manifest.insurancePool.toLowerCase() &&
        t.to.toLowerCase() === beneficiary.toLowerCase() &&
        t.value === amount,
    ),
    beneficiaryDelta: after.beneficiaryUsdc - before.beneficiaryUsdc === amount,
    assetsDelta: BigInt(before.totalAssets) - BigInt(after.totalAssets) === amount,
    reservationDelta: BigInt(before.totalReserved) - BigInt(after.totalReserved) === amount,
    sharesUnchanged: before.totalShares === after.totalShares,
    currentSolvent:
      BigInt(current.totalAssets) >= BigInt(current.totalReserved) &&
      current.poolUsdc >= BigInt(current.totalAssets),
    currentSettled: current.settled,
    currentLossPaid:
      current.loss[2] === event.args.lossPaidTotal && current.loss[1] === event.args.lossCap,
  };
  const report = {
    verifiedAt: new Date().toISOString(),
    method: 'Public read-only RPC; no environment keys loaded; no broadcasts',
    pool: manifest.insurancePool,
    usdc: manifest.usdc,
    hash,
    receipt: {
      status: receipt.status,
      blockNumber: receipt.blockNumber,
      blockHash: receipt.blockHash,
      from: tx.from,
      to: tx.to,
      gasUsed: receipt.gasUsed,
    },
    events,
    transfers,
    checks,
    before,
    after,
    current,
  };
  writeFileSync(
    resolve(root, 'docs/verification/2026-11-17-settlement-readonly.json'),
    JSON.stringify(report, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2) + '\n',
  );
  console.log(JSON.stringify({ saved: true, checks }));
  if (Object.values(checks).some((v) => !v)) process.exitCode = 2;
}
main().catch(() => {
  console.error(
    'Read-only verification failed; no transactions submitted. RPC error details suppressed.',
  );
  process.exitCode = 1;
});
