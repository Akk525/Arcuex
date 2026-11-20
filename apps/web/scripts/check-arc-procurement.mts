import { insurancePoolAbi } from '@arcuex/onchain';
import { assertCanonicalBlock, confirmedBlock } from '../src/lib/server/arc-confirmation';
import {
  procurementClient,
  procurementPool,
  readProcurementCapacity,
} from '../src/lib/server/procurement-chain';

try {
  const client = procurementClient();
  const anchor = await confirmedBlock(client);
  const available = await readProcurementCapacity(client, anchor);
  await client.readContract({
    address: procurementPool,
    abi: insurancePoolAbi,
    functionName: 'assertSolvent',
    blockNumber: anchor.number,
  });
  const block = await assertCanonicalBlock(client, anchor.number, anchor.hash);
  console.log(
    JSON.stringify({
      source: 'arc-testnet',
      chainId: 5042002,
      pool: procurementPool,
      blockNumber: anchor.number.toString(),
      blockHash: anchor.hash,
      blockTimestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      availableCapitalMicros: available.toString(),
      solvent: true,
    }),
  );
} catch {
  console.error('Arc procurement RPC or pool verification failed.');
  process.exitCode = 1;
}
