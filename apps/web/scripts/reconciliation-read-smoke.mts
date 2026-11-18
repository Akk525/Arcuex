import { createPublicClient, http } from 'viem';
import { arcTestnet, ARC_TESTNET_RPC_HTTP } from '@arcuex/chain';
import { insurancePoolAbi } from '@arcuex/onchain';
import { openDatabase } from '@arcuex/persistence';
import { reconcilePolicyBinds, reconciliationRows } from '../src/lib/server/policy-reconciliation';
import { procurementPool } from '../src/lib/server/procurement-chain';
// In-memory database, public RPC only. No deployment database, credentials or broadcasts.
const client = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_TESTNET_RPC_HTTP, { retryCount: 1, timeout: 12000 }),
});
const db = openDatabase();
try {
  const chainId = await client.getChainId();
  if (chainId !== 5042002) throw new Error('Chain mismatch');
  const code = await client.getCode({ address: procurementPool });
  if (!code || code === '0x') throw new Error('Missing pool bytecode');
  const head = await client.getBlockNumber();
  let to = head - 2n,
    from = to - 1999n;
  const historicalPolicy = process.argv[2];
  if (historicalPolicy) {
    if (!/^0x[0-9a-f]{64}$/i.test(historicalPolicy)) throw new Error('Invalid policy');
    let low = 0n,
      high = to;
    const boundAt = async (blockNumber: bigint) =>
      (
        await client.readContract({
          address: procurementPool,
          abi: insurancePoolAbi,
          functionName: 'policies',
          args: [historicalPolicy as `0x${string}`],
          blockNumber,
        })
      )[9];
    if (!(await boundAt(high))) throw new Error('Unknown policy');
    // Find the first authoritative bound block without relying on an invented deployment height.
    while (low < high) {
      const mid = (low + high) / 2n;
      let bound = false;
      const codeAt = await client.getCode({ address: procurementPool, blockNumber: mid });
      if (codeAt && codeAt !== '0x') bound = await boundAt(mid);
      if (bound) high = mid;
      else low = mid + 1n;
    }
    from = low;
    to = low;
  }
  const first = await reconcilePolicyBinds(db, from, to, client);
  const second = await reconcilePolicyBinds(db, from, to, client);
  const rows = reconciliationRows(db);
  console.log(
    JSON.stringify({
      chainId,
      pool: procurementPool,
      head: head.toString(),
      fromBlock: from.toString(),
      toBlock: to.toString(),
      first,
      second,
      records: rows.length,
      statuses: rows.map((r) => r.status),
      verifiedAt: new Date().toISOString(),
    }),
  );
} catch {
  console.error('Read-only public RPC reconciliation smoke failed. No deployment state changed.');
  process.exitCode = 1;
} finally {
  db.close();
}
